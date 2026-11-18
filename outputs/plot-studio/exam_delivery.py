"""SQLite records for one-time access links and payment-confirmed email delivery."""

from exam_timing import exam_limits, now_ms


LEGACY_TERMS = "2026-11-16-certification"
INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
DELIVERY_LEASE_MS = 90 * 1000
ACCESS_SCHEMA = """
    CREATE TABLE IF NOT EXISTS exam_access_tokens (
      token_hash TEXT PRIMARY KEY,
      enrolment TEXT NOT NULL REFERENCES enrolments(id),
      created_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exam_access_delivery (
      enrolment TEXT PRIMARY KEY REFERENCES enrolments(id),
      nonce TEXT NOT NULL UNIQUE,
      created_ms INTEGER NOT NULL,
      expires_ms INTEGER NOT NULL,
      redeemed_ms INTEGER,
      sent_ms INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_ms INTEGER NOT NULL,
      last_attempt_ms INTEGER,
      failure_code TEXT,
      lease TEXT,
      lease_until_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS exam_delivery_due ON exam_access_delivery(sent_ms,next_attempt_ms);
"""


def select_token(db, token_hash):
    primary = db.execute("""
        SELECT enrolments.*, CASE WHEN terms_version=? THEN 1 ELSE 0 END AS access_granted
        FROM enrolments WHERE token_hash=?
    """, (LEGACY_TERMS, token_hash)).fetchone()
    if primary:
        return primary
    return db.execute("""
        SELECT enrolments.*, 1 AS access_granted
        FROM exam_access_tokens JOIN enrolments ON exam_access_tokens.enrolment=enrolments.id
        WHERE exam_access_tokens.token_hash=?
    """, (token_hash,)).fetchone()


def queue_delivery(db, row, nonce, at):
    if row["terms_version"] == LEGACY_TERMS:
        return
    if not isinstance(nonce, str) or len(nonce) != 24:
        raise ValueError("The access invite could not be created.")
    db.execute("""
        INSERT OR IGNORE INTO exam_access_delivery
          (enrolment,nonce,created_ms,expires_ms,next_attempt_ms) VALUES (?,?,?,?,?)
    """, (row["id"], nonce, at, at + INVITE_LIFETIME_MS, at))


def delivery_status(db, row):
    if row["state"] == "awaiting_payment":
        return "awaiting_payment"
    if row["state"] == "refunded":
        return "refunded"
    entry = db.execute("SELECT sent_ms,redeemed_ms FROM exam_access_delivery WHERE enrolment=?", (row["id"],)).fetchone()
    if not entry:
        return "unavailable"
    return "sent" if entry["sent_ms"] is not None or entry["redeemed_ms"] is not None else "pending"


def redeem(db, enrolment, nonce, token_hash):
    at = now_ms()
    row = db.execute("""
        SELECT exam_access_delivery.expires_ms,exam_access_delivery.redeemed_ms,enrolments.state
        FROM exam_access_delivery JOIN enrolments ON enrolment=enrolments.id
        WHERE enrolment=? AND nonce=?
    """, (enrolment, nonce)).fetchone()
    if not row or row["state"] not in ("paid", "passed") or row["expires_ms"] <= at:
        return None
    if row["redeemed_ms"] is not None:
        return False
    db.execute("INSERT INTO exam_access_tokens VALUES (?,?,?)", (token_hash, enrolment, at))
    db.execute("UPDATE exam_access_delivery SET redeemed_ms=? WHERE enrolment=?", (at, enrolment))
    return select_token(db, token_hash)


def claim_delivery(db, lease):
    at = now_ms()
    item = db.execute("""
        SELECT delivery.enrolment,delivery.nonce,delivery.created_ms,delivery.expires_ms,
               delivery.attempts,learner.email,learner.name,learner.exam,learner.terms_version
        FROM exam_access_delivery AS delivery JOIN enrolments AS learner ON delivery.enrolment=learner.id
        WHERE learner.state IN ('paid','passed') AND delivery.sent_ms IS NULL
          AND delivery.redeemed_ms IS NULL AND delivery.expires_ms>?
          AND delivery.next_attempt_ms<=? AND (delivery.lease_until_ms IS NULL OR delivery.lease_until_ms<=?)
        ORDER BY delivery.next_attempt_ms,delivery.created_ms LIMIT 1
    """, (at, at, at)).fetchone()
    if not item:
        return None
    db.execute("""
        UPDATE exam_access_delivery SET lease=?,lease_until_ms=?,attempts=attempts+1,last_attempt_ms=?
        WHERE enrolment=?
    """, (lease, at + DELIVERY_LEASE_MS, at, item["enrolment"]))
    return {**dict(item), "attempts": item["attempts"] + 1, "timeLimits": exam_limits(item)}


def finish_delivery(db, enrolment, lease, status):
    at = now_ms()
    if status == "accepted":
        update = db.execute("""
            UPDATE exam_access_delivery SET sent_ms=?,lease=NULL,lease_until_ms=NULL,failure_code=NULL
            WHERE enrolment=? AND lease=?
        """, (at, enrolment, lease))
    else:
        # Rapid first retries handle a short connection failure. Subsequent
        # attempts continue over restarts, with a half-hour maximum backoff.
        row = db.execute("SELECT attempts FROM exam_access_delivery WHERE enrolment=? AND lease=?", (enrolment, lease)).fetchone()
        if not row:
            return False
        minutes = min(30, 2 ** min(5, max(0, row["attempts"] - 1)))
        update = db.execute("""
            UPDATE exam_access_delivery SET lease=NULL,lease_until_ms=NULL,failure_code=?,next_attempt_ms=?
            WHERE enrolment=? AND lease=?
        """, (status, at + minutes * 60 * 1000, enrolment, lease))
    return update.rowcount == 1


def delivery_counts(db):
    at = now_ms()
    return dict(db.execute("""
        SELECT COUNT(*) AS total,
            COALESCE(SUM(enrolments.state IN ('paid','passed') AND sent_ms IS NULL AND redeemed_ms IS NULL),0) AS pending,
            COALESCE(SUM(enrolments.state IN ('paid','passed') AND sent_ms IS NULL AND redeemed_ms IS NULL AND ?-created_ms>=86400000),0) AS overdue,
            COALESCE(SUM(sent_ms IS NOT NULL),0) AS sent
        FROM exam_access_delivery JOIN enrolments ON enrolment=enrolments.id
    """, (at,)).fetchone())


def manual_deliveries(db, enrolment=None):
    query = """
        SELECT e.id AS enrolment, e.exam, e.name, e.email, e.paid_at, d.nonce, d.sent_ms, d.expires_ms
        FROM exam_access_delivery AS d JOIN enrolments AS e ON e.id=d.enrolment
        WHERE e.state IN ('paid','passed') AND d.redeemed_ms IS NULL AND d.expires_ms>?
    """
    if enrolment is None:
        rows = db.execute(query + " AND d.sent_ms IS NULL ORDER BY d.created_ms", (now_ms(),))
        return [{key: row[key] for key in row.keys() if key != "nonce"} for row in rows]
    item = db.execute(query + " AND e.id=?", (now_ms(), enrolment)).fetchone()
    return dict(item) if item else None


def mark_manual_delivery(db, enrolment):
    item = manual_deliveries(db, enrolment)
    if item is None:
        return False
    db.execute("UPDATE exam_access_delivery SET sent_ms=COALESCE(sent_ms,?), failure_code=NULL, lease=NULL, lease_until_ms=NULL WHERE enrolment=?",
               (now_ms(), enrolment))
    return True
