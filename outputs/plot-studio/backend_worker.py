"""One bounded operation dispatched by the private Studio gateway."""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from backend_engine import run_workflow, validate_backend, workflow_schema
from backend_services import available_services, secret, services_for
from runtime import ApiError, Database
from workflow_packages import package_catalog, validate_package_manifest


def package_diagnostics(backend):
    try:
        enabled = validate_package_manifest(backend.get("packages", []), require_available=True)
    except ValueError as issue:
        return [{"severity": "error", "message": str(issue)}]
    catalogue = {package["id"]: package for package in package_catalog()}
    findings = []
    for route in backend.get("routes", []):
        for step in route.get("steps", []):
            if step["type"] != "run-package":
                continue
            args = step.get("args", {})
            package_id = args.get("package")
            package = catalogue.get(package_id)
            if package_id not in enabled:
                findings.append({"severity": "error", "message": f"Enable {package_id} in Backend Packages before using it."})
            elif package and not any(action["id"] == args.get("operation") for action in package["actions"]):
                findings.append({"severity": "error", "message": f"Choose a supported action for {package_id}."})
    return findings


def python_diagnostics(backend):
    findings = []
    for script in backend.get("pythonScripts", []):
        try:
            compile(script["source"], "<project-python>", "exec", dont_inherit=True)
        except (SyntaxError, ValueError, RecursionError) as issue:
            line = getattr(issue, "lineno", None)
            location = f" at line {line}" if isinstance(line, int) else ""
            findings.append({"severity": "error", "field": "pythonScripts", "scriptId": script["id"],
                             "message": f'Python script "{script["name"]}" has invalid syntax{location}.'})
    return findings


def python_metadata():
    try:
        from python_runner import python_status
    except ModuleNotFoundError as issue:
        if issue.name != "python_runner":
            raise
        return {"available": False, "version": None, "packages": [], "timeoutMax": 15}
    return python_status()


def python_execute(source, values, timeout=5):
    try:
        from python_runner import run_python
    except ModuleNotFoundError as issue:
        if issue.name != "python_runner":
            raise
        raise ApiError("PYTHON_UNAVAILABLE", "The Python runner is unavailable on this server.", 503) from None
    return run_python(source, values, timeout)


def diagnostics_for(backend):
    findings = validate_backend(backend)
    if not any(item.get("severity") == "error" for item in findings):
        findings.extend(package_diagnostics(backend))
        findings.extend(python_diagnostics(backend))
    return findings


def workspace_services(services, tenant):
    if tenant:
        services.update(native_path=None, allow_native=False, connector=None, task=None)
    return services


def workflow_secret_reader(request, *, preview):
    saved = request.get("savedSecrets")
    temporary = request.get("previewSecrets")
    temporary = temporary if preview and isinstance(temporary, dict) else {}

    def read(name):
        if not isinstance(name, str):
            return None
        if name in temporary:
            return temporary[name]
        if isinstance(saved, dict):
            return saved.get(name)
        return None if preview else secret(name)

    return read


def callback(request):
    action = request.get("action")
    tenant = request.get("tenant") is True
    studio_connectors = request.get("studioConnectors")
    if not isinstance(studio_connectors, dict):
        studio_connectors = None
    if action == "catalog":
        services = available_services(studio_connectors)
        if tenant:
            services.update(connectors=[], tasks=[], native=False)
        return {**workflow_schema(), "services": {**services, "python": python_metadata()}}
    if action == "python-test":
        return python_execute(request.get("source"), request.get("values"), request.get("timeout", 5))
    backend = request.get("backend") or {"version": 1, "routes": []}
    packages = backend.get("packages", []) if isinstance(backend, dict) else []
    schema = request.get("schema") or {"version": 1, "tables": []}
    if action == "check":
        return {"diagnostics": diagnostics_for(backend)}
    if action == "validate":
        diagnostics = diagnostics_for(backend)
        if any(item.get("severity") == "error" for item in diagnostics):
            return {"diagnostics": diagnostics}
        Database(schema, Path(request["dbPath"]))
        return {"diagnostics": diagnostics}
    if action == "test":
        with TemporaryDirectory(prefix="plot-backend-") as folder:
            database = Database(schema, Path(folder) / "test.sqlite3")
            services = workspace_services(services_for(database, preview=True, native_preview=not tenant, packages=packages,
                                    secret_reader=workflow_secret_reader(request, preview=True)), tenant)
            services["python"] = python_execute
            return run_workflow(backend, request["request"], services)
    database = Database(schema, Path(request["dbPath"]), initialize=False)
    if action == "data":
        return {"result": database.query(request.get("query"))}
    if action == "run":
        reader = workflow_secret_reader(request, preview=False)
        services = workspace_services(services_for(database, packages=packages, studio_connectors=studio_connectors, secret_reader=reader), tenant)
        services["python"] = python_execute
        site_key = request.get("siteKey")
        if site_key:
            services["secret"] = lambda name: site_key if name == "PLOT_API_KEY" else reader(name)
        result = run_workflow(backend, request["request"], services)
        return {key: result[key] for key in ("status", "headers", "body") if key in result}
    raise ValueError("The server operation is unsupported.")


try:
    request = json.loads(sys.stdin.buffer.read(25 * 1024 * 1024).decode("utf-8"))
    result = callback(request)
    print(json.dumps(result, allow_nan=False, ensure_ascii=True, separators=(",", ":")))
except (ApiError, ValueError, RuntimeError, OSError) as issue:
    print(json.dumps({"workerError": str(issue)[:600], "status": getattr(issue, "status", 422), "code": getattr(issue, "code", "BACKEND_REQUEST")}, ensure_ascii=True))
except Exception:
    print('{"workerError":"The server runner could not complete this request.","status":500,"code":"BACKEND_RUNTIME"}')
