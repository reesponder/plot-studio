import io
import json
import sqlite3
import sys
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import mkdtemp
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "outputs" / "plot-studio"))
from exam_delivery import ACCESS_SCHEMA
from exam_store import SCHEMA, perform
from exam_timing import BREAK_MS, TIMING_SCHEMA, WORK_MS


path = Path(mkdtemp(prefix="exam-clock-outbox-", dir=ROOT / "work")) / "exam.sqlite3"


def connect():
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript(SCHEMA + TIMING_SCHEMA + ACCESS_SCHEMA)
    return connection


def run(operation, expected=200, **kwargs):
    log = io.StringIO()
    with redirect_stdout(log), db:
        perform(db, operation, kwargs)
    response = json.loads(log.getvalue())
    assert response["status"] == expected, (operation, response)
    return response["payload"]


def enroll(id, exam, terms):
    run("create", 201, id=id, tokenHash=id + "-public", exam=exam, name="Fixture Name",
        email="candidate@example.test", termsVersion=terms, acceptedAt="fixture", checkoutKind="embedded",
        priceId="price_fixture", amount=15000)
    run("activate", id=id, session="cs_" + id, intent="pi_" + id, at="fixture", atMs=current,
        inviteNonce="nonce" + "0123456789abcdefghijkl"[:19])


db = connect()
current = 1800000000000
with (
    patch("exam_timing.now_ms", side_effect=lambda: current),
    patch("exam_delivery.now_ms", side_effect=lambda: current),
    patch("exam_store.now_ms", side_effect=lambda: current),
):
    enrol = "exam-fixture"
    enroll(enrol, "architect", "2026-11-16-certification-r2")
    assert run("token", tokenHash=enrol+"-public")["access_granted"] == 0
    assert run("mail_stats") == {"total": 1, "pending": 1, "overdue": 0, "sent": 0}
    first_delivery = run("claim_mail", lease="mail-1")
    assert first_delivery["attempts"] == 1 and run("claim_mail", lease="duplicate") is None
    assert run("finish_mail", enrolment=enrol, lease="mail-1", status="SMTP_REFUSED")["updated"]
    db.close()
    db = connect()
    assert run("claim_mail", lease="too-early") is None
    current += 60_000
    second_delivery = run("claim_mail", lease="mail-2")
    assert second_delivery["attempts"] == 2 and second_delivery["nonce"] == first_delivery["nonce"]
    assert not run("finish_mail", enrolment=enrol, lease="mail-1", status="accepted")["updated"]
    assert run("finish_mail", enrolment=enrol, lease="mail-2", status="accepted")["updated"]
    assert run("mail_stats") == {"total": 1, "pending": 0, "overdue": 0, "sent": 1}
    assert run("claim_mail", lease="already-sent") is None

    token = "workspace"
    claimed = run("redeem", id=enrol, nonce=first_delivery["nonce"], tokenHash=token)
    assert claimed["timer"]["state"] == "not_started"
    run("redeem", 409, id=enrol, nonce=first_delivery["nonce"], tokenHash="another-workspace")
    run("reserve_submission", 409, tokenHash=token, acceptedMs=current, lease="l0", projectHash="fixture")
    started = current
    start = run("clock", tokenHash=token, action="start")["timer"]
    assert start["state"] == "running" and start["workRemainingMs"] == WORK_MS
    current += 30 * 60 * 1000
    paused_at = current
    pause = run("clock", tokenHash=token, action="pause")["timer"]
    assert pause["workRemainingMs"] == WORK_MS - 30 * 60 * 1000
    current = paused_at + BREAK_MS - 1
    before_resume = run("token", tokenHash=token)["timer"]
    assert before_resume["state"] == "paused" and before_resume["workRemainingMs"] == pause["workRemainingMs"]
    run("reserve_submission", 409, tokenHash=token, acceptedMs=current, lease="during-pause", projectHash="fixture")
    current += 1
    on_boundary = run("token", tokenHash=token)["timer"]
    assert on_boundary["state"] == "running" and on_boundary["workRemainingMs"] == pause["workRemainingMs"]
    assert run("clock", tokenHash=token, action="start")["timer"]["startedAt"] == start["startedAt"]
    current += 1000
    assert run("token", tokenHash=token)["timer"]["workRemainingMs"] == pause["workRemainingMs"] - 1000

    cutoff = started + WORK_MS + BREAK_MS
    current = cutoff + 10
    late = run("reserve_submission", 409, tokenHash=token, acceptedMs=cutoff, lease="late", projectHash="late")
    assert "after" in late["error"]
    assert run("reserve_submission", tokenHash=token, acceptedMs=cutoff-1, lease="timely", projectHash="timely")["reserved"]
    run("reserve_submission", 409, tokenHash=token, acceptedMs=cutoff-1, lease="parallel", projectHash="parallel")
    assert run("token", tokenHash=token)["timer"]["submissionInProgress"]
    current += 2000
    final = run("submission", tokenHash=token, result={"passed": True}, projectHash="timely", lease="timely",
                at="fixture", certificateId="PLOT-1234567890ABCDEF11", publishCertificate=True)
    assert final["state"] == "passed" and final["timer"]["state"] == "complete"
    assert final["timer"]["workRemainingMs"] == 1 and not final["timer"]["submissionInProgress"]
    assert run("certificate", id="PLOT-1234567890ABCDEF11")["state"] == "passed"

    enroll("legacy", "builder", "2026-11-16-certification")
    legacy = run("token", tokenHash="legacy-public")
    assert legacy["access_granted"] == 1 and legacy["timer"] is None
    assert run("mail_stats")["total"] == 1
db.close()
print("Clock boundaries, parallel final receipt, late grading, persistent retries, one-time links and legacy compatibility passed.")
