"""Persistent working time for certification assessments."""

import time
from datetime import datetime, timezone


MINUTE_MS = 60 * 1000
WORK_MS = 10 * 60 * MINUTE_MS
BREAK_MS = 45 * MINUTE_MS
MAX_BREAKS = 3
EXAM_LIMITS = {
    "builder": (6 * 60 * MINUTE_MS, 60 * MINUTE_MS, 1),
    "architect": (WORK_MS, BREAK_MS, MAX_BREAKS),
}
UNTIMED_BUILDER_TERMS = {"2026-11-16-certification", "2026-11-16-certification-r2"}
LEASE_MS = 120 * 1000
TIMING_SCHEMA = """
    CREATE TABLE IF NOT EXISTS exam_timers (
      enrolment TEXT PRIMARY KEY REFERENCES enrolments(id),
      started_ms INTEGER NOT NULL,
      completed_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS exam_breaks (
      enrolment TEXT REFERENCES enrolments(id),
      ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
      started_ms INTEGER NOT NULL,
      resumed_ms INTEGER,
      PRIMARY KEY (enrolment, ordinal)
    );
    CREATE TABLE IF NOT EXISTS exam_submission_leases (
      enrolment TEXT PRIMARY KEY REFERENCES enrolments(id),
      lease TEXT NOT NULL,
      project_hash TEXT NOT NULL,
      accepted_ms INTEGER NOT NULL,
      expires_ms INTEGER NOT NULL
    );
"""


def now_ms():
    return time.time_ns() // 1_000_000


def iso_time(value):
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def live_lease(db, enrolment, at):
    return db.execute("SELECT * FROM exam_submission_leases WHERE enrolment=? AND expires_ms>?", (enrolment, at)).fetchone()


def exam_limits(row):
    if row["exam"] == "builder" and row["terms_version"] in UNTIMED_BUILDER_TERMS:
        return None
    return EXAM_LIMITS[row["exam"]]


def clock(db, row, at=None):
    if row["state"] not in ("paid", "passed"):
        return None
    limits = exam_limits(row)
    if limits is None:
        return None
    work_ms, break_ms, max_breaks = limits
    instant = now_ms() if at is None else at
    state = db.execute("SELECT * FROM exam_timers WHERE enrolment=?", (row["id"],)).fetchone()
    started = state["started_ms"] if state and state["started_ms"] <= instant else None
    remaining, paused_until, deadline, count = work_ms, None, None, 0
    complete = row["state"] == "passed" or bool(state and state["completed_ms"] is not None)
    phase = "complete" if complete else "not_started"
    if started is not None:
        accounted_at = min(instant, state["completed_ms"]) if state["completed_ms"] is not None else instant
        breaks = db.execute(
            "SELECT started_ms,resumed_ms FROM exam_breaks WHERE enrolment=? AND started_ms<=? ORDER BY ordinal",
            (row["id"], accounted_at),
        ).fetchall()
        pause_ms = 0
        for entry in breaks:
            ending = entry["resumed_ms"] if entry["resumed_ms"] is not None else entry["started_ms"] + break_ms
            pause_ms += max(0, min(ending, accounted_at) - entry["started_ms"])
            if accounted_at < ending:
                paused_until = ending
        count = len(breaks)
        computed_deadline = started + work_ms + pause_ms
        remaining = max(0, min(work_ms, computed_deadline - accounted_at))
        if not complete:
            if remaining == 0:
                phase = "expired"
            elif paused_until is not None:
                phase = "paused"
            else:
                phase = "running"
                deadline = computed_deadline
    return {
        "state": phase,
        "serverNowMs": instant,
        "startedAt": iso_time(started),
        "activeDeadlineAt": iso_time(deadline),
        "breakEndsAt": iso_time(paused_until) if phase == "paused" else None,
        "workRemainingMs": remaining if not complete or started is not None else 0,
        "workDurationMs": work_ms,
        "breaksUsed": count,
        "maxBreaks": max_breaks,
        "breakDurationMs": break_ms,
        "submissionInProgress": bool(live_lease(db, row["id"], instant)),
    }


def adjust_clock(db, row, action):
    at = now_ms()
    state = clock(db, row, at)
    if state is None:
        return "The exam timer is unavailable for this enrolment."
    phase = state["state"]
    if phase == "complete":
        return None
    if action == "start":
        if phase == "not_started":
            db.execute("INSERT OR IGNORE INTO exam_timers (enrolment,started_ms) VALUES (?,?)", (row["id"], at))
        return None
    if phase == "not_started":
        return "Start the exam before taking a break."
    if state["submissionInProgress"]:
        return "Wait for the current submission to finish before adjusting the timer."
    if action == "pause":
        if phase == "paused":
            return None
        if phase == "expired":
            return "The working time for this exam has ended."
        if state["breaksUsed"] >= state["maxBreaks"]:
            return "There are no exam breaks remaining."
        db.execute("INSERT INTO exam_breaks (enrolment,ordinal,started_ms) VALUES (?,?,?)",
                   (row["id"], state["breaksUsed"] + 1, at))
    elif action == "resume" and phase == "paused":
        db.execute("UPDATE exam_breaks SET resumed_ms=? WHERE enrolment=? AND ordinal=? AND resumed_ms IS NULL",
                   (at, row["id"], state["breaksUsed"]))
    return None
