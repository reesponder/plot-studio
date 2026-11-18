"""Transactional private store for exam enrolments and certificate verification."""

import json
import re
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

from exam_delivery import (
    ACCESS_SCHEMA, claim_delivery, delivery_counts, delivery_status, finish_delivery,
    manual_deliveries, mark_manual_delivery, queue_delivery, redeem, select_token,
)
from exam_timing import (
    LEASE_MS, TIMING_SCHEMA, UNTIMED_BUILDER_TERMS, adjust_clock, clock, live_lease, now_ms,
)


MAX_ATTEMPTS = 3
QA_PRICE_IDS = {"builder": "internal_builder_trial", "architect": "internal_architect_trial"}
QA_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
SCHEMA = """
    CREATE TABLE IF NOT EXISTS enrolments (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      exam TEXT NOT NULL CHECK (exam IN ('builder', 'architect')),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('awaiting_payment', 'paid', 'passed', 'refunded')),
      terms_version TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      checkout_kind TEXT NOT NULL CHECK (checkout_kind IN ('embedded', 'payment_link')),
      price_id TEXT NOT NULL,
      payment_link_id TEXT,
      amount INTEGER NOT NULL,
      stripe_session TEXT UNIQUE,
      stripe_intent TEXT UNIQUE,
      paid_at TEXT,
      certificate_id TEXT UNIQUE,
      issued_at TEXT
    );
    CREATE TABLE IF NOT EXISTS submissions (
      enrolment TEXT REFERENCES enrolments(id),
      entry INTEGER NOT NULL,
      project_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      result TEXT NOT NULL,
      PRIMARY KEY (enrolment,entry),
      UNIQUE(enrolment, project_hash)
    );
    CREATE TABLE IF NOT EXISTS refunds (
      stripe_intent TEXT PRIMARY KEY,
      refunded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrolment_assessments (
      enrolment TEXT PRIMARY KEY REFERENCES enrolments(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version IN (1,2))
    );
"""


def reply(status, payload):
    print(json.dumps({"status": status, "payload": payload}, ensure_ascii=True, separators=(",", ":")))


def view(db, row):
    if row is None:
        return None
    value = dict(row)
    assignment = db.execute("SELECT version FROM enrolment_assessments WHERE enrolment=?", (row["id"],)).fetchone()
    value["assessment_version"] = assignment["version"] if assignment else 1
    attempt = db.execute("SELECT entry,result FROM submissions WHERE enrolment=? ORDER BY entry DESC LIMIT 1", (row["id"],)).fetchone()
    value["attempts"] = attempt["entry"] if attempt else 0
    value["latest_result"] = json.loads(attempt["result"]) if attempt else None
    value["timer"] = clock(db, row)
    value["email_delivery"] = delivery_status(db, row)
    return value


def select(db, query, parameter):
    return db.execute("SELECT * FROM enrolments WHERE " + query, (parameter,)).fetchone()


def assign_assessment(db, enrolment, version):
    db.execute("INSERT INTO enrolment_assessments (enrolment,version) VALUES (?,?)", (enrolment, version))


def is_test(row):
    return row["price_id"] in QA_PRICE_IDS.values()


def create_trial(db, data, exam):
    patterns = {"id": r"exam_enr_[a-f0-9]{32}", "tokenHash": r"[a-f0-9]{64}", "inviteNonce": r"[A-Za-z0-9_-]{24}"}
    if any(not isinstance(data.get(key), str) or not re.fullmatch(pattern, data[key]) for key, pattern in patterns.items()):
        return reply(422, {"error": "The internal enrolment identifiers are invalid."})
    if any(not isinstance(data.get(key), str) or not data[key].strip() for key in ("name", "email", "termsVersion", "acceptedAt")):
        return reply(422, {"error": "The internal enrolment details are incomplete."})
    at = data.get("atMs")
    version = data.get("assessmentVersion", 1)
    if type(at) is not int or at <= 0 or data["termsVersion"] in UNTIMED_BUILDER_TERMS or type(version) is not int or version not in (1, 2):
        return reply(422, {"error": "Use the current timed assessment and a valid timestamp."})
    db.execute("""INSERT INTO enrolments
                  (id,token_hash,exam,name,email,state,terms_version,accepted_at,checkout_kind,price_id,amount,paid_at)
                  VALUES (?,?,?,?,?,'paid',?,?,'embedded',?,0,?)""",
               (data["id"], data["tokenHash"], exam, data["name"], data["email"], data["termsVersion"],
                data["acceptedAt"], QA_PRICE_IDS[exam], data["acceptedAt"]))
    assign_assessment(db, data["id"], version)
    db.execute("""INSERT INTO exam_access_delivery
                  (enrolment,nonce,created_ms,expires_ms,sent_ms,next_attempt_ms) VALUES (?,?,?,?,?,?)""",
               (data["id"], data["inviteNonce"], at, at + QA_INVITE_LIFETIME_MS, at, at))
    return reply(201, {"created": True})


def activate(db, data):
    row = select(db, "id=?", data["id"])
    if not row or row["state"] != "awaiting_payment":
        return reply(200, {"changed": False})
    if row["stripe_session"] and row["stripe_session"] != data["session"]:
        return reply(200, {"changed": False})
    refunded = db.execute("SELECT 1 FROM refunds WHERE stripe_intent=?", (data["intent"],)).fetchone()
    affected = db.execute(
        "UPDATE OR IGNORE enrolments SET stripe_session=?, stripe_intent=?, paid_at=?, state=? WHERE id=?",
        (data["session"], data["intent"], data["at"], "refunded" if refunded or data.get("refunded") else "paid", row["id"]),
    )
    if affected.rowcount == 1 and not refunded and not data.get("refunded"):
        queue_delivery(db, row, data.get("inviteNonce"), data.get("atMs", now_ms()))
    return reply(200, {"changed": affected.rowcount == 1})


def require_access(db, token_hash):
    enrolment = select_token(db, token_hash)
    if not enrolment:
        return None, 404, "Enrolment not found."
    if not enrolment["access_granted"]:
        return None, 403, "Open the access link sent to your checkout email."
    return enrolment, None, None


def reserve_submission(db, data):
    enrolment, status, message = require_access(db, data["tokenHash"])
    if not enrolment:
        return reply(status, {"error": message})
    state = view(db, enrolment)
    if enrolment["state"] == "passed":
        return reply(200, {"reserved": False, "enrolment": state})
    if enrolment["state"] != "paid":
        return reply(409, {"error": "The assessment requires a confirmed payment."})
    enrolment_id = enrolment["id"]
    duplicate = db.execute("SELECT 1 FROM submissions WHERE enrolment=? AND project_hash=?",
                           (enrolment_id, data["projectHash"])).fetchone()
    if duplicate:
        return reply(200, {"reserved": False, "enrolment": state})
    if state["attempts"] >= MAX_ATTEMPTS:
        return reply(409, {"error": "All three scored submissions for this enrolment have been used."})
    at = now_ms()
    if live_lease(db, enrolment_id, at):
        return reply(409, {"error": "A submission for this enrolment is already being graded."})
    accepted = min(data["acceptedMs"], at)
    received_clock = clock(db, enrolment, accepted)
    if received_clock is not None and received_clock["state"] != "running":
        states = {
            "not_started": "Start the exam before submitting your project.",
            "paused": "Resume the exam before submitting your project.",
            "expired": "Your submission arrived after the working time ended.",
            "complete": "This timed exam has ended.",
        }
        return reply(409, {"error": states[received_clock["state"]]})
    db.execute("""
        INSERT INTO exam_submission_leases VALUES (?,?,?,?,?)
        ON CONFLICT(enrolment) DO UPDATE SET lease=excluded.lease,project_hash=excluded.project_hash,
            accepted_ms=excluded.accepted_ms,expires_ms=excluded.expires_ms
    """, (enrolment_id, data["lease"], data["projectHash"], accepted, at + LEASE_MS))
    return reply(200, {"reserved": True})


def record_submission(db, data):
    enrolment, status, message = require_access(db, data["tokenHash"])
    if not enrolment:
        return reply(status, {"error": message})
    if enrolment["state"] != "paid":
        return reply(409, {"error": "This enrolment is no longer accepting exam submissions."})
    row = view(db, enrolment)
    lease = db.execute("SELECT * FROM exam_submission_leases WHERE enrolment=? AND lease=?",
                       (row["id"], data["lease"])).fetchone()
    if not lease or lease["project_hash"] != data["projectHash"]:
        return reply(409, {"error": "The submission reservation expired. Try again from the exam page."})
    if row["attempts"] >= MAX_ATTEMPTS:
        return reply(409, {"error": "All three scored submissions for this enrolment have been used."})
    result = data["result"]
    db.execute("INSERT INTO submissions VALUES (?,?,?,?,?)", (
        row["id"], row["attempts"] + 1, data["projectHash"], data["at"], json.dumps(result, separators=(",", ":")),
    ))
    if result["passed"] and not is_test(row) and data["publishCertificate"]:
        db.execute("UPDATE enrolments SET state='passed', certificate_id=?, issued_at=? WHERE id=?",
                   (data["certificateId"], data["at"], row["id"]))
    elif result["passed"]:
        db.execute("UPDATE enrolments SET state='passed' WHERE id=?", (row["id"],))
    if result["passed"] or row["attempts"] + 1 >= MAX_ATTEMPTS:
        db.execute("UPDATE exam_timers SET completed_ms=? WHERE enrolment=?", (lease["accepted_ms"], row["id"]))
    db.execute("DELETE FROM exam_submission_leases WHERE enrolment=? AND lease=?", (row["id"], data["lease"]))
    return reply(200, view(db, select_token(db, data["tokenHash"])))


def perform(db, operation, data):
    if operation == "token":
        return reply(200, view(db, select_token(db, data["tokenHash"])))
    if operation == "reference":
        return reply(200, view(db, select(db, "id=?", data["id"])))
    if operation == "certificate":
        row = db.execute("SELECT * FROM enrolments WHERE certificate_id=? AND state='passed'", (data["id"],)).fetchone()
        if row is not None and is_test(row):
            return reply(200, None)
        return reply(200, view(db, row))
    if operation == "qa_builder_create":
        return create_trial(db, data, "builder")
    if operation == "qa_architect_create":
        return create_trial(db, data, "architect")
    if operation == "create":
        version = data.get("assessmentVersion", 1)
        if type(version) is not int or version not in (1, 2):
            return reply(422, {"error": "Unknown assessment version."})
        db.execute("""INSERT INTO enrolments
                      (id,token_hash,exam,name,email,state,terms_version,accepted_at,checkout_kind,price_id,payment_link_id,amount)
                      VALUES (?,?,?,?,?,'awaiting_payment',?,?,?,?,?,?)""",
                   (data["id"], data["tokenHash"], data["exam"], data["name"], data["email"], data["termsVersion"],
                    data["acceptedAt"], data["checkoutKind"], data["priceId"], data.get("paymentLinkId"), data["amount"]))
        assign_assessment(db, data["id"], version)
        return reply(201, {"created": True})
    if operation == "checkout_session":
        changed = db.execute("UPDATE enrolments SET stripe_session=? WHERE id=? AND stripe_session IS NULL",
                             (data["session"], data["id"]))
        return reply(200, {"changed": changed.rowcount == 1})
    if operation == "discard":
        db.execute("DELETE FROM enrolments WHERE id=? AND state='awaiting_payment' AND stripe_session IS NULL", (data["id"],))
        return reply(200, {"discarded": True})
    if operation == "activate":
        return activate(db, data)
    if operation == "refund":
        row = select(db, "stripe_intent=?", data["intent"])
        if row or data.get("certificationPayment"):
            db.execute("INSERT OR IGNORE INTO refunds VALUES (?,?)", (data["intent"], data["at"]))
        if row:
            db.execute("UPDATE enrolments SET state='refunded' WHERE stripe_intent=?", (data["intent"],))
        return reply(200, {"changed": bool(row)})
    if operation == "reserve_submission":
        return reserve_submission(db, data)
    if operation == "submission":
        return record_submission(db, data)
    if operation == "release_submission":
        db.execute("DELETE FROM exam_submission_leases WHERE lease=?", (data["lease"],))
        return reply(200, {"released": True})
    if operation == "clock":
        row, status, message = require_access(db, data["tokenHash"])
        if not row:
            return reply(status, {"error": message})
        error = adjust_clock(db, row, data["action"])
        if error:
            return reply(409, {"error": error})
        return reply(200, view(db, select_token(db, data["tokenHash"])))
    if operation == "redeem":
        row = redeem(db, data["id"], data["nonce"], data["tokenHash"])
        if row is False:
            return reply(409, {"error": "This link has already been used. Open your saved enrolment or enter its recovery code. If you have neither, contact PLOT Studio with your order reference."})
        if row is None:
            return reply(404, {"error": "The exam access link is invalid or has expired."})
        return reply(200, view(db, row))
    if operation == "claim_mail":
        return reply(200, claim_delivery(db, data["lease"]))
    if operation == "finish_mail":
        return reply(200, {"updated": finish_delivery(db, data["enrolment"], data["lease"], data["status"])})
    if operation == "mail_stats":
        return reply(200, delivery_counts(db))
    if operation == "manual_queue":
        return reply(200, manual_deliveries(db))
    if operation == "manual_link":
        return reply(200, manual_deliveries(db, data["enrolment"]))
    if operation == "manual_sent":
        return reply(200, {"updated": mark_manual_delivery(db, data["enrolment"])})
    if operation == "publish":
        row, status, message = require_access(db, data["tokenHash"])
        if not row:
            return reply(status, {"error": message})
        if is_test(row):
            return reply(403, {"error": "Internal test attempts cannot issue a certificate."})
        if row["state"] != "passed":
            return reply(409, {"error": "Pass the assessment before issuing your certificate."})
        if row["certificate_id"] is None:
            db.execute("UPDATE enrolments SET certificate_id=?, issued_at=? WHERE id=?",
                       (data["certificateId"], data["at"], row["id"]))
        return reply(200, view(db, select_token(db, data["tokenHash"])))
    raise ValueError("Unsupported storage operation")


def main():
    filename, operation = sys.argv[1:3]
    data = json.load(sys.stdin)
    Path(filename).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(filename, timeout=8)) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL").fetchone()
        db.executescript(SCHEMA + TIMING_SCHEMA + ACCESS_SCHEMA)
        if operation in {"token", "reference", "certificate", "mail_stats", "manual_queue", "manual_link"}:
            perform(db, operation, data)
        else:
            with db:
                db.execute("BEGIN IMMEDIATE")
                perform(db, operation, data)


if __name__ == "__main__":
    main()
