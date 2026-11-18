"""Assess Workshop Operations with isolated SQLite stores and training credentials."""

from contextlib import closing
from copy import deepcopy
from hashlib import sha256
import hmac
import io
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import sys
from tempfile import TemporaryDirectory
import time
from unittest.mock import patch
from urllib.parse import urlencode

import runtime
from backend_engine import LIMITS, OPERATIONS, run_workflow, validate_backend
from runtime import ApiError, Database


REQUESTS = "/api/workshop-requests"
LOOKUP = REQUESTS + "/:id"
EVENTS = "/api/workshop-events"
QUEUE = "/api/workshop-queue"
SUMMARY = "/api/workshop-summary"
METHODS = ("list", "read", "create", "update", "delete")
DOMAIN = "example.test"
STATUSES = {"new", "approved", "rejected"}
CLIENT_ERROR = {400, 422}
FIELDS = {"email": ("email", True), "seats": ("integer", True), "status": ("text", True),
          "event id": ("text", False), "event digest": ("text", False)}
UNAVAILABLE_OPERATIONS = {"call-connector", "run-task", "run-package", "run-python"}
HANDLED = (ApiError, TypeError, ValueError, RuntimeError, KeyError, OSError, sqlite3.Error, RecursionError)


def table_for(tables):
    if not isinstance(tables, list) or len(tables) != 1 or not isinstance(tables[0], dict):
        return None, {}
    table = tables[0]
    name = table.get("name")
    if not isinstance(name, str) or name.strip().lower() != "workshop requests" or not isinstance(table.get("fields"), list):
        return None, {}
    fields = {}
    for field in table["fields"]:
        label = field.get("name") if isinstance(field, dict) else None
        if not isinstance(label, str):
            return None, {}
        label = label.strip().lower()
        if label not in FIELDS:
            continue
        kind, required = FIELDS[label]
        if field.get("type") != kind or (field.get("required") is True) != required or label in fields:
            return None, {}
        fields[label] = field["id"]
    return (table, fields) if fields.keys() == FIELDS.keys() else (None, {})


def safe_backend(backend):
    if not isinstance(backend, dict) or backend.get("pythonScripts") or backend.get("packages"):
        return False
    routes = backend.get("routes")
    if not isinstance(routes, list) or len(routes) > 10:
        return False
    for route in routes:
        if not isinstance(route, dict) or route.get("keySecret", "PLOT_API_KEY") != "PLOT_API_KEY":
            return False
        steps = route.get("steps")
        if not isinstance(steps, list) or len(steps) > 80:
            return False
        for step in steps:
            kind = step.get("type") if isinstance(step, dict) else None
            if not isinstance(kind, str) or kind not in OPERATIONS or kind.startswith("rust-") or kind in UNAVAILABLE_OPERATIONS:
                return False
    return not any(item["severity"] == "error" for item in validate_backend(backend))


def exact(response, status, expected):
    actual_status, media, body = response
    return actual_status == status and media.startswith("application/json") and body == expected


def reject(response, codes=CLIENT_ERROR):
    return response[0] in codes and response[1].startswith("application/json") and isinstance(response[2], dict)


def safe_error(response, codes, protected):
    if not reject(response, codes):
        return False
    body = response[2]
    error = body.get("error")
    message = error.get("message") if isinstance(error, dict) else error
    serialized = json.dumps(body, ensure_ascii=True)
    return isinstance(message, str) and bool(message.strip()) and all(not item or item not in serialized for item in protected)


def json_text(body):
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")) if body is not None else ""


class Workshop:
    def __init__(self, backend, table, fields, path, deadline, *, initialize=True):
        self.backend = backend
        self.table = table["id"]
        self.schema = {"version": 1, "tables": [{**table, "rows": []}]}
        self.fields = fields
        self.deadline = deadline
        self.database = Database(self.schema, path, initialize=initialize)
        self.operator = secrets.token_urlsafe(28)
        self.signing = secrets.token_urlsafe(28)
        self.auth = {"Authorization": "Bearer " + self.operator}
        self.key_header = {"X-API-Key": self.operator}
        self.calls = []
        self.trace = []
        self.write_failure = False

    def db_call(self, query):
        self.calls.append(deepcopy(query))
        if self.write_failure and query["operation"] == "create":
            raise ApiError("WRITE_REJECTED", "private sqlite details should never be disclosed", 409)
        return self.database.query(query, internal=True)

    def request(self, method, path, body=None, *, raw=None, query=None, headers=None):
        if time.monotonic() >= self.deadline:
            raise RuntimeError("The assessment backend reached its execution budget.")
        self.calls = []
        result = run_workflow(self.backend, {"method": method, "path": path, "body": body, "query": query or {},
                              "headers": headers or {}, "raw": json_text(body) if raw is None else raw}, {
                                  "db": self.db_call,
                                  "secret": {"PLOT_API_KEY": self.operator, "PLOT_SECRET_WEBHOOK": self.signing}.get,
                              })
        self.trace = result["trace"]
        return result["status"], result["headers"].get("content-type", ""), result["body"]

    def deployed(self, method, path, body=None, *, raw=None, query=None, headers=None):
        if time.monotonic() >= self.deadline:
            raise RuntimeError("The assessment backend reached its execution budget.")
        config = self.database.path.with_suffix(".workflow.json")
        if not config.exists():
            config.write_text(json.dumps(self.backend, ensure_ascii=True), encoding="utf-8")
        content = (json_text(body) if raw is None else raw).encode("utf-8")
        environ = {"REQUEST_METHOD": method, "PATH_INFO": path, "QUERY_STRING": urlencode(query or {}, doseq=True),
                   "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": str(len(content)), "wsgi.input": io.BytesIO(content)}
        environ.update({"HTTP_" + key.upper().replace("-", "_"): value for key, value in (headers or {}).items()})
        responses = []
        with patch.object(runtime, "BACKEND_CONFIG", config), patch.object(runtime, "DB", self.database), patch.dict(os.environ, {
            "PLOT_API_KEY": self.operator, "PLOT_SECRET_WEBHOOK": self.signing,
        }, clear=True):
            response = b"".join(runtime.application(environ, lambda status, headers: responses.append((status, dict(headers)))))
        status, response_headers = responses[0]
        media = response_headers.get("Content-Type", "")
        return int(status.split()[0]), media, json.loads(response) if response and media.startswith("application/json") else response.decode("utf-8")

    def rows(self):
        return self.database.query({"operation": "list", "table": self.table}, internal=True)

    def row(self, identity):
        return self.database.query({"operation": "read", "table": self.table, "id": identity}, internal=True)

    def seed(self, status="new", seats=3):
        return self.database.query({"operation": "create", "table": self.table, "data": {
            self.fields["email"]: mail(), self.fields["seats"]: seats, self.fields["status"]: status,
        }}, internal=True)

    def public_row(self, row):
        return {"id": row["id"], "status": row[self.fields["status"]], "seats": row[self.fields["seats"]]}

    def groups(self):
        values = {}
        for row in self.rows():
            status = row[self.fields["status"]]
            item = values.setdefault(status, {"key": status, "count": 0, "sum": 0})
            item["count"] += 1
            item["sum"] += row[self.fields["seats"]]
        return list(values.values())

    def writes(self):
        return [call for call in self.calls if call["operation"] in {"create", "update", "delete"}]

    def protected(self, rows):
        return [self.operator, self.signing, "@example.test", "PLOT_SECRET_", "PLOT_API_KEY",
                *(row[self.fields["email"]] for row in rows)]

    def signature(self, raw, valid=True, prefixed=False):
        key = self.signing if valid else self.signing + "-wrong"
        mac = hmac.new(key.encode("utf-8"), raw.encode("utf-8"), sha256).hexdigest()
        return {"X-Workshop-Signature": ("sha256=" if prefixed else "") + mac}

    def decision(self, body, *, raw=None, valid=True, prefixed=False, deployed=False):
        raw = event_raw(body) if raw is None else raw
        transport = self.deployed if deployed else self.request
        return transport("POST", EVENTS, body, raw=raw, headers=self.signature(raw, valid, prefixed))


def mail():
    return "assessment+" + secrets.token_hex(7) + "@" + DOMAIN


def event_id():
    return "workshop." + secrets.token_hex(12)


def event_raw(body):
    return json.dumps(body, ensure_ascii=False, indent=1) + "\n"


def route_is(backend, method, path, access):
    return any(route["method"] == method and route["path"] == path and route.get("access", "public") == access for route in backend["routes"])


def intake(workshop, checks):
    fields = workshop.fields
    baseline = workshop.rows()
    good = [{"email": mail(), "seats": 1}, {"email": mail(), "seats": "6"}]
    created = []
    minimal = []
    for sample in good:
        response = workshop.request("POST", REQUESTS, sample)
        row = next((row for row in workshop.rows() if row[fields["email"]] == sample["email"]), None)
        created.append(bool(row and type(row[fields["seats"]]) is int and row[fields["seats"]] == int(sample["seats"])))
        minimal.append(bool(row and row[fields["status"]] == "new" and exact(response, 201, {"id": row["id"], "status": "new"})))
    persisted = workshop.rows()
    checks["intake-route"] = route_is(workshop.backend, "POST", REQUESTS, "public") and all(minimal) and len(persisted) == len(baseline) + 2 and all(
        workshop.request(method, REQUESTS)[0] == 405 for method in ("GET", "PUT"))
    checks["intake-integers"] = all(created) and len(persisted) == len(baseline) + 2

    def invalid(payload):
        response = workshop.request("POST", REQUESTS, payload)
        return reject(response) and not workshop.writes() and workshop.rows() == persisted

    checks["intake-email"] = all(minimal) and all(invalid(sample) for sample in (
        {"seats": 2}, {"email": "", "seats": 2}, {"email": "wrong-address", "seats": 2},
    ))
    checks["intake-bounds"] = all(minimal) and all(invalid(sample) for sample in [
        {"email": mail()}, *({"email": mail(), "seats": value} for value in (0, 7, 2.5, "", "many", False, True)),
    ])
    tainted = {"email": mail(), "seats": 2, "status": "approved"}
    attempted = workshop.request("POST", REQUESTS, tainted)
    after = workshop.rows()
    appended = after[len(persisted):]
    checks["intake-receipt"] = all(minimal) and (
        reject(attempted) and after == persisted or len(appended) == 1 and after[:len(persisted)] == persisted and
        appended[0][fields["status"]] == "new" and appended[0][fields["email"]] == tainted["email"] and
        exact(attempted, 201, {"id": appended[0]["id"], "status": "new"})
    )
    workshop.write_failure = True
    try:
        response = workshop.request("POST", REQUESTS, {"email": mail(), "seats": 2})
        checks["write-failure"] = safe_error(response, {400, 409, 422, 500, 502, 503}, ["private sqlite details", *workshop.protected(after)]) and \
            any(call["operation"] == "create" and call["table"] == workshop.table for call in workshop.writes()) and workshop.rows() == after
    finally:
        workshop.write_failure = False


def operator(workshop, checks):
    checks["summary"] = route_is(workshop.backend, "GET", SUMMARY, "key") and exact(
        workshop.request("GET", SUMMARY, headers=workshop.auth), 200, {"groups": []})
    established = {status: [workshop.seed(status, seats) for seats in seat_values] for status, seat_values in (
        ("new", [1 + secrets.randbelow(6) for _ in range(12)]), ("approved", [2, 5]), ("rejected", [4]),
    )}
    first, other = established["new"][0], established["approved"][-1]
    persisted = workshop.rows()
    protected = workshop.protected(persisted)
    lookup = lambda row: REQUESTS + "/" + row["id"]
    checks["lookup-record"] = route_is(workshop.backend, "GET", LOOKUP, "key") and all(exact(
        workshop.request("GET", lookup(row), headers=workshop.auth), 200, workshop.public_row(row)) for row in (first, other))
    failures = []
    for header in ({}, {"X-API-Key": "wrong-key"}):
        response = workshop.request("GET", lookup(first), headers=header)
        failures.append(safe_error(response, {401}, [first["id"], *protected]) and not workshop.calls)
    checks["lookup-denial"] = all(failures) and exact(workshop.request("GET", lookup(first), headers=workshop.key_header), 200, workshop.public_row(first)) and checks["lookup-record"]
    checks["lookup-missing"] = safe_error(workshop.request("GET", REQUESTS + "/row-" + secrets.token_hex(14), headers=workshop.auth), {404}, protected)

    private = True
    for method in METHODS:
        body = {"table": workshop.table, "operation": method, "id": first["id"], "data": {
            workshop.fields["email"]: mail(), workshop.fields["seats"]: 2, workshop.fields["status"]: "new",
        }}
        private &= safe_error(workshop.deployed("POST", "/api/data/query", body), {403}, protected)
    checks["private-data-api"] = private and workshop.rows() == persisted and exact(
        workshop.deployed("GET", lookup(first), headers=workshop.auth), 200, workshop.public_row(first))

    def queue(query, headers=None):
        return workshop.request("GET", QUEUE, headers=workshop.auth if headers is None else headers, query=query)

    def listing(rows):
        return {"items": [workshop.public_row(row) for row in rows]}

    checks["queue-filter"] = route_is(workshop.backend, "GET", QUEUE, "key") and all(exact(
        queue({"status": status, "limit": "20"}), 200, listing(rows)) for status, rows in established.items())
    checks["queue-order"] = all(exact(queue({"status": "new", "limit": str(size)}), 200, listing(established["new"][:size]))
                                for size in (1, 2, 50))
    checks["queue-limits"] = exact(queue({}), 200, listing(established["new"][:10])) and all(
        reject(queue(case)) and not workshop.writes() for case in (
            {"status": "unknown"}, {"status": ["new", "rejected"]}, {"limit": "0"}, {"limit": "51"},
            {"limit": "2.5"}, {"limit": "many"}, {"limit": ["2", "1"]},
        )) and workshop.rows() == persisted
    checks["summary"] = checks["summary"] and summary_ok(workshop.request("GET", SUMMARY, headers=workshop.auth), workshop.groups())
    checks["operator-boundary"] = all(safe_error(workshop.request("GET", path, headers=header), {401}, protected) and not workshop.calls
                                      for path in (QUEUE, SUMMARY) for header in ({}, {"X-API-Key": "wrong-key"})) and checks["summary"] and checks["queue-filter"]


def summary_ok(response, expected):
    status, media, body = response
    if status != 200 or not media.startswith("application/json") or not isinstance(body, dict) or set(body) != {"groups"}:
        return False
    groups = body["groups"]
    return isinstance(groups, list) and all(isinstance(group, dict) and isinstance(group.get("key"), str) for group in groups) and \
        sorted(groups, key=lambda group: group["key"]) == sorted(expected, key=lambda group: group["key"])


def event_checks(workshop, checks):
    fields = workshop.fields
    first, second = workshop.seed(seats=4), workshop.seed(seats=2)
    baseline = workshop.rows()
    body = {"eventId": event_id(), "id": first["id"], "status": "approved"}
    raw = event_raw(body)
    sensitive = [first["id"], *workshop.protected(baseline)]

    def unchanged(response, codes, *, protected=sensitive):
        return safe_error(response, codes, protected) and not workshop.writes() and workshop.rows() == baseline

    checks["event-no-signature"] = unchanged(workshop.request("POST", EVENTS, body, raw=raw), {400, 401, 403, 422})
    wrong = unchanged(workshop.decision(body, valid=False), {400, 401, 403, 422})
    tampered = unchanged(workshop.request("POST", EVENTS, body, raw=raw + " ", headers=workshop.signature(raw)), {400, 401, 403, 422})
    checks["event-tamper"] = wrong and tampered
    checks["event-invalid-values"] = all(unchanged(workshop.decision(bad), CLIENT_ERROR) for bad in (
        {"id": first["id"], "status": "approved"}, {**body, "eventId": "short"},
        {"eventId": event_id(), "status": "approved"}, {"eventId": event_id(), "id": first["id"]},
        {**body, "status": "invented"}, {**body, "status": "new"},
    ))
    missing = {"eventId": event_id(), "id": "row-" + secrets.token_hex(12), "status": "approved"}
    checks["event-missing-record"] = unchanged(workshop.decision(missing), {404})

    expected_fields = {fields["status"]: body["status"], fields["event id"]: body["eventId"],
                       fields["event digest"]: sha256(raw.encode("utf-8")).hexdigest()}
    approved = {"id": first["id"], "status": "approved"}
    result = workshop.decision(body, prefixed=True)
    signed_steps = {step["id"] for route in workshop.backend["routes"] if route["path"] == EVENTS for step in route["steps"] if
                    step["type"] == "verify-hmac-sha256" and step.get("args", {}).get("payload") == {"$ref": "request.raw"} and
                    step["args"].get("signature") == {"$ref": "request.headers.x-workshop-signature"} and
                    step["args"].get("secret", "PLOT_SECRET_WEBHOOK") in ("PLOT_SECRET_WEBHOOK", {"$secret": "PLOT_SECRET_WEBHOOK"})}
    verification = next((i for i, step in enumerate(workshop.trace) if step["stepId"] in signed_steps and step["phase"] == "success"), -1)
    first_write = next((i for i, step in enumerate(workshop.trace) if step["type"] == "db-update" and step["phase"] == "start"), -1)
    checks["event-contract"] = route_is(workshop.backend, "POST", EVENTS, "public") and 0 <= verification < first_write and checks["event-no-signature"]
    writes = workshop.writes()
    after_approved = [{**first, **expected_fields}, second]
    checks["event-approve"] = exact(result, 200, approved) and workshop.rows() == after_approved and len(writes) == 1 and (
        writes[0]["operation"] == "update" and writes[0]["table"] == workshop.table and writes[0].get("id") == first["id"] and
        writes[0].get("data") == expected_fields)
    checks["event-repeat"] = checks["event-approve"] and all(exact(workshop.decision(body, raw=raw), 200, approved) and not workshop.writes() and
                                                            workshop.rows() == after_approved for _ in range(2))
    baseline = workshop.rows()
    reused = ((body, raw + " "), ({**body, "id": second["id"]}, None))
    checks["event-reused-key"] = checks["event-approve"] and all(
        unchanged(workshop.decision(payload, raw=changed), {409}) for payload, changed in reused)
    checks["event-terminal"] = checks["event-approve"] and all(unchanged(workshop.decision({**body, "eventId": event_id(), "status": status}), {409})
                                                               for status in ("approved", "rejected"))

    rejected_body = {"id": second["id"], "status": "rejected", "eventId": event_id()}
    rejected_raw = event_raw(rejected_body)
    expected = {**second, fields["event id"]: rejected_body["eventId"], fields["status"]: "rejected",
                fields["event digest"]: sha256(rejected_raw.encode("utf-8")).hexdigest()}
    rejected = workshop.decision(rejected_body, raw=rejected_raw)
    checks["event-reject"] = exact(rejected, 200, {"id": second["id"], "status": "rejected"}) and workshop.rows() == [baseline[0], expected] and exact(
        workshop.request("GET", REQUESTS + "/" + second["id"], headers=workshop.auth), 200, workshop.public_row(expected))


def saved_tests(backend, make_workshop):
    cases = backend.get("testCases", [])
    if not isinstance(cases, list):
        return False
    good = bad = False
    for index, case in enumerate(cases[:30]):
        if not isinstance(case, dict) or case.get("previewSecrets"):
            continue
        request, expect = case.get("request"), case.get("expect")
        if not isinstance(request, dict) or not isinstance(expect, dict) or request.get("method") != "POST" or request.get("path") != REQUESTS or request.get("headers"):
            continue
        body = request.get("body")
        if not isinstance(body, dict) or set(body) != {"email", "seats"} or not isinstance(body["email"], str) or not re.fullmatch(r"[^@\s]+@example\.test", body["email"], re.I):
            continue
        status, fields = expect.get("status"), expect.get("fields")
        if type(status) is not int or status not in {201, *CLIENT_ERROR}:
            continue
        if status == 201 and not (isinstance(fields, list) and any(check in fields for check in (
            {"path": "status", "operator": "equals", "value": "new"}, {"path": "$.status", "operator": "equals", "value": "new"},
        ))):
            continue
        workshop = make_workshop("saved-" + str(index))
        result = workshop.request("POST", REQUESTS, body)
        if result[0] != status:
            continue
        if status == 201:
            good |= isinstance(result[2], dict) and result[2].get("status") == "new" and len(workshop.rows()) == 1
        else:
            bad |= not workshop.rows() and not workshop.writes()
        if good and bad:
            return True
    return False


def release(workshop, make_workshop, checks):
    email, seats = mail(), 1 + secrets.randbelow(6)
    valid = workshop.deployed("POST", REQUESTS, {"email": email, "seats": str(seats)})
    if valid[0] != 201 or not isinstance(valid[2], dict) or not isinstance(valid[2].get("id"), str):
        return
    identity = valid[2]["id"]
    route = REQUESTS + "/" + identity
    before = workshop.rows()
    if len(before) != 1 or before[0]["id"] != identity:
        return
    operator_row = {"id": identity, "status": "new", "seats": seats}
    read = exact(workshop.deployed("GET", route, headers=workshop.auth), 200, operator_row)
    other = make_workshop("separate")
    checks["release-isolation"] = read and other.operator != workshop.operator and safe_error(
        other.deployed("GET", route, headers=other.auth), {404}, workshop.protected(before)) and other.rows() == [] and workshop.rows() == before
    invalid = reject(workshop.deployed("POST", REQUESTS, {"email": mail(), "seats": 7})) and workshop.rows() == before
    denied = safe_error(workshop.deployed("GET", route), {401}, [identity, *workshop.protected(before)])
    body = {"eventId": event_id(), "id": identity, "status": "approved", "note": "Northline café"}
    raw = event_raw(body)
    expected_public = {"id": identity, "status": "approved"}
    applied = exact(workshop.decision(body, raw=raw, deployed=True), 200, expected_public)
    if not applied:
        return
    after = workshop.rows()
    expected_row = {**before[0], workshop.fields["status"]: "approved", workshop.fields["event id"]: body["eventId"],
                    workshop.fields["event digest"]: sha256(raw.encode("utf-8")).hexdigest()}
    if after != [expected_row]:
        return
    replay = exact(workshop.decision(body, raw=raw, deployed=True), 200, expected_public) and workshop.rows() == after
    empty_queue = exact(workshop.deployed("GET", QUEUE, headers=workshop.auth, query={"status": "new"}), 200, {"items": []})
    report = summary_ok(workshop.deployed("GET", SUMMARY, headers=workshop.auth), workshop.groups())
    updated = exact(workshop.deployed("GET", route, headers=workshop.auth), 200, workshop.public_row(expected_row))
    checks["release-rehearsal"] = all((read, invalid, denied, replay, empty_queue, report, updated))

    path = workshop.database.path.parent / "backup" / "site.sqlite3"
    path.parent.mkdir()
    with closing(sqlite3.connect(workshop.database.path)) as source, closing(sqlite3.connect(path)) as target:
        source.backup(target)
    restored = make_workshop(path, initialize=False)
    checks["backup-restore"] = restored.operator != workshop.operator and restored.rows() == after and exact(
        restored.deployed("GET", route, headers=restored.auth), 200, workshop.public_row(expected_row)) and workshop.rows() == after

    reopened = make_workshop(workshop.database.path, initialize=False)
    reopened.signing = workshop.signing
    checks["persistent-replay"] = exact(reopened.decision(body, raw=raw), 200, expected_public) and not reopened.writes() and reopened.rows() == after and \
        summary_ok(reopened.deployed("GET", SUMMARY, headers=reopened.auth), reopened.groups())


def grade(payload):
    checks = {}
    if not isinstance(payload, dict):
        return checks
    table, fields = table_for(payload.get("tables"))
    if not table:
        return checks
    backend = payload.get("backend")
    with TemporaryDirectory(prefix="plot-architect-") as folder:
        root = Path(folder)
        deadline = time.monotonic() + 22

        def make_workshop(path, *, initialize=True):
            location = root / (path + ".sqlite3") if isinstance(path, str) else path
            return Workshop(backend, table, fields, location, deadline, initialize=initialize)

        try:
            first = make_workshop("intake")
        except HANDLED:
            return checks
        checks["private-schema"] = True
        checks["empty-seeds"] = table.get("rows", []) == []
        if not safe_backend(backend):
            return checks
        tasks = (
            lambda: intake(first, checks),
            lambda: operator(make_workshop("operators"), checks),
            lambda: event_checks(make_workshop("events"), checks),
            lambda: checks.update({"saved-tests": saved_tests(backend, make_workshop)}),
            lambda: release(make_workshop("release"), make_workshop, checks),
        )
        for task in tasks:
            try:
                task()
            except HANDLED:
                # A malformed route earns no credit for its unfinished checks, while other phases can still run.
                continue
    return checks


if __name__ == "__main__":
    LIMITS.update(runSteps=80, runSeconds=0.8, valueBytes=262144, runValueBytes=524288)
    try:
        payload = json.loads(sys.stdin.buffer.read(5 * 1024 * 1024).decode("utf-8"))
        result = grade(payload)
    except HANDLED:
        result = {}
    print(json.dumps({"checks": result}, ensure_ascii=True, separators=(",", ":")))
