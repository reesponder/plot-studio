import io
import json
import sqlite3
import sys
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "outputs" / "plot-studio"))
from exam_delivery import ACCESS_SCHEMA
from exam_store import SCHEMA, perform
from exam_timing import TIMING_SCHEMA


MINUTE = 60_000
HOUR = 60 * MINUTE
R2 = "2026-11-16-certification-r2"
R3 = "2026-11-16-certification-r3"
now = 1_800_000_000_000
connection = sqlite3.connect(":memory:")
connection.row_factory = sqlite3.Row
connection.execute("PRAGMA foreign_keys = ON")
connection.executescript(SCHEMA + ACCESS_SCHEMA + TIMING_SCHEMA)


def run(operation, expected=200, **arguments):
    output = io.StringIO()
    with connection, redirect_stdout(output):
        perform(connection, operation, arguments)
    result = json.loads(output.getvalue())
    assert result["status"] == expected, (operation, expected, result)
    return result["payload"]


def enrol(identifier, exam, version):
    checkout = identifier + "-checkout"
    token = identifier + "-workspace"
    nonce = identifier.ljust(24, "0")
    run("create", 201, id=identifier, tokenHash=checkout, exam=exam, name="Candidate Fixture",
        email="candidate@example.test", termsVersion=version, acceptedAt="fixture",
        checkoutKind="embedded", priceId="price_fixture", amount=8000 if exam == "builder" else 15000)
    assert run("activate", id=identifier, session="cs_" + identifier, intent="pi_" + identifier,
               at="fixture", atMs=now, inviteNonce=nonce)["changed"]
    assert not run("token", tokenHash=checkout)["access_granted"]
    return token, run("redeem", id=identifier, nonce=nonce, tokenHash=token)["timer"]


def clock(token, action=None, expected=200):
    if action is None:
        return run("token", expected, tokenHash=token)["timer"]
    row = run("clock", expected, tokenHash=token, action=action)
    return row["timer"] if expected == 200 else row["error"]


def reserve(token, name, expected=200):
    return run("reserve_submission", expected, tokenHash=token, acceptedMs=now, lease=name, projectHash=name)


with (patch("exam_timing.now_ms", side_effect=lambda: now),
      patch("exam_delivery.now_ms", side_effect=lambda: now),
      patch("exam_store.now_ms", side_effect=lambda: now)):
    builder, initial = enrol("r3b", "builder", R3)
    assert initial["state"] == "not_started"
    assert (initial["workDurationMs"], initial["breakDurationMs"], initial["maxBreaks"]) == (6 * HOUR, HOUR, 1)
    assert "Start" in reserve(builder, "premature", 409)["error"]
    assert "Start" in clock(builder, "pause", 409)
    starting = now
    started = clock(builder, "start")
    assert started["state"] == "running" and started["workRemainingMs"] == 6 * HOUR
    now += 20 * MINUTE
    paused = clock(builder, "pause")
    assert paused["state"] == "paused" and paused["breaksUsed"] == 1
    now += 16 * MINUTE
    assert clock(builder) == {**paused, "serverNowMs": now}
    assert "Resume" in reserve(builder, "paused", 409)["error"]
    resumed = clock(builder, "resume")
    assert resumed["state"] == "running" and resumed["workRemainingMs"] == 6 * HOUR - 20 * MINUTE
    assert "no exam breaks remaining" in clock(builder, "pause", 409)
    now = starting + 6 * HOUR + 16 * MINUTE - 1
    assert clock(builder)["workRemainingMs"] == 1
    assert reserve(builder, "before-deadline")["reserved"]
    run("release_submission", lease="before-deadline")
    now += 1
    assert clock(builder)["state"] == "expired"
    assert "after" in reserve(builder, "at-deadline", 409)["error"]

    automatic, _ = enrol("r3a", "builder", R3)
    started = clock(automatic, "start")
    now += 2 * MINUTE
    paused = clock(automatic, "pause")
    now += HOUR - 1
    assert clock(automatic)["state"] == "paused"
    assert "Resume" in reserve(automatic, "last-paused-ms", 409)["error"]
    now += 1
    assert clock(automatic)["state"] == "running"
    assert clock(automatic)["workRemainingMs"] == paused["workRemainingMs"]
    assert reserve(automatic, "first-automatic-resume-ms")["reserved"]

    legacy, timer = enrol("r2b", "builder", R2)
    assert timer is None
    assert "unavailable" in clock(legacy, "start", 409)
    assert reserve(legacy, "legacy-no-start-required")["reserved"]

    for label, version in (("r2arch", R2), ("r3arch", R3)):
        architect, initial = enrol(label, "architect", version)
        assert (initial["workDurationMs"], initial["breakDurationMs"], initial["maxBreaks"]) == (10 * HOUR, 45 * MINUTE, 3)
        assert clock(architect, "start")["state"] == "running"
        for count in range(1, 4):
            assert clock(architect, "pause")["breaksUsed"] == count
            now += 5 * MINUTE
            assert clock(architect, "resume")["workRemainingMs"] == 10 * HOUR
        assert "no exam breaks remaining" in clock(architect, "pause", 409)

connection.close()
print("Builder r3, Builder r2 compatibility and Architect r2/r3 timing passed.")
