import copy
import hashlib
import hmac
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

APP = Path(__file__).resolve().parents[1] / "outputs" / "plot-studio"
sys.path.insert(0, str(APP))
from backend_engine import run_workflow, validate_backend, workflow_schema
from backend_services import services_for
from runtime import Database


def step(key, kind, **args):
    return {"id": key, "type": kind, "args": args}


def route(path, method, steps, access="public", variant="primary"):
    return {"id": variant, "path": path, "method": method, "access": access, "steps": steps}


def config(*routes):
    return {"version": 1, "routes": list(routes)}


def request(path, method="GET", **data):
    return {"path": path, "method": method, "body": None, "query": {}, "headers": {}, **data}


def ref(value):
    return {"$ref": value}


def run(candidate, payload, services=None):
    errors = validate_backend(candidate)
    assert not errors, errors
    result = run_workflow(candidate, payload, services)
    assert isinstance(result["status"], int)
    return result


schema = workflow_schema()
assert len(schema["operations"]) >= 100
assert len({item["type"] for item in schema["operations"]}) == len(schema["operations"])
data_schema = {"version": 1, "tables": [{"id": "inbox", "name": "Inbox", "fields": [{"id": "email", "name": "Email", "type": "email", "required": True}], "permissions": {}, "rows": []}]}
with TemporaryDirectory() as temp:
    store = Database(data_schema, Path(temp) / "data.sqlite3")
    submit = route("/api/inquiries/:department", "POST", [
        {**step("require", "require-email", value=ref("request.body.from"), message="Enter an email address."), "error": "error"},
        step("create", "db-create", table="inbox", data={"email": ref("steps.require.value")}),
        step("created", "respond-created", body={"record": ref("steps.create.value"), "department": ref("request.params.department")}),
        step("error", "respond-json", status=400, body=ref("steps.require.error")),
    ])
    listing = route("/api/inquiries", "GET", [step("list", "db-list", table="inbox"), step("return", "respond-json", body=ref("steps.list.value"))], variant="list")
    plus = config(submit, listing)
    handlers = services_for(store)
    bad = run(plus, request("/api/inquiries/design", "POST", body={"from":"bad"}), handlers)
    assert bad["status"] == 400 and bad["body"]["code"] == "VALIDATION"
    success = run(plus, request("/api/inquiries/design", "POST", body={"from":"hello@example.org"}), handlers)
    assert success["status"] == 201 and success["body"]["department"] == "design"
    stored = run(plus, request("/api/inquiries", "GET"), handlers)["body"]
    assert len(stored) == 1 and stored[0]["email"] == "hello@example.org"
    assert run(plus, request("/api/inquiries", "PATCH"), handlers)["headers"]["allow"] == "GET, HEAD"
    assert run(plus, request("/api/inquiries/design%2Ffinance", "POST"), handlers)["status"] == 404
    assert store.query({"table":"inbox","operation":"list"}, internal=True) == stored

secure = config(route("/api/secure", "GET", [step("result", "respond-json", body=ref("request.headers"))], "key"))
assert run(secure, request("/api/secure"), {"secret": lambda _: "demo-token"})["status"] == 401
authorized = run(secure, request("/api/secure", headers={"Authorization":"Bearer demo-token", "X-Public":"yes", "Cookie":"private"}), {"secret": lambda _: "demo-token"})
assert authorized["body"] == {"x-public": "yes"} and "demo-token" not in json.dumps(authorized["trace"])
assert run(secure, request("/api/secure"), {"preview": True})["status"] == 200

raw = "hello"
signature = hmac.new(b"local-secret", raw.encode(), hashlib.sha256).hexdigest()
hooks = config(route("/api/hooks", "POST", [
    step("verify", "verify-hmac-sha256", payload=ref("request.raw"), signature=ref("request.headers.x-webhook"), secret={"$secret":"PLOT_SECRET_WEBHOOK"}),
    step("done", "respond-empty"),
]))
assert run(hooks, request("/api/hooks", "POST", raw=raw, headers={"X-Webhook":signature}), {"secret": lambda _: "local-secret"})["status"] == 204
assert run(hooks, request("/api/hooks", "POST", raw=raw, headers={"X-Webhook":"invalid"}), {"secret": lambda _: "local-secret"})["status"] == 400

calls = []
trusted = config(route("/api/integrate", "POST", [
    step("connect", "call-connector", name="registered", options={"body":ref("request.body")}),
    step("task", "run-task", name="server-clock", values=ref("steps.connect.value")),
    step("return", "respond-json", body=ref("steps.task.value")),
]))
def connector(name, options):
    calls.append((name, options))
    return {"body": "received"}
assert run(trusted, request("/api/integrate", "POST", body={}), {"preview":True})["status"] == 503
assert run(trusted, request("/api/integrate", "POST", body={"one": 1}), {"connector": connector, "task":lambda name, value: {"ran":name, "value":value}})["body"]["ran"] == "server-clock"
assert calls == [("registered", {"body":{"one":1}})]
dynamic = copy.deepcopy(trusted)
dynamic["routes"][0]["steps"][0]["args"]["name"] = ref("request.body.connector")
assert any("fixed" in error["message"] for error in validate_backend(dynamic))

cycle = config(route("/api/test", "GET", [{**step("yes", "constant", value=1), "next":"yes"}]))
assert any("cycle" in item["message"].lower() for item in validate_backend(cycle))
secret = config(route("/api/test", "GET", [step("invalid", "respond-json", body={"$secret":"PLOT_TEST"})]))
assert any("credential" in item["message"] for item in validate_backend(secret))
template = step("large", "constant", value="a" * 200000)
multiplied = config(route("/api/limits", "GET", [template, step("done", "respond-json", body=[ref("steps.large.value")] * 20)]))
assert run(multiplied, request("/api/limits"))["body"]["error"]["code"] == "RESULT_LIMIT"

child = subprocess.run([sys.executable, "-B", str(APP / "backend_worker.py")], input=json.dumps({"action":"catalog"}), check=True, text=True, capture_output=True)
assert len(json.loads(child.stdout)["operations"]) == len(schema["operations"])
import runtime
with TemporaryDirectory() as temp:
    folder = Path(temp)
    runtime.BACKEND_CONFIG = folder / "backend.json"
    runtime.BACKEND_CONFIG.write_text(json.dumps(plus), encoding="utf-8")
    stored_app = Database(data_schema, folder / "data.sqlite3")
    runtime.database = lambda: stored_app
    headers = []
    def start_response(status, values):
        headers.append((status, dict(values)))
    body = b'{"from":"another@example.org"}'
    response = runtime.application({"PATH_INFO":"/api/inquiries/engineering", "REQUEST_METHOD":"POST", "QUERY_STRING":"",
                                    "CONTENT_TYPE":"application/json", "CONTENT_LENGTH":str(len(body)), "wsgi.input":io.BytesIO(body)}, start_response)
    assert headers[0][0] == "201 Created"
    assert json.loads(b"".join(response))["department"] == "engineering"
    assert len(stored_app.query({"table":"inbox","operation":"list"}, internal=True)) == 1
if os.environ.get("PLOT_TEST_RUST"):
    native = config(route("/api/rust", "GET", [step("hash", "rust-fnv1a", value="hello"), step("done", "respond-json", body=ref("steps.hash.value"))]))
    assert run(native, request("/api/rust"), {"native_path":os.environ["PLOT_TEST_RUST"]})["body"] == "a430d84680aabd0b"
print(f"Verified {len(schema['operations'])} backend specs, SQLite, API key, HMAC, named services, path/branch/size checks, worker catalog and exported WSGI HTTP adapter.")
