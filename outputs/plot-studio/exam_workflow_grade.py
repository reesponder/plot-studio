"""Grade an Architect submission with local, disposable data and simulated credentials."""

import hashlib
import hmac
import json
import secrets
import sqlite3
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from backend_engine import LIMITS, run_workflow, validate_backend
from runtime import Database


REQUESTS = "/api/workshop-requests"
EVENTS = "/api/workshop-events"
ALLOWED_STEPS = {
    "respond-json", "respond-created", "respond-error", "respond-empty", "respond-text",
    "branch", "compare", "require-comparison", "constant", "is-null", "type-of", "not",
    "to-boolean", "to-number", "to-text", "default-value", "select-value", "set-variable",
    "get-variable", "object-get", "object-set", "object-map", "object-merge",
    "object-pick", "object-drop", "object-has", "require-object", "require-number",
    "require-integer", "require-email", "require-range", "require-length",
    "require-one-of", "text-trim", "text-lower", "text-slice", "verify-hmac-sha256",
    "db-create", "db-read", "db-update", "db-list",
}
PRIVATE = {"list", "read", "create", "update", "delete"}
EXPECTED_FIELDS = {"email": "email", "seats": "integer", "status": "text"}
REJECTED = (400, 401, 403, 422)


def get_table(tables):
    matches = [table for table in tables if str(table.get("name", "")).strip().lower() == "workshop requests"]
    if len(matches) != 1:
        return None, {}
    source = matches[0]
    permissions = source.get("permissions")
    fields = source.get("fields")
    if not isinstance(permissions, dict) or any(permissions.get(key) is True for key in PRIVATE):
        return None, {}
    if not isinstance(fields, list) or len(fields) > 20:
        return None, {}
    identifiers = {}
    for field in fields:
        if not isinstance(field, dict) or not isinstance(field.get("name"), str):
            return None, {}
        name = field["name"].strip().lower()
        if name in EXPECTED_FIELDS:
            if name in identifiers or field.get("type") != EXPECTED_FIELDS[name] or field.get("required") is not True:
                return None, {}
            identifiers[name] = field.get("id")
    if set(identifiers) != set(EXPECTED_FIELDS):
        return None, {}
    return {**source, "rows": []}, identifiers


def safe_backend(configuration):
    routes = configuration.get("routes") if isinstance(configuration, dict) else None
    if not isinstance(routes, list) or len(routes) > 15:
        return False
    for route in routes:
        steps = route.get("steps") if isinstance(route, dict) else None
        if not isinstance(steps, list) or len(steps) > 50:
            return False
        for step in steps:
            kind = step.get("type") if isinstance(step, dict) else None
            if not isinstance(kind, str) or kind not in ALLOWED_STEPS:
                return False
    return not any(item["severity"] == "error" for item in validate_backend(configuration))


def state(database, table):
    return database.query({"table": table, "operation": "list"}, internal=True)


def json_response(result, status, expected):
    body = result.get("body")
    return (result["status"] == status and result["headers"].get("content-type", "").startswith("application/json")
            and isinstance(body, dict) and body == expected)


def exercise(configuration, database, table, fields, grade):
    # No account settings, registered services, live keys or outbound network are available.
    operator_key, webhook_key = secrets.token_hex(24), secrets.token_hex(24)
    aliases = {"PLOT_API_KEY": operator_key, "PLOT_SECRET_WEBHOOK": webhook_key}
    services = {"db": lambda query: database.query(query, internal=True), "secret": aliases.get}

    def request(method, path, body=None, headers=None, raw=None):
        return run_workflow(configuration, {
            "method": method, "path": path, "query": {}, "body": body, "headers": headers or {},
            "raw": raw if raw is not None else json.dumps(body, separators=(",", ":")) if body is not None else "",
        }, services)

    def signed_event(payload, valid=True, prefix=False):
        raw = json.dumps(payload, indent=1, ensure_ascii=True) + "\n"
        key = webhook_key if valid else "a-different-training-key"
        signature = hmac.new(key.encode(), raw.encode(), hashlib.sha256).hexdigest()
        headers = {"X-Workshop-Signature": ("sha256=" if prefix else "") + signature}
        return request("POST", EVENTS, payload, headers, raw)

    # Submit like an API client and like the editor's native HTML form.
    cases = [
        {"email": "ada+one@example.test", "seats": 1},
        {"email": "kamil+six@example.test", "seats": "6"},
    ]
    created = []
    for index, sample in enumerate(cases, start=1):
        response = request("POST", REQUESTS, sample)
        current = state(database, table)
        if len(current) != index:
            break
        row = current[-1]
        if (row.get(fields["email"]) != sample["email"] or row.get(fields["seats"]) != int(sample["seats"]) or
                row.get(fields["status"]) != "new" or
                not json_response(response, 201, {"id": row["id"], "status": "new"}) or
                not any(entry["type"] == "db-create" and entry["phase"] == "success" for entry in response["trace"])):
            break
        created.append(row["id"])
    grade["create"] = len(created) == len(cases)

    baseline = state(database, table)
    reject_cases = [
        {"email": "invalid-email", "seats": 2}, {"seats": 2}, {"email": "ana@example.test"},
        *({"email": "ana@example.test", "seats": seats} for seats in [0, 7, 2.5, "", "many", True]),
    ]
    grade["invalid"] = all(request("POST", REQUESTS, case)["status"] in REJECTED and state(database, table) == baseline
                           for case in reject_cases)

    # Later checks can identify correct independent skills even if the POST is incomplete.
    while len(created) < 2:
        seed = database.query({"table": table, "operation": "create", "data": {
            fields["email"]: "grader@example.test", fields["seats"]: 3, fields["status"]: "new",
        }}, internal=True)
        created.append(seed["id"])
    first, other = created
    row = database.query({"table": table, "operation": "read", "id": first}, internal=True)
    auth = {"Authorization": "Bearer " + operator_key}
    lookup = REQUESTS + "/" + first
    wrong = {"X-API-Key": "wrong-key"}
    missing = REQUESTS + "/row-does-not-exist"
    grade["read"] = (request("GET", lookup)["status"] == 401 and request("GET", lookup, headers=wrong)["status"] == 401
                     and json_response(request("GET", lookup, headers=auth), 200, {
                         "id": first, "status": "new", "seats": row[fields["seats"]],
                     }) and request("GET", missing, headers=auth)["status"] == 404)

    before = state(database, table)
    proposed = {"id": first, "status": "approved"}
    rejected = [
        request("POST", EVENTS, proposed), signed_event(proposed, valid=False),
        signed_event({"id": first, "status": "invented"}),
    ]
    grade["rejected"] = all(item["status"] in REJECTED for item in rejected) and state(database, table) == before
    response = signed_event(proposed, prefix=True)
    changed = state(database, table)
    expected = [{**entry, fields["status"]: "approved"} if entry["id"] == first else entry for entry in before]
    proof = {entry["type"] for entry in response["trace"] if entry["phase"] == "success"}
    grade["signed"] = (json_response(response, 200, proposed) and changed == expected and
                       {"verify-hmac-sha256", "db-update"}.issubset(proof))

    repeat = signed_event(proposed, prefix=True)
    second = {"id": other, "status": "rejected"}
    another = signed_event(second)
    expected_final = [{**entry, fields["status"]: "rejected"} if entry["id"] == other else entry for entry in expected]
    unknown = signed_event({"id": "row-does-not-exist", "status": "approved"})
    grade["replay"] = (grade["signed"] and json_response(repeat, 200, proposed) and json_response(another, 200, second)
                       and unknown["status"] == 404 and state(database, table) == expected_final)


def main():
    entry = json.load(sys.stdin)
    grade = {criterion: False for criterion in ("privateSchema", "create", "invalid", "read", "signed", "rejected", "replay")}
    LIMITS.update(runSteps=64, runSeconds=1.0, valueBytes=262144, runValueBytes=524288)
    selected, fields = get_table(entry["tables"])
    if selected:
        try:
            with TemporaryDirectory(prefix="plot-cert-grade-") as folder:
                db = Database({"version": 1, "tables": [selected]}, Path(folder) / "candidate.sqlite3")
                grade["privateSchema"] = True
                if safe_backend(entry["backend"]):
                    exercise(entry["backend"], db, selected["id"], fields, grade)
        except (RuntimeError, ValueError, TypeError, KeyError, RecursionError, sqlite3.Error):
            # Invalid project input never escapes as a Python traceback or exposes values.
            pass
    print(json.dumps(grade, separators=(",", ":")))


if __name__ == "__main__":
    main()
