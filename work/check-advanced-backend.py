import csv
import hashlib
import hmac
import io
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

APP = Path(__file__).resolve().parents[1] / "outputs" / "plot-studio"
sys.path.insert(0, str(APP))
from backend_engine import run_workflow, validate_backend, workflow_schema
from workflow_packages import run_package
import runtime


def operation(kind, args, services=None, *, http_body=None, raw=None, headers=None, status=200, code=None):
    config = {
        "version": 1,
        "routes": [{
            "id": "sample", "method": "POST", "path": "/api/sample",
            "steps": [
                {"id": "execute", "type": kind, "args": args},
                {"id": "report", "type": "respond-json", "args": {"body": {"$ref": "steps.execute.value"}}},
            ],
        }],
    }
    errors = validate_backend(config)
    assert not errors, (kind, errors)
    result = run_workflow(config, {
        "method": "POST", "path": "/api/sample", "body": http_body, "headers": headers or {}, "raw": raw, "query": {},
    }, services)
    assert result["status"] == status, (kind, args, result)
    if code:
        assert result["body"]["error"]["code"] == code, (kind, result)
    return result["body"]


schema = [node for node in workflow_schema()["operations"] if "valueType" in node]
assert len(schema) == 29 and all(node["output"] == "steps.<id>.value" for node in schema)
rows = [{"id": "a", "points": 12, "group": "new"}, {"id": "b", "points": 3, "group": "old"}, {"id": "a", "group": "new"}]
assert operation("list-project-rows", {"value": rows, "fields": {"score": "points"}, "missing": "omit"}) == [{"score": 12}, {"score": 3}, {}]
operation("list-project-rows", {"value": [{}], "fields": {"score": "points"}, "missing": "error"}, status=400, code="REFERENCE_MISSING")
assert [row["id"] for row in operation("list-sort-by", {"value": rows, "path": "points", "kind": "number"})] == ["b", "a", "a"]
descending = operation("list-sort-by", {"value": rows, "path": "points", "direction": "descending", "kind": "number"})
assert descending == rows
assert operation("list-distinct-by", {"value": rows, "path": "id", "keep": "last"}) == rows[1:]
assert operation("list-index-by", {"value": rows, "path": "id", "collision": "first"}) == {row["id"]: row for row in rows[:2]}
operation("list-index-by", {"value": rows, "path": "id"}, status=422, code="DUPLICATE_KEY")
operation("list-index-by", {"value": [{"id": "__proto__"}]}, status=422, code="INVALID_VALUE")
joined = operation("list-join-by", {"value": rows, "other": [{"id": "a", "task": "done"}]})
assert joined == [{"left": rows[0], "right": {"id": "a", "task": "done"}}, {"left": rows[1], "right": None},
                  {"left": rows[2], "right": {"id": "a", "task": "done"}}]
operation("list-join-by", {"value": [{"id": "a"}] * 80, "other": [{"id": "a", "long": "x" * 20000}]}, status=422, code="RESULT_LIMIT")
assert operation("list-group-counts", {"value": rows, "path": "group"}) == [{"key": "new", "count": 2}, {"key": "old", "count": 1}]
partitioned = operation("list-partition", {"value": rows, "path": "group", "operator": "equals", "right": "old"})
assert partitioned == {"matched": [rows[1]], "rejected": [rows[0], rows[2]]}
pages = operation("list-page-window", {"value": rows, "page": 2, "size": 2})
assert pages == {"items": rows[2:], "total": 3, "page": 2, "size": 2, "pages": 2, "hasNext": False, "hasPrevious": True}

nested = {"outer": {"empty": {}, "many": [1, 2]}, "keep": False}
flat = operation("object-flatten-paths", {"value": nested})
assert flat == {"outer.empty": {}, "outer.many": [1, 2], "keep": False}
assert operation("object-expand-paths", {"value": flat}) == nested
operation("object-expand-paths", {"value": {"a": {}, "a.x": 5}}, status=422, code="PATH_CONFLICT")
assert operation("object-apply-defaults", {"value": {"a": 0, "b": None}, "defaults": {"a": True, "b": 2}, "replaceNull": True}) == {"a": 0, "b": 2}
assert operation("object-rename-keys", {"value": {"a": 1, "b": 2}, "renames": {"a": "b", "b": "a"}}) == {"a": 2, "b": 1}
operation("object-rename-keys", {"value": {"a": 1, "b": 2}, "renames": {"a": "b"}}, status=422, code="DUPLICATE_KEY")
assert operation("object-change-set", {"value": {"a": 1, "same": {"x": 1, "y": 0}, "old": 7},
                                        "other": {"a": 4, "same": {"y": 0, "x": 1}, "new": 8}}) == {
    "added": ["new"], "removed": ["old"], "changed": [{"key": "a", "before": 1, "after": 4}]}

numbers = [0, 5, 10, 20]
assert operation("stats-number-summary", {"value": numbers + [None]}) == {"count": 4, "min": 0, "max": 20, "sum": 35, "mean": 8.75, "median": 7.5}
assert operation("stats-percentile", {"value": numbers, "percent": 25}) == 3.75
assert operation("stats-percentile", {"value": [], "percent": 25}) is None
assert operation("stats-histogram", {"value": numbers, "bounds": [5, 10]}) == [
    {"lower": None, "upper": 5, "count": 1}, {"lower": 5, "upper": 10, "count": 1}, {"lower": 10, "upper": None, "count": 2}]
operation("stats-histogram", {"value": numbers, "bounds": [5, 5]}, status=422, code="INVALID_VALUE")
assert operation("stats-group-sum", {"value": rows, "path": "group", "amountPath": "points"}) == [
    {"key": "new", "count": 1, "sum": 12}, {"key": "old", "count": 1, "sum": 3}]
assert operation("stats-moving-average", {"value": numbers, "window": 2}) == [None, 2.5, 7.5, 15]

test_secret = "example-application-secret"
vault = {"secret": lambda alias: test_secret if alias in {"PLOT_SECRET_BEARER_TOKEN", "PLOT_SECRET_WEBHOOK"} else None}
assert operation("security-verify-secret-token", {"token": test_secret}, vault) is True
operation("security-verify-secret-token", {"token": "wrong"}, vault, status=401, code="UNAUTHORIZED")
operation("security-verify-secret-token", {"token": test_secret}, status=503, code="SECRET_UNAVAILABLE")
opaque = "a-private-random-token-example"
digest = hashlib.sha256(opaque.encode()).hexdigest()
assert operation("security-verify-token-digest", {"token": opaque, "digest": digest.upper()}) is True
operation("security-verify-token-digest", {"token": opaque, "digest": "x" * 64}, status=422, code="INVALID_VALUE")
operation("security-verify-token-digest", {"token": "\udc80", "digest": digest}, status=401, code="UNAUTHORIZED")
point = 1700000000
payload = '{"id":1}  \n'
signature = hmac.new(test_secret.encode(), f"{point}.{payload}".encode(), hashlib.sha256).hexdigest()
bindings = {"timestamp": {"$ref": "request.headers.x-event-time"}, "payload": {"$ref": "request.raw"},
            "signature": {"$ref": "request.headers.x-event-signature"}}
headers = {"X-Event-Time": str(point), "X-Event-Signature": "sha256=" + signature}
with patch("backend_engine.time.time", return_value=point + 15):
    assert operation("security-verify-timed-hmac", bindings, vault, raw=payload, headers=headers) is True
    operation("security-verify-timed-hmac", bindings, vault, raw=payload.rstrip(), headers=headers, status=401, code="UNAUTHORIZED")
with patch("backend_engine.time.time", return_value=point + 301):
    operation("security-verify-timed-hmac", bindings, vault, raw=payload, headers=headers, status=401, code="UNAUTHORIZED")
assert operation("require-idempotency-key", {"value": "purchase:1700000000"}) == "purchase:1700000000"
operation("require-idempotency-key", {"value": "short"}, status=400, code="VALIDATION")

assert operation("time-window", {"value": "2021-01-01T03:00:00+03:00", "unit": "week"}) == {
    "start": "2020-12-28T00:00:00.000Z", "end": "2021-01-04T00:00:00.000Z"}
assert operation("time-in-window", {"value": "2021-01-02", "start": "2021-01-01", "end": "2021-01-02"}) is False
assert operation("time-in-window", {"value": "2021-01-01", "start": "2021-01-01", "end": "2021-01-02"}) is True
assert operation("time-iso-week", {"value": "2021-01-01"}) == {"year": 2020, "week": 53, "weekday": 5}
assert operation("data-parse-minor-units", {"value": "-12.9"}) == -1290
assert operation("data-format-minor-units", {"value": -1290}) == "-12.90"
operation("data-parse-minor-units", {"value": "9007199254740992", "places": 0}, status=422, code="INVALID_VALUE")
operation("data-parse-minor-units", {"value": "1.111"}, status=422, code="INVALID_VALUE")
csv_data = operation("csv-write", {"value": [{"id": -2, "note": " =1+2"}, {"id": 5, "note": "x,y"}], "columns": ["id", "note"]})
assert list(csv.reader(io.StringIO(csv_data))) == [["id", "note"], ["-2", "' =1+2"], ["5", "x,y"]]


def pack(package, kind, data):
    return run_package([{"id": "document-text", "version": "1.0.0"}], package, kind, data)


package_args = {"package": "document-text", "operation": "text-stats", "input": {"text": "A quick test."}}
assert isinstance(operation("run-package", package_args, {"package": pack}), dict)
operation("run-package", package_args, status=503, code="SERVICE_UNAVAILABLE")
operation("run-package", {**package_args, "package": "unknown"}, {"package": pack}, status=422, code="PACKAGE_REJECTED")
invalid = {"version": 1, "routes": [{"id": "sample", "method": "POST", "path": "/api/sample", "steps": [{
    "id": "run", "type": "run-package", "args": {"package": {"$ref": "request.body.name"}, "operation": "text-stats"}}]}]}
assert any("fixed package" in error["message"] for error in validate_backend(invalid))

pipeline = {
    "version": 1,
    "packages": [{"id": "document-text", "version": "1.0.0"}],
    "routes": [{"id": "pipeline", "method": "POST", "path": "/api/report", "steps": [
        {"id": "stats", "type": "run-package",
         "args": {**package_args, "input": {"text": {"$ref": "request.body.note"}}}},
        {"id": "amount", "type": "data-parse-minor-units", "args": {"value": {"$ref": "request.body.amount"}}},
        {"id": "return", "type": "respond-json",
         "args": {"body": {"count": {"$ref": "steps.stats.value.words"}, "total": {"$ref": "steps.amount.value"}}}},
    ]}],
}
assert not validate_backend(pipeline)
payload = {"note": "words for report", "amount": "15.20"}
database_schema = {"version": 1, "tables": []}
worker_job = {"action": "test", "backend": pipeline, "schema": database_schema,
              "request": {"method": "POST", "path": "/api/report", "headers": {}, "body": payload}}
child = subprocess.run([sys.executable, "-B", str(APP / "backend_worker.py")], input=json.dumps(worker_job),
                       check=True, capture_output=True, text=True)
assert json.loads(child.stdout)["body"] == {"count": 3, "total": 1520}, child.stdout

with TemporaryDirectory() as scratch:
    folder = Path(scratch)
    runtime.BACKEND_CONFIG = folder / "backend.json"
    runtime.BACKEND_CONFIG.write_text(json.dumps(pipeline), encoding="utf-8")
    db = runtime.Database(database_schema, folder / "state.sqlite3")
    runtime.database = lambda: db
    statuses = []
    raw_json = json.dumps(payload).encode("utf-8")
    response = runtime.application({"PATH_INFO": "/api/report", "REQUEST_METHOD": "POST", "QUERY_STRING": "",
                                    "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": str(len(raw_json)),
                                    "wsgi.input": io.BytesIO(raw_json)}, lambda status, _headers: statuses.append(status))
    assert statuses == ["200 OK"]
    assert json.loads(b"".join(response)) == {"count": 3, "total": 1520}
print(f"{len(schema)} new backend nodes passed, plus pinned package workflow in hosted worker and exported WSGI runtime.")
