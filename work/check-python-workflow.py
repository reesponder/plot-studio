import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

APP = Path(__file__).resolve().parents[1] / "outputs" / "plot-studio"
sys.path.insert(0, str(APP))
from backend_engine import run_workflow, validate_backend, workflow_schema


SOURCE = "def run(values):\n    print('fixture processed')\n    return {'total': sum(values['numbers']) * 2}\n"
SCRIPT = {"id": "double-total", "name": "Calculate total", "source": SOURCE}
REQUEST = {"method": "POST", "path": "/api/total", "body": {"numbers": [1, 2, 3]}}
BACKEND = {"version": 1, "pythonScripts": [SCRIPT], "routes": [{
    "id": "total", "path": "/api/total", "method": "POST", "steps": [
        {"id": "calculate", "type": "run-python", "args": {
            "script": "double-total", "values": {"$ref": "request.body"}, "timeout": 7,
        }},
        {"id": "respond", "type": "respond-json", "args": {"status": 201, "body": {"$ref": "steps.calculate.value.result"}}},
    ],
}]}


def worker(action, **payload):
    process = subprocess.run([sys.executable, "-B", str(APP / "backend_worker.py")],
                             input=json.dumps({"action": action, **payload}), text=True, capture_output=True, check=True)
    return json.loads(process.stdout)


assert not validate_backend(BACKEND)
captured = []


def call(source, values, timeout):
    captured.append((source, values, timeout))
    return {"result": {"total": 12}, "logs": ["fixture processed"], "durationMs": 11}


result = run_workflow(BACKEND, REQUEST, {"python": call})
assert captured == [(SOURCE, REQUEST["body"], 7)]
assert (result["status"], result["body"]) == (201, {"total": 12})
assert "fixture processed" not in json.dumps(result["trace"])


class PythonFailure(ValueError):
    code = "PYTHON_FAILED"
    status = 422


def failed(*_args):
    raise PythonFailure("safe preview details")


preview = run_workflow(BACKEND, REQUEST, {"python": failed, "preview": True})
published = run_workflow(BACKEND, REQUEST, {"python": failed})
assert preview["body"]["error"] == {"code": "PYTHON_FAILED", "message": "safe preview details"}
assert published["body"]["error"]["code"] == "PYTHON_FAILED"
assert "safe preview details" not in json.dumps(published)

budgeted = deepcopy(BACKEND)
budgeted["routes"][0]["steps"] = [
    {"id": node, "type": "run-python", "args": {"script": "double-total", "timeout": 15},
     **({"error": "recover"} if node == "third" else {})} for node in ("first", "second", "third")
] + [
    {"id": "respond", "type": "respond-json", "args": {"body": "Unexpected success"}},
    {"id": "recover", "type": "respond-json", "args": {"status": 429, "body": {"$ref": "steps.third.error.code"}}},
]
virtual_time = [0]
timeouts = []


def advance(_source, _values, timeout):
    timeouts.append(timeout)
    virtual_time[0] += 8 if len(timeouts) == 1 else timeout
    return {"result": None, "logs": [], "durationMs": 1}


with patch("backend_engine.time.monotonic", side_effect=lambda: virtual_time[0]):
    exhausted = run_workflow(budgeted, REQUEST, {"python": advance})
assert timeouts == [15, 7], timeouts
assert (exhausted["status"], exhausted["body"]) == (429, "PYTHON_BUDGET")

invalid = deepcopy(BACKEND)
args = invalid["routes"][0]["steps"][0]["args"]
for script_id in ["missing", {"$ref": "request.body.script"}]:
    args["script"] = script_id
    assert any(issue.get("field") == "script" for issue in validate_backend(invalid))
    assert run_workflow(invalid, REQUEST, {"python": call})["body"]["error"]["code"] == "INVALID_GRAPH"
args["script"] = "double-total"
for limit in [0, 16, 2.5, True, "10", {}]:
    args["timeout"] = limit
    assert any(issue.get("field") == "timeout" for issue in validate_backend(invalid))
args["timeout"] = 5
invalid["pythonScripts"].append(invalid["pythonScripts"][0])
assert any("unique" in issue["message"] for issue in validate_backend(invalid))
too_large = {"version": 1, "routes": [], "pythonScripts": [{**SCRIPT, "source": "ą" * 17000}]}
assert any("32 KiB" in issue["message"] for issue in validate_backend(too_large))
bad_syntax = {"version": 1, "routes": [], "pythonScripts": [{**SCRIPT, "source": "def run(values\n"}]}
assert worker("check", backend=bad_syntax)["diagnostics"][0]["scriptId"] == "double-total"

catalogue = worker("catalog")
assert any(node["type"] == "run-python" and node["group"] == "Python" for node in catalogue["operations"])
assert catalogue["services"]["python"]["timeoutMax"] == 15
assert workflow_schema()["limits"]["pythonSourceBytes"] == 32768
if catalogue["services"]["python"]["available"]:
    direct = worker("python-test", source=SOURCE, values=REQUEST["body"], timeout=3)
    assert direct["result"] == {"total": 12}, direct
    assert "fixture processed" in "".join(direct["logs"]), direct
    draft = worker("test", backend=BACKEND, request=REQUEST)
    assert (draft["status"], draft["body"]) == (201, {"total": 12}), draft
    with TemporaryDirectory() as folder:
        database = str(Path(folder) / "site.sqlite3")
        assert not worker("validate", backend=BACKEND, dbPath=database)["diagnostics"]
        published = worker("run", backend=BACKEND, request=REQUEST, dbPath=database)
        assert (published["status"], published["body"]) == (201, {"total": 12}), published
    print("Python workflow catalogue, validation, real runner, preview, and hosted worker passed.")
else:
    direct = worker("python-test", source=SOURCE, values=REQUEST["body"], timeout=3)
    assert direct["status"] == 503 and direct["code"].startswith("PYTHON_"), direct
    print("Python workflow catalogue, validation, scoped service resolution and unavailable runner behavior passed.")
