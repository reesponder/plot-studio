"""Bounded, declarative HTTP workflow interpreter for PLOT Studio sites."""

import base64
import csv
import hashlib
import hmac
import io
import json
import math
import re
import secrets
import subprocess
import time
import unicodedata
import uuid
from bisect import bisect_right
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit


METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
LIMITS = {"routes": 80, "stepsPerRoute": 160, "totalSteps": 2800, "runSteps": 160, "runSeconds": 20,
          "valueBytes": 1024 * 1024, "runValueBytes": 8 * 1024 * 1024, "textChars": 256000, "listItems": 10000,
          "pythonScripts": 30, "pythonSourceBytes": 32 * 1024, "pythonTimeoutSeconds": 15, "pythonRunSeconds": 15}
ID = re.compile(r"[a-zA-Z0-9_-]{1,100}\Z")
PACKAGE_ID = re.compile(r"[a-z][a-z0-9-]{0,79}\Z")
PYTHON_SCRIPT_ID = re.compile(r"[a-z][a-z0-9-]{0,63}\Z")
NAME = re.compile(r"[a-zA-Z_][a-zA-Z0-9_-]{0,79}\Z")
SECRET = re.compile(r"PLOT_(?:API_KEY|SECRET_[A-Z0-9_]{1,70})\Z")
PATH_PART = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}\Z")
REF = re.compile(r"(?:request|steps|vars)(?:\.[a-zA-Z0-9_-]{1,100}){0,24}\Z")
EMAIL = re.compile(r"[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+\Z")
OPERATIONS = {}
HANDLERS = {}
MISSING = object()


class WorkflowError(Exception):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code, self.status = code, status


def fail(message, code="INVALID_VALUE", status=422):
    raise WorkflowError(code, message, status)


def field(key, label, kind="string", default=MISSING, *, required=False, options=None, description=None):
    result = {"key": key, "label": label, "kind": kind}
    if default is not MISSING:
        result["default"] = default
    if required:
        result["required"] = True
    if options:
        result["options"] = list(options)
    if description:
        result["description"] = description
    return result


def register(key, group, label, description, fields, handler, *, terminal=False, value_type=None):
    if key in OPERATIONS:
        raise ValueError(f"Duplicate backend node: {key}")
    OPERATIONS[key] = {"type": key, "group": group, "label": label, "description": description,
                       "fields": list(fields), "output": "steps.<id>.value", "terminal": terminal}
    if value_type is not None:
        OPERATIONS[key]["valueType"] = value_type
    HANDLERS[key] = handler


def workflow_schema():
    return {"version": 1, "methods": list(METHODS), "accesses": ["public", "key"],
            "limits": dict(LIMITS), "operations": list(OPERATIONS.values())}


def path_pattern(path):
    if not isinstance(path, str) or not path.startswith("/api/") or len(path) > 240:
        return None
    parts = path[1:].split("/")
    if parts[1] in {"_plot", "studio", "_studio"} or path.rstrip("/") == "/api/data/query":
        return None
    parameters = [part[1:] for part in parts if part.startswith(":")]
    if (not 2 <= len(parts) <= 14 or len(set(parameters)) != len(parameters)
            or not all(NAME.fullmatch(part) for part in parameters)
            or not all(PATH_PART.fullmatch(part) or part.startswith(":") for part in parts)):
        return None
    return tuple(parts)


def json_size(value, limit=LIMITS["valueBytes"]):
    encoder = json.JSONEncoder(ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    try:
        size = 0
        for part in encoder.iterencode(value):
            size += len(part)
            if size > limit:
                return None
        return size
    except (ValueError, TypeError, OverflowError, RecursionError):
        return None


def valid_json(value):
    return json_size(value) is not None


def bad_binding(value, steps, secret_allowed=False):
    stack = [(value, secret_allowed, 0)]
    while stack:
        item, credential, depth = stack.pop()
        if depth > 24:
            return "Argument has too many nested levels."
        if isinstance(item, dict):
            if set(item) == {"$ref"}:
                ref = item["$ref"]
                if not isinstance(ref, str) or not REF.fullmatch(ref):
                    return "Reference must start with request, steps, or vars and use dot paths."
                parts = ref.split(".")
                if parts[0] == "steps" and (len(parts) < 3 or parts[1] not in steps
                                           or parts[2] not in {"value", "result", "error", "status"}):
                    return "Reference must name a step and one of its outputs."
            elif set(item) == {"$secret"}:
                if not credential or not isinstance(item["$secret"], str) or not SECRET.fullmatch(item["$secret"]):
                    return "Secret aliases are accepted only in credential fields."
            else:
                stack.extend((child, False, depth + 1) for child in item.values())
        elif isinstance(item, list):
            stack.extend((child, False, depth + 1) for child in item)
    return None


def python_script_ids(scripts, issue):
    found = set()
    if not isinstance(scripts, list) or len(scripts) > LIMITS["pythonScripts"]:
        issue("Save up to 30 Python scripts in a project.", key="pythonScripts")
        return found
    for script in scripts:
        script_id = script.get("id") if isinstance(script, dict) else None
        if not isinstance(script_id, str) or not PYTHON_SCRIPT_ID.fullmatch(script_id) or script_id in found:
            issue("Python script IDs must be unique and use lowercase letters, digits, and dashes.", key="pythonScripts")
            continue
        found.add(script_id)
        name, source = script.get("name"), script.get("source")
        if not isinstance(name, str) or not name.strip() or len(name) > 80:
            issue("Give each Python script a name up to 80 characters.", key="pythonScripts")
        try:
            size = len(source.encode("utf-8")) if isinstance(source, str) and source.strip() and "\x00" not in source else 0
        except UnicodeError:
            size = 0
        if not 0 < size <= LIMITS["pythonSourceBytes"]:
            issue("Each Python script needs valid UTF-8 source up to 32 KiB.", key="pythonScripts")
    return found


def validate_backend(config):
    diagnostics, routes_seen, total = [], set(), 0

    def issue(message, route=None, step=None, key=None, severity="error"):
        item = {"severity": severity, "message": message}
        if isinstance(route, str):
            item["routeId"] = route[:100]
        if isinstance(step, str):
            item["stepId"] = step[:100]
        if key:
            item["field"] = key
        if len(diagnostics) < 120:
            diagnostics.append(item)

    if not isinstance(config, dict) or config.get("version") != 1 or not isinstance(config.get("routes"), list):
        return [{"severity": "error", "message": "Choose a version 1 backend with an endpoints list."}]
    routes = config["routes"]
    if len(routes) > LIMITS["routes"]:
        return [{"severity": "error", "message": "A backend supports up to 80 endpoints."}]
    python_scripts = python_script_ids(config.get("pythonScripts", []), issue)
    route_ids = set()
    for route in routes:
        if not isinstance(route, dict):
            issue("Endpoint must be an object.")
            continue
        route_id, method = route.get("id"), route.get("method")
        if not isinstance(route_id, str) or not ID.fullmatch(route_id) or route_id in route_ids:
            issue("Endpoint ID must be unique and use letters, digits, dashes, or underscores.", route_id)
        else:
            route_ids.add(route_id)
        if method not in METHODS:
            issue("Choose a supported HTTP method.", route_id)
        pattern = path_pattern(route.get("path"))
        if pattern is None:
            issue("Use an endpoint under /api/, with optional :named parameters. Studio and Data paths are reserved.", route_id)
        elif isinstance(method, str):
            signature = (method, tuple(":" if part.startswith(":") else part for part in pattern))
            if signature in routes_seen:
                issue("Another endpoint matches the same method and path pattern.", route_id)
            routes_seen.add(signature)
        access = route.get("access", "public")
        if access not in ("public", "key"):
            issue("Choose Site visitors or API key required.", route_id)
        secret_alias = route.get("keySecret", "PLOT_API_KEY")
        if access == "key" and (not isinstance(secret_alias, str) or not SECRET.fullmatch(secret_alias)):
            issue("Use PLOT_API_KEY or a PLOT_SECRET_ alias for the API key.", route_id)
        steps = route.get("steps")
        if not isinstance(steps, list) or not 1 <= len(steps) <= LIMITS["stepsPerRoute"]:
            issue("An endpoint needs 1–160 nodes.", route_id)
            continue
        total += len(steps)
        ids = set()
        for step in steps:
            step_id = step.get("id") if isinstance(step, dict) else None
            if not isinstance(step_id, str) or not ID.fullmatch(step_id) or step_id in ids:
                issue("Each node needs a unique ID using letters, digits, dashes, or underscores.", route_id, step_id)
            else:
                ids.add(step_id)
        adjacency = {}
        for index, step in enumerate(steps):
            if not isinstance(step, dict):
                continue
            step_id, step_type = step.get("id"), step.get("type")
            if not isinstance(step_id, str) or step_id not in ids:
                continue
            operation = OPERATIONS.get(step_type) if isinstance(step_type, str) else None
            if not operation:
                issue("Choose a supported backend node.", route_id, step_id)
                continue
            args = step.get("args", {})
            if not isinstance(args, dict) or not valid_json(args):
                issue("Node configuration must be a bounded JSON object.", route_id, step_id)
                continue
            fields = {item["key"]: item for item in operation["fields"]}
            for key in args:
                if key not in fields:
                    issue("This node does not support the configured field.", route_id, step_id, str(key)[:100])
            for key, descriptor in fields.items():
                value = args.get(key, descriptor.get("default"))
                if descriptor.get("required") and (value is None or value == ""):
                    issue(f'{descriptor["label"]} is required.', route_id, step_id, key)
                binding_issue = bad_binding(value, ids, descriptor["kind"] == "secret")
                if binding_issue:
                    issue(binding_issue, route_id, step_id, key)
                if descriptor["kind"] == "secret":
                    alias = value.get("$secret") if isinstance(value, dict) else value
                    if not isinstance(alias, str) or not SECRET.fullmatch(alias):
                        issue("Use PLOT_API_KEY or a configured PLOT_SECRET_ alias.", route_id, step_id, key)
                if descriptor["kind"] in ("connector", "task", "table") and (not isinstance(value, str) or not ID.fullmatch(value)):
                    issue(f'Choose a fixed {descriptor["label"].lower()} for this node.', route_id, step_id, key)
                if descriptor["kind"] in ("package", "package-operation") and (not isinstance(value, str) or not PACKAGE_ID.fullmatch(value)):
                    issue(f'Choose a fixed {descriptor["label"].lower()} for this node.', route_id, step_id, key)
                if descriptor["kind"] == "python-script" and (not isinstance(value, str) or value not in python_scripts):
                    issue("Choose a saved Python script from this project.", route_id, step_id, key)
                if step_type == "run-python" and key == "timeout" and not (isinstance(value, dict) and set(value) == {"$ref"}):
                    try:
                        integer(value, 1, LIMITS["pythonTimeoutSeconds"])
                    except WorkflowError:
                        issue("Use a whole Python timeout from 1 to 15 seconds.", route_id, step_id, key)
                if descriptor["kind"] == "select" and not isinstance(value, dict) and value not in descriptor["options"]:
                    issue(f'Choose an available value for {descriptor["label"]}.', route_id, step_id, key)
            if step.get("onError", "stop") not in ("stop", "continue"):
                issue("Choose Stop or Continue for the error behavior.", route_id, step_id)
            child = []
            if not operation["terminal"]:
                following = steps[index + 1] if index + 1 < len(steps) else None
                default_next = following.get("id") if isinstance(following, dict) else None
                for key, target in [("next", step.get("next") or default_next), ("error", step.get("error")),
                                    ("whenTrue", args.get("whenTrue")), ("whenFalse", args.get("whenFalse"))]:
                    if target in ("", None):
                        continue
                    if not isinstance(target, str) or target not in ids:
                        issue("Branch must target a node in the same endpoint.", route_id, step_id, key)
                    else:
                        child.append(target)
            adjacency[step_id] = child
        active, done = set(), set()

        def cyclic(node):
            if node in active:
                return True
            if node in done:
                return False
            active.add(node)
            found = any(cyclic(other) for other in adjacency.get(node, []))
            active.remove(node)
            done.add(node)
            return found

        if any(cyclic(node) for node in adjacency):
            issue("A branch creates a cycle. Choose a forward path or a terminal response.", route_id)
    if total > LIMITS["totalSteps"]:
        issue("A backend supports up to 2,800 nodes across all endpoints.")
    return diagnostics


def sequence(value):
    if not isinstance(value, list) or len(value) > LIMITS["listItems"]:
        fail("Provide a list of at most 10,000 entries.")
    return value


def mapping(value):
    if not isinstance(value, dict):
        fail("Provide a JSON object.")
    return value


def string(value):
    if not isinstance(value, str) or len(value) > LIMITS["textChars"]:
        fail("Provide bounded text.")
    return value


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        fail("Provide a finite number.")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        fail("Provide a finite number.")
    return value


def integer(value, minimum=-10 ** 9, maximum=10 ** 9):
    value = number(value)
    if value != int(value) or not minimum <= value <= maximum:
        fail(f"Provide an integer from {minimum} to {maximum}.")
    return int(value)


def lookup(value, path, fallback=MISSING):
    if not isinstance(path, str) or len(path) > 400:
        fail("Provide a bounded value path.")
    for part in path.split(".") if path else ():
        if isinstance(value, dict) and part in value:
            value = value[part]
        elif isinstance(value, list) and part.isascii() and part.isdigit() and len(part) <= 6 and int(part) < len(value):
            value = value[int(part)]
        elif fallback is not MISSING:
            return fallback
        else:
            fail("The referenced value is missing.", "REFERENCE_MISSING", 400)
    return value


def resolve(value, context, level=0):
    if level > 24:
        fail("The argument is nested too deeply.")
    if isinstance(value, dict):
        if set(value) == {"$ref"}:
            return lookup(context, value["$ref"])
        return {key: resolve(item, context, level + 1) for key, item in value.items()}
    if isinstance(value, list):
        return [resolve(item, context, level + 1) for item in value]
    return value


def output(status, value, headers=None, media="application/json; charset=utf-8"):
    try:
        status = HTTPStatus(integer(status, 200, 599)).value
    except ValueError:
        fail("Choose a standard HTTP response code.")
    result_headers = {"content-type": media}
    for key, item in mapping(headers or {}).items():
        if not isinstance(key, str) or not isinstance(item, str):
            continue
        lower = key.lower()
        if not re.fullmatch(r"(?:x-[a-z0-9-]{1,60}|retry-after|allow)", lower) or len(item) > 1024:
            continue
        if any(ord(char) < 32 or ord(char) > 126 for char in item):
            continue
        result_headers[lower] = item
    return {"status": status, "headers": result_headers, "body": None if status in (204, 304) else value}


def error_response(error, trace):
    return {**output(error.status, {"error": {"code": error.code, "message": str(error)}}), "trace": trace}


def compare(left, relation, right):
    if relation == "equals":
        return type(left) is type(right) and left == right or (type(left) in (float, int) and type(right) in (float, int) and left == right)
    if relation == "not-equals":
        return not compare(left, "equals", right)
    if relation == "contains":
        if isinstance(left, (str, dict)) and isinstance(right, str) or isinstance(left, list):
            return right in left
        return False
    if relation == "in":
        return compare(right, "contains", left)
    if relation == "exists":
        return left is not None
    if relation == "empty":
        return left is None or left == "" or left == [] or left == {}
    a, b = number(left), number(right)
    if relation == "above":
        return a > b
    if relation == "at-least":
        return a >= b
    if relation == "below":
        return a < b
    if relation == "at-most":
        return a <= b
    fail("Choose a supported comparison.")


def verify(condition, value, message=None):
    if not condition:
        fail(string(message)[:240] if message else "The supplied value did not pass validation.", "VALIDATION", 400)
    return value


def project_request(request, params):
    headers = request.get("headers", {})
    private = {"authorization", "x-api-key", "cookie", "proxy-authorization", "set-cookie"}
    safe = {key.lower(): value for key, value in headers.items() if isinstance(key, str)
            and key.lower() not in private and isinstance(value, str) and len(value) <= 4096} if isinstance(headers, dict) else {}
    result = {key: request.get(key) for key in ("method", "path", "query", "body", "client", "raw")}
    result.update({"headers": safe, "params": params})
    if not valid_json(result):
        fail("The request body or query exceeds the workflow limit.", "REQUEST_LIMIT", 413)
    return result


def select_route(routes, request):
    path, method = request.get("path"), request.get("method")
    if not isinstance(path, str) or len(path) > 420 or not path.startswith("/api/") or method not in METHODS:
        fail("This workflow endpoint does not exist.", "ROUTE_NOT_FOUND", 404)
    actual = path[1:].split("/")
    candidates = []
    for route in routes:
        parts = path_pattern(route.get("path"))
        if not parts or len(parts) != len(actual):
            continue
        params = {}
        for pattern, segment in zip(parts, actual):
            if pattern.startswith(":") and segment:
                try:
                    value = unquote(segment, errors="strict")
                except UnicodeError:
                    break
                if value in {".", ".."} or not value or any(char in "/\\\0?#" or ord(char) < 32 for char in value):
                    break
                params[pattern[1:]] = value
            elif pattern != segment:
                break
        else:
            specificity = tuple(not part.startswith(":") for part in parts)
            candidates.append((specificity, route, params))
    matched = [item for item in candidates if item[1]["method"] == method or method == "HEAD" and item[1]["method"] == "GET"]
    if not matched:
        if candidates:
            methods = {item[1]["method"] for item in candidates}
            if "GET" in methods:
                methods.add("HEAD")
            return output(405, {"error": {"code": "METHOD", "message": "This endpoint uses another HTTP method."}},
                          {"Allow": ", ".join(item for item in METHODS if item in methods)})
        fail("This workflow endpoint does not exist.", "ROUTE_NOT_FOUND", 404)
    _, route, params = max(matched, key=lambda item: (item[0], item[1]["method"] == method))
    return route, params


def credential(services, alias):
    reader = services.get("secret")
    if not isinstance(alias, str) or not SECRET.fullmatch(alias) or not callable(reader):
        return None
    value = reader(alias)
    return value if isinstance(value, str) and value and len(value) <= 4096 else None


def authorize(route, request, services):
    if route.get("access") != "key" or services.get("preview"):
        return
    expected = credential(services, route.get("keySecret", "PLOT_API_KEY"))
    if not expected:
        fail("This endpoint's API key has not been configured.", "KEY_UNAVAILABLE", 503)
    headers = request.get("headers", {})
    headers = {key.lower(): value for key, value in headers.items() if isinstance(key, str)} if isinstance(headers, dict) else {}
    supplied = headers.get("x-api-key")
    authorization = headers.get("authorization", "")
    if not supplied and isinstance(authorization, str) and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    if not isinstance(supplied, str) or len(supplied) > 4096 or not hmac.compare_digest(supplied.encode(), expected.encode()):
        fail("A valid API key is required.", "UNAUTHORIZED", 401)


def run_workflow(config, request, services=None):
    """Return the HTTP result and a payload-free trace suited to the Studio UI."""
    services = services or {}
    trace = []
    diagnostics = validate_backend(config)
    if any(item["severity"] == "error" for item in diagnostics):
        return error_response(WorkflowError("INVALID_GRAPH", "The endpoint graph has validation errors."), trace)
    try:
        if not isinstance(request, dict):
            fail("The workflow request must be an object.", "INVALID_REQUEST", 400)
        selected = select_route(config["routes"], request)
        if isinstance(selected, dict):
            return {**selected, "trace": trace}
        route, params = selected
        authorize(route, request, services)
        context = {"request": project_request(request, params), "vars": {}, "steps": {},
                   "python_scripts": {script["id"]: script["source"] for script in config.get("pythonScripts", [])},
                   "python_seconds": LIMITS["pythonRunSeconds"]}
    except WorkflowError as error:
        return error_response(error, trace)
    entries = route["steps"]
    indexes = {step["id"]: index for index, step in enumerate(entries)}
    position, executed, result_bytes = 0, 0, 0
    deadline = time.monotonic() + LIMITS["runSeconds"]
    final = None
    while position < len(entries):
        if executed >= LIMITS["runSteps"] or time.monotonic() > deadline:
            return error_response(WorkflowError("WORKFLOW_LIMIT", "The workflow reached its execution limit.", 429), trace)
        executed += 1
        step = entries[position]
        step_id, step_type = step["id"], step["type"]
        operation = OPERATIONS[step_type]
        branch = step.get("next")
        trace.append({"stepId": step_id, "type": step_type, "phase": "start"})
        try:
            raw = step.get("args", {})
            args = {field["key"]: resolve(raw.get(field["key"], field.get("default")), context)
                    if field["kind"] != "secret" else raw.get(field["key"], field.get("default"))
                    for field in operation["fields"]}
            if not valid_json(args):
                fail("Resolved inputs exceed the JSON value limit.", "RESULT_LIMIT")
            value = HANDLERS[step_type](args, context, services)
            if time.monotonic() > deadline:
                fail("The workflow reached its execution limit.", "WORKFLOW_LIMIT", 429)
            size = json_size(value, min(LIMITS["valueBytes"], LIMITS["runValueBytes"] - result_bytes))
            if size is None:
                fail("The step result exceeds the JSON value limit.", "RESULT_LIMIT")
            result_bytes += size
            if operation["terminal"]:
                trace.append({"stepId": step_id, "type": step_type, "phase": "response"})
                return {**value, "trace": trace}
            if step_type == "branch":
                branch = args["whenTrue"] if value else args["whenFalse"]
                branch = branch or step.get("next")
            final = value
            context["steps"][step_id] = {"value": value, "result": value, "status": "success"}
            trace.append({"stepId": step_id, "type": step_type, "phase": "success"})
        except WorkflowError as error:
            context["steps"][step_id] = {"status": "error", "error": {"code": error.code, "message": str(error)}}
            trace.append({"stepId": step_id, "type": step_type, "phase": "error", "code": error.code})
            branch = step.get("error")
            if not branch and step.get("onError") != "continue":
                return error_response(error, trace)
        except (ArithmeticError, OSError, UnicodeError, ValueError, TypeError, KeyError, RecursionError):
            error = WorkflowError("STEP_FAILED", "A node could not process its configured values.")
            context["steps"][step_id] = {"status": "error", "error": {"code": error.code, "message": str(error)}}
            trace.append({"stepId": step_id, "type": step_type, "phase": "error", "code": error.code})
            branch = step.get("error")
            if not branch and step.get("onError") != "continue":
                return error_response(error, trace)
        position = indexes[branch] if isinstance(branch, str) and branch in indexes else position + 1
    return {**output(200, final), "trace": trace}


def unary(key, group, label, detail, fn, kind="any", default=None):
    register(key, group, label, detail, [field("value", "Value", kind, default)],
             lambda a, _c, _s: fn(a["value"]))


def binary(key, group, label, detail, fn, kind="number"):
    register(key, group, label, detail, [field("left", "First value", kind, 0), field("right", "Second value", kind, 1)],
             lambda a, _c, _s: fn(a["left"], a["right"]))


OUT = [field("status", "HTTP status", "integer", 200), field("body", "Response body", "any", {}),
       field("headers", "Response headers", "object", {}, description="Supports X- headers, Allow, and Retry-After.")]
RELATIONS = ("equals", "not-equals", "contains", "in", "exists", "empty", "above", "at-least", "below", "at-most")
COMPARISON = [field("left", "Value", "any", None), field("operator", "Comparison", "select", "equals", options=RELATIONS),
              field("right", "Compare with", "any", None)]
TEXT = "Text"
LIST = "Lists"
VALUES = "Values"
MATH = "Numbers"
VALID = "Validation"
OBJECT = "Objects"

register("respond-json", "Response", "JSON response", "Return a JSON response and finish the endpoint.", OUT,
         lambda a, _c, _s: output(a["status"], a["body"], a["headers"]), terminal=True)
register("respond-text", "Response", "Plain text response", "Return plain UTF-8 text and finish the endpoint.",
         [OUT[0], field("body", "Response body", "text", ""), OUT[2]],
         lambda a, _c, _s: output(a["status"], string(a["body"]), a["headers"], "text/plain; charset=utf-8"), terminal=True)
register("respond-empty", "Response", "Empty response", "Finish with HTTP 204 and a response with no body.",
         [], lambda _a, _c, _s: output(204, None), terminal=True)
register("respond-created", "Response", "Created response", "Return HTTP 201 and the newly created value.",
         [OUT[1], OUT[2]], lambda a, _c, _s: output(201, a["body"], a["headers"]), terminal=True)
register("respond-accepted", "Response", "Accepted response", "Return HTTP 202 to acknowledge an accepted request.",
         [OUT[1], OUT[2]], lambda a, _c, _s: output(202, a["body"], a["headers"]), terminal=True)
register("respond-error", "Response", "Error response", "Return an error object with a caller-visible code and message.",
         [field("status", "HTTP status", "integer", 400), field("code", "Error code", default="BAD_REQUEST"),
          field("message", "Message", "text", "The request could not be completed.")],
         lambda a, _c, _s: output(integer(a["status"], 400, 599), {"error": {"code": string(a["code"])[:80], "message": string(a["message"])[:500]}}), terminal=True)
register("branch", "Flow", "Conditional branch", "Compare two values and jump to the matching branch.",
         [*COMPARISON, field("whenTrue", "When true", "step", ""), field("whenFalse", "When false", "step", "")],
         lambda a, _c, _s: compare(a["left"], a["operator"], a["right"]))
register("compare", "Flow", "Compare values", "Return a boolean for a comparison without changing the next node.",
         COMPARISON, lambda a, _c, _s: compare(a["left"], a["operator"], a["right"]))
register("require-comparison", VALID, "Require comparison", "Stop or use the error branch when the values do not match.",
         [*COMPARISON, field("message", "Failure message", "text", "The condition was not met.")],
         lambda a, _c, _s: verify(compare(a["left"], a["operator"], a["right"]), a["left"], a["message"]))
unary("constant", VALUES, "Value", "Make a literal available to following nodes.", lambda x: x)
unary("is-null", VALUES, "Is null", "Check whether a value is null.", lambda x: x is None)
unary("type-of", VALUES, "Value type", "Classify a value using JSON types.",
      lambda x: {type(None): "null", bool: "boolean", int: "number", float: "number", str: "string", list: "array", dict: "object"}.get(type(x), "unknown"))
unary("not", VALUES, "Invert boolean", "Invert the truthiness of a value.", lambda x: not x)
unary("to-boolean", VALUES, "To boolean", "Return whether the value is truthy.", bool)
unary("json-parse", VALUES, "Parse JSON", "Read JSON text and return its value.", lambda x: json.loads(string(x)), "text", "{}")
unary("json-stringify", VALUES, "Write JSON", "Serialize a value to compact JSON text.",
      lambda x: json.dumps(x, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
unary("to-number", MATH, "To number", "Convert text or a numeric value to a finite number.",
      lambda x: number(float(x)) if isinstance(x, str) else number(x), default=0)
unary("to-text", TEXT, "To text", "Convert text or a JSON value to text.",
      lambda x: x if isinstance(x, str) else json.dumps(x, ensure_ascii=True, allow_nan=False))
register("default-value", VALUES, "Use default value", "Use a fallback when a value is null.",
         [field("value", "Value", "any", None), field("fallback", "Fallback", "any", "")],
         lambda a, _c, _s: a["fallback"] if a["value"] is None else a["value"])
register("select-value", VALUES, "Choose value", "Return one of two values using a boolean condition.",
         [field("condition", "Condition", "boolean", True), field("yes", "If true", "any", None), field("no", "If false", "any", None)],
         lambda a, _c, _s: a["yes"] if a["condition"] else a["no"])


def set_variable(args, context, _services):
    name = string(args["name"])
    if not NAME.fullmatch(name):
        fail("Choose a valid variable name.")
    context["vars"][name] = args["value"]
    return args["value"]


register("set-variable", "Flow", "Set variable", "Store a named value for the current request.",
         [field("name", "Variable name", default="value"), field("value", "Value", "any", None)], set_variable)
register("get-variable", "Flow", "Get variable", "Read a variable saved by an earlier node.",
         [field("name", "Variable name", default="value"), field("fallback", "Fallback", "any", None)],
         lambda a, c, _s: lookup(c["vars"], a["name"], a["fallback"]))
for name, label in (("body", "Request body"), ("query", "Request query"), ("params", "Path parameters"),
                    ("headers", "Request headers"), ("client", "Client address"), ("method", "Request method")):
    register(f"get-request-{name}", "Request", label, f"Read {label.lower()} from the current request.", [],
             lambda _a, context, _s, name=name: context["request"].get(name))

for key, label, detail, fn in (
    ("text-trim", "Trim text", "Remove outer whitespace.", str.strip),
    ("text-upper", "Uppercase", "Convert letters to uppercase.", str.upper),
    ("text-lower", "Lowercase", "Convert letters to lowercase.", str.lower),
    ("text-casefold", "Fold case", "Normalize case for case-insensitive comparisons.", str.casefold),
    ("text-title", "Title case", "Capitalize each word.", str.title),
    ("text-length", "Character count", "Count Unicode characters.", len),
    ("text-bytes", "UTF-8 size", "Count UTF-8 bytes.", lambda s: len(s.encode())),
    ("text-lines", "Split lines", "Split text at line breaks.", str.splitlines),
    ("text-words", "Split words", "Split text at whitespace.", str.split),
    ("text-reverse", "Reverse text", "Reverse the order of Unicode characters.", lambda s: s[::-1]),
    ("text-nfc", "Normalize Unicode", "Return Unicode NFC text.", lambda s: unicodedata.normalize("NFC", s)),
    ("text-slug", "Make a slug", "Build a lowercase ASCII slug from text.", lambda s: re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip("-")),
    ("text-condense", "Condense whitespace", "Replace whitespace runs with single spaces.", lambda s: " ".join(s.split())),
):
    unary(key, TEXT, label, detail, lambda value, fn=fn: fn(string(value)), "text", "")
for key, label, detail, fn in (
    ("text-concat", "Concatenate text", "Join two text values.", lambda a, b: a + b),
    ("text-starts", "Starts with", "Check whether text starts with a prefix.", str.startswith),
    ("text-ends", "Ends with", "Check whether text ends with a suffix.", str.endswith),
    ("text-contains", "Contains text", "Check whether text contains a substring.", lambda a, b: b in a),
    ("text-remove-prefix", "Remove prefix", "Remove a matching prefix once.", str.removeprefix),
    ("text-remove-suffix", "Remove suffix", "Remove a matching suffix once.", str.removesuffix),
    ("text-split", "Split text", "Split text at a nonempty separator.", lambda a, b: a.split(b, 9999)),
):
    register(key, TEXT, label, detail, [field("value", "Text", "text", ""), field("other", "Second text", default=" ")],
             lambda a, _c, _s, fn=fn: fn(string(a["value"]), string(a["other"])))
register("text-slice", TEXT, "Slice text", "Select part of a string by character offsets.",
         [field("value", "Text", "text", ""), field("start", "Start", "integer", 0), field("end", "End", "integer", 120)],
         lambda a, _c, _s: string(a["value"])[integer(a["start"]):integer(a["end"])])


def replace_text(args, _context, _services):
    text, old, new = (string(args[key]) for key in ("value", "find", "replacement"))
    if not old:
        fail("The matching text cannot be empty.")
    count = text.count(old)
    if len(text) + count * (len(new) - len(old)) > LIMITS["textChars"]:
        fail("The replaced text would exceed the text limit.", "RESULT_LIMIT")
    return text.replace(old, new)


register("text-replace", TEXT, "Replace text", "Replace all occurrences of a literal substring.",
         [field("value", "Text", "text", ""), field("find", "Find", default="old"), field("replacement", "Replacement", default="new")],
         replace_text)

for key, label, detail, fn in (
    ("number-add", "Add numbers", "Add two numbers.", lambda a, b: a + b),
    ("number-subtract", "Subtract", "Subtract the second number from the first.", lambda a, b: a - b),
    ("number-multiply", "Multiply", "Multiply two numbers.", lambda a, b: a * b),
    ("number-divide", "Divide", "Divide by the second number.", lambda a, b: a / b),
    ("number-modulo", "Remainder", "Return the remainder after division.", lambda a, b: a % b),
    ("number-min", "Minimum of two", "Pick the smaller of two numbers.", min),
    ("number-max", "Maximum of two", "Pick the larger of two numbers.", max),
    ("number-percent", "Percentage of value", "Calculate the second value as a percentage of the first.", lambda a, b: a * b / 100),
    ("number-hypotenuse", "Hypotenuse", "Calculate the diagonal from two sides.", math.hypot),
):
    binary(key, MATH, label, detail, lambda a, b, fn=fn: number(fn(number(a), number(b))))
for key, label, detail, fn in (
    ("number-absolute", "Absolute value", "Remove a negative sign.", abs),
    ("number-round", "Round number", "Round to the nearest integer.", round),
    ("number-ceil", "Round up", "Round toward positive infinity.", math.ceil),
    ("number-floor", "Round down", "Round toward negative infinity.", math.floor),
    ("number-square-root", "Square root", "Calculate the square root of a nonnegative number.", math.sqrt),
):
    unary(key, MATH, label, detail, lambda x, fn=fn: fn(number(x)), "number", 0)
register("number-clamp", MATH, "Clamp number", "Limit a number to an inclusive range.",
         [field("value", "Value", "number", 0), field("minimum", "Minimum", "number", 0), field("maximum", "Maximum", "number", 100)],
         lambda a, _c, _s: min(max(number(a["value"]), number(a["minimum"])), number(a["maximum"])))
register("number-random", MATH, "Random integer", "Choose a random integer from an inclusive range.",
         [field("minimum", "Minimum", "integer", 1), field("maximum", "Maximum", "integer", 100)],
         lambda a, _c, _s: integer(a["minimum"]) + secrets.randbelow(integer(a["maximum"]) - integer(a["minimum"]) + 1))

for key, label, detail, fn in (
    ("list-count", "List count", "Count entries in a list.", len),
    ("list-first", "First entry", "Read the first entry or null.", lambda x: x[0] if x else None),
    ("list-last", "Last entry", "Read the last entry or null.", lambda x: x[-1] if x else None),
    ("list-reverse", "Reverse list", "Reverse the order of entries.", lambda x: x[::-1]),
    ("list-sort-text", "Sort text list", "Sort a list of text entries.", lambda x: sorted(map(string, x))),
    ("list-sort-number", "Sort numeric list", "Sort a list of numbers.", lambda x: sorted(map(number, x))),
    ("list-unique", "Unique entries", "Remove repeated JSON values, preserving the first occurrence.",
     lambda x: list({json.dumps(i, sort_keys=True, ensure_ascii=True): i for i in x}.values())),
    ("list-total", "Sum list", "Add up all numbers in a list.", lambda x: number(sum(map(number, x)))),
    ("list-average", "Average list", "Calculate the arithmetic mean or null for an empty list.", lambda x: number(sum(map(number, x)) / len(x)) if x else None),
    ("list-minimum", "Minimum of list", "Pick the smallest number or null.", lambda x: min(map(number, x), default=None)),
    ("list-maximum", "Maximum of list", "Pick the largest number or null.", lambda x: max(map(number, x), default=None)),
    ("list-truthy", "Keep truthy entries", "Drop entries that convert to false.", lambda x: [item for item in x if item]),
    ("list-compact", "Remove null entries", "Drop null while retaining zero, false, and empty text.", lambda x: [item for item in x if item is not None]),
):
    unary(key, LIST, label, detail, lambda value, fn=fn: fn(sequence(value)), "array", [])
register("list-append", LIST, "Append entry", "Add one value at the end of a list.",
         [field("value", "List", "array", []), field("entry", "Entry", "any", None)], lambda a, _c, _s: [*sequence(a["value"]), a["entry"]])
register("list-merge", LIST, "Merge lists", "Join two lists end to end.",
         [field("value", "First list", "array", []), field("other", "Second list", "array", [])],
         lambda a, _c, _s: [*sequence(a["value"]), *sequence(a["other"])])
register("list-at", LIST, "List entry at index", "Read a list position with a fallback when it is missing.",
         [field("value", "List", "array", []), field("index", "Index", "integer", 0), field("fallback", "Fallback", "any", None)],
         lambda a, _c, _s: lookup(sequence(a["value"]), str(integer(a["index"], 0, LIMITS["listItems"])), a["fallback"]))
register("list-slice", LIST, "Slice list", "Select a consecutive portion of a list.",
         [field("value", "List", "array", []), field("start", "Start", "integer", 0), field("end", "End", "integer", 50)],
         lambda a, _c, _s: sequence(a["value"])[integer(a["start"]):integer(a["end"])])
register("list-pluck", LIST, "Collect field values", "Read the same object path from each list entry.",
         [field("value", "List", "array", []), field("path", "Field path", default="id")],
         lambda a, _c, _s: [lookup(item, a["path"], None) for item in sequence(a["value"])])
register("list-filter", LIST, "Filter list", "Keep entries whose value or field passes a comparison.",
         [field("value", "List", "array", []), field("path", "Field path", default=""), *COMPARISON[1:]],
         lambda a, _c, _s: [item for item in sequence(a["value"]) if compare(lookup(item, a["path"], None), a["operator"], a["right"])])
register("list-find", LIST, "Find matching entry", "Return the first matching entry or null.",
         [field("value", "List", "array", []), field("path", "Field path", default=""), *COMPARISON[1:]],
         lambda a, _c, _s: next((item for item in sequence(a["value"]) if compare(lookup(item, a["path"], None), a["operator"], a["right"])), None))
register("list-chunk", LIST, "Chunk list", "Group consecutive entries into lists of the chosen size.",
         [field("value", "List", "array", []), field("size", "Chunk size", "integer", 10)],
         lambda a, _c, _s: chunks(sequence(a["value"]), integer(a["size"], 1, 10000)))


def chunks(items, size):
    return [items[index:index + size] for index in range(0, len(items), size)]


def join_items(args, _context, _services):
    delimiter = string(args["separator"])
    items = sequence(args["value"])
    length = max(0, len(items) - 1) * len(delimiter)
    for item in items:
        length += len(string(item))
        if length > LIMITS["textChars"]:
            fail("The joined text is too large.", "RESULT_LIMIT")
    return delimiter.join(items)


register("list-join", LIST, "Join text entries", "Turn a list of text entries into text with a separator.",
         [field("value", "List", "array", []), field("separator", "Separator", default=", ")], join_items)
for key, label, detail, fn in (
    ("object-keys", "Object keys", "List the keys in an object.", lambda obj: list(obj)),
    ("object-values", "Object values", "List the values in an object.", lambda obj: list(obj.values())),
    ("object-entries", "Object entries", "Convert an object to [key, value] pairs.", lambda obj: [list(item) for item in obj.items()]),
    ("object-size", "Object field count", "Count keys in an object.", len),
):
    unary(key, OBJECT, label, detail, lambda value, fn=fn: fn(mapping(value)), "object", {})
register("object-get", OBJECT, "Get field", "Read a field by dot path, with an optional fallback.",
         [field("value", "Object", "object", {}), field("path", "Field path", default="name"), field("fallback", "Fallback", "any", None)],
         lambda a, _c, _s: lookup(a["value"], a["path"], a["fallback"]))
register("object-set", OBJECT, "Set field", "Copy the object and set a single top-level field.",
         [field("value", "Object", "object", {}), field("key", "Field key", default="name"), field("entry", "Field value", "any", None)],
         lambda a, _c, _s: {**mapping(a["value"]), string(a["key"]): a["entry"]})
register("object-map", OBJECT, "Map fields", "Build an object from destination keys and source paths.",
         [field("value", "Source object", "object", {}), field("fields", "Field map", "object", {"name": "name"})],
         lambda a, _c, _s: {key: lookup(a["value"], path, None) for key, path in mapping(a["fields"]).items()})
register("object-merge", OBJECT, "Merge objects", "Join two objects, using the second value on a duplicate key.",
         [field("value", "First object", "object", {}), field("other", "Second object", "object", {})],
         lambda a, _c, _s: {**mapping(a["value"]), **mapping(a["other"])})
register("object-pick", OBJECT, "Pick fields", "Keep only the requested keys.",
         [field("value", "Object", "object", {}), field("keys", "Keys", "array", [])],
         lambda a, _c, _s: {key: mapping(a["value"])[key] for key in map(string, sequence(a["keys"])) if key in mapping(a["value"])})
register("object-drop", OBJECT, "Drop fields", "Remove the requested keys.",
         [field("value", "Object", "object", {}), field("keys", "Keys", "array", [])],
         lambda a, _c, _s: without_keys(mapping(a["value"]), set(map(string, sequence(a["keys"])))))
register("object-has", OBJECT, "Has field", "Check for a top-level key, including a field with a null value.",
         [field("value", "Object", "object", {}), field("key", "Field key", default="id")],
         lambda a, _c, _s: string(a["key"]) in mapping(a["value"]))


def without_keys(obj, excluded):
    return {key: value for key, value in obj.items() if key not in excluded}


for key, label, detail, predicate in (
    ("require-value", "Require value", "Reject null or empty values.", lambda x: x is not None and x != "" and x != [] and x != {}),
    ("require-text", "Require text", "Reject values that are not text.", lambda x: isinstance(x, str)),
    ("require-object", "Require object", "Reject values that are not JSON objects.", lambda x: isinstance(x, dict)),
    ("require-list", "Require list", "Reject values that are not JSON lists.", lambda x: isinstance(x, list)),
    ("require-number", "Require number", "Reject nonnumeric values.", lambda x: type(x) in (int, float) and math.isfinite(x)),
    ("require-integer", "Require integer", "Reject noninteger values.", lambda x: type(x) in (int, float) and math.isfinite(x) and x == int(x)),
    ("require-email", "Require email address", "Check common email address syntax.", lambda x: isinstance(x, str) and len(x) <= 254 and EMAIL.fullmatch(x)),
    ("require-uuid", "Require UUID", "Check UUID syntax.", lambda x: isinstance(x, str) and bool(re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", x))),
    ("require-http-url", "Require HTTP URL", "Check that the value is an absolute HTTP or HTTPS URL.", lambda x: isinstance(x, str) and urlsplit(x).scheme in ("http", "https") and bool(urlsplit(x).hostname)),
    ("require-boolean", "Require boolean", "Reject values other than true and false.", lambda x: isinstance(x, bool)),
):
    register(key, VALID, label, detail,
             [field("value", "Value", "any", None), field("message", "Failure message", "text", "The value is invalid.")],
             lambda a, _c, _s, test=predicate: verify(test(a["value"]), a["value"], a["message"]))
register("require-range", VALID, "Require number range", "Validate an inclusive numeric range.",
         [field("value", "Value", "number", 0), field("minimum", "Minimum", "number", 0),
          field("maximum", "Maximum", "number", 100), field("message", "Failure message", "text", "The number is outside the allowed range.")],
         lambda a, _c, _s: verify(number(a["minimum"]) <= number(a["value"]) <= number(a["maximum"]), a["value"], a["message"]))
register("require-length", VALID, "Require length", "Validate the length of text, a list, or an object.",
         [field("value", "Value", "any", ""), field("minimum", "Minimum length", "integer", 1),
          field("maximum", "Maximum length", "integer", 100), field("message", "Failure message", "text", "The value has the wrong length.")],
         lambda a, _c, _s: verify(isinstance(a["value"], (str, list, dict)) and integer(a["minimum"]) <= len(a["value"]) <= integer(a["maximum"]), a["value"], a["message"]))
register("require-one-of", VALID, "Require allowed value", "Check that a value is on the allowed list.",
         [field("value", "Value", "any", None), field("options", "Allowed values", "array", []),
          field("message", "Failure message", "text", "Choose an allowed value.")],
         lambda a, _c, _s: verify(any(compare(a["value"], "equals", item) for item in sequence(a["options"])), a["value"], a["message"]))


def timestamp(value):
    parsed = datetime.fromisoformat(string(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def iso(value):
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


register("time-now", "Date and time", "Current UTC time", "Return the current server time in ISO format.", [],
         lambda _a, _c, _s: iso(datetime.now(timezone.utc)))
register("time-unix", "Date and time", "Current Unix time", "Return seconds since the Unix epoch.", [],
         lambda _a, _c, _s: int(time.time()))
unary("time-normalize", "Date and time", "Normalize UTC date", "Parse an ISO date and return it in UTC.",
      lambda x: iso(timestamp(x)), "string", "2000-01-01")
unary("time-to-unix", "Date and time", "Date to Unix seconds", "Convert an ISO date to Unix seconds.",
      lambda x: int(timestamp(x).timestamp()), "string", "2000-01-01")
unary("time-from-unix", "Date and time", "Unix seconds to date", "Convert Unix seconds to an ISO UTC date.",
      lambda x: iso(datetime.fromtimestamp(number(x), timezone.utc)), "number", 0)
unary("time-date", "Date and time", "UTC calendar date", "Return the UTC calendar date without the time.",
      lambda x: timestamp(x).date().isoformat(), "string", "2000-01-01")
unary("time-weekday", "Date and time", "UTC weekday", "Return a weekday number with Monday as 1.",
      lambda x: timestamp(x).isoweekday(), "string", "2000-01-01")
register("time-add", "Date and time", "Shift date", "Move a UTC timestamp by an amount of time.",
         [field("value", "ISO date", default="2000-01-01"), field("amount", "Amount", "number", 1),
          field("unit", "Unit", "select", "days", options=("seconds", "minutes", "hours", "days", "weeks"))],
         lambda a, _c, _s: iso(timestamp(a["value"]) + timedelta(**{a["unit"]: number(a["amount"])})))
register("time-difference", "Date and time", "Time difference", "Return the seconds between two ISO dates.",
         [field("start", "Start date", default="2000-01-01"), field("end", "End date", default="2000-01-02")],
         lambda a, _c, _s: (timestamp(a["end"]) - timestamp(a["start"])).total_seconds())

for key, label, detail, fn in (
    ("encode-base64", "Encode Base64", "Encode UTF-8 text as Base64.", lambda x: base64.b64encode(x.encode()).decode("ascii")),
    ("decode-base64", "Decode Base64", "Read Base64 as UTF-8 text.", lambda x: base64.b64decode(x, validate=True).decode()),
    ("encode-hex", "Encode hex", "Encode UTF-8 text as hexadecimal bytes.", lambda x: x.encode().hex()),
    ("decode-hex", "Decode hex", "Read hexadecimal bytes as UTF-8 text.", lambda x: bytes.fromhex(x).decode()),
    ("encode-url", "Encode URL component", "Percent-encode one component using UTF-8.", lambda x: quote(x, safe="")),
    ("decode-url", "Decode URL component", "Decode one percent-encoded component.", lambda x: unquote(x, errors="strict")),
    ("hash-sha256", "SHA-256 digest", "Return the SHA-256 hex digest of UTF-8 text.", lambda x: hashlib.sha256(x.encode()).hexdigest()),
    ("hash-sha512", "SHA-512 digest", "Return the SHA-512 hex digest of UTF-8 text.", lambda x: hashlib.sha512(x.encode()).hexdigest()),
    ("hash-blake2b", "BLAKE2b digest", "Return the BLAKE2b hex digest of UTF-8 text.", lambda x: hashlib.blake2b(x.encode()).hexdigest()),
):
    unary(key, "Encoding", label, detail, lambda x, fn=fn: fn(string(x)), "text", "")
unary("url-parts", "Encoding", "Parse URL", "Extract URL scheme, host, port, path, query, and fragment.",
      lambda x: parse_url_parts(string(x)), "string", "https://example.com/")
unary("query-parse", "Encoding", "Parse query string", "Read form-style query data into a dictionary of value lists.",
      lambda x: parse_qs(string(x).lstrip("?"), keep_blank_values=True, max_num_fields=2000), "string", "")
unary("query-build", "Encoding", "Build query string", "Encode object fields as URL query parameters.",
      lambda x: urlencode(mapping(x), doseq=True), "object", {})
unary("csv-read", "Encoding", "Read CSV rows", "Decode CSV text using its header names.",
      lambda x: read_csv(string(x)), "text", "")


def parse_url_parts(value):
    url = urlsplit(value)
    return {"scheme": url.scheme, "host": url.hostname, "port": url.port, "path": url.path,
            "query": url.query, "fragment": url.fragment}


def read_csv(text):
    reader = csv.DictReader(io.StringIO(text))
    result = []
    for row in reader:
        if len(result) >= LIMITS["listItems"]:
            fail("CSV has too many rows.", "RESULT_LIMIT")
        result.append(row)
    return result


register("security-uuid", "Security", "Generate UUID", "Create a random version 4 UUID.", [],
         lambda _a, _c, _s: str(uuid.uuid4()))
register("security-token", "Security", "Generate random token", "Create a URL-safe cryptographic token.",
         [field("size", "Random bytes", "integer", 24)], lambda a, _c, _s: secrets.token_urlsafe(integer(a["size"], 8, 64)))


def verify_signature(args, _context, services):
    config = args["secret"]
    alias = config.get("$secret") if isinstance(config, dict) else config
    key = credential(services, alias)
    if not key:
        fail("The signature key is unavailable for this run.", "SECRET_UNAVAILABLE", 503)
    signature = string(args["signature"]).removeprefix("sha256=")
    expected = hmac.new(key.encode(), string(args["payload"]).encode(), hashlib.sha256).hexdigest()
    return verify(hmac.compare_digest(signature.lower().encode(), expected.encode()), True, "Signature did not match.")


register("verify-hmac-sha256", "Security", "Verify HMAC signature", "Verify an HMAC-SHA256 hexadecimal signature with a server-only key.",
         [field("payload", "Signed text", "text", ""), field("signature", "Signature", default=""),
          field("secret", "Server key alias", "secret", "PLOT_SECRET_WEBHOOK")], verify_signature)


def call_service(services, name, *args):
    callback = services.get(name)
    if not callable(callback):
        fail("This service is unavailable in the current run.", "SERVICE_UNAVAILABLE", 503)
    try:
        return callback(*args)
    except Exception as issue:
        if name == "package" and isinstance(issue, ValueError):
            fail("The selected package could not process these inputs.", "PACKAGE_REJECTED")
        if name == "python":
            status, code = getattr(issue, "status", None), getattr(issue, "code", None)
            if type(status) is int and 400 <= status <= 599 and isinstance(code, str) and re.fullmatch(r"PYTHON_[A-Z0-9_]{1,50}", code):
                message = str(issue)[:300] if services.get("preview") else "The Python script could not complete this operation."
                fail(message, code, status)
        if name == "db":
            status = getattr(issue, "status", None)
            code = getattr(issue, "code", None)
            if type(status) is int and status in (400, 403, 404, 409, 422) and isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]{1,70}", code):
                fail("The database rejected this operation.", code, status)
        fail("The configured service could not complete the operation.", "SERVICE_FAILED", 502)


def call_db(operation, args, _context, services):
    query = dict(args)
    query["operation"] = operation
    if "table" not in query or not isinstance(query["table"], str) or not ID.fullmatch(query["table"]):
        fail("Choose a valid table ID.")
    return call_service(services, "db", query)


TABLE = field("table", "Table", "table", "", required=True)
ROW = field("id", "Record ID", "string", "", required=True)
DATA = field("data", "Field values", "object", {})
for kind, label, detail, fields in (
    ("list", "List records", "Read a limited page of records from this site's SQLite database.",
     [TABLE, field("filter", "Filter", "any", None, description="Use a filter object or an array of filters. Leave empty for all records."),
      field("limit", "Maximum records", "integer", 50), field("offset", "Offset", "integer", 0)]),
    ("read", "Read record", "Read a record by its ID.", [TABLE, ROW]),
    ("create", "Create record", "Insert a new record using table field IDs.", [TABLE, DATA]),
    ("update", "Update record", "Update fields on one record.", [TABLE, ROW, DATA]),
    ("delete", "Delete record", "Delete one record by its ID.", [TABLE, ROW]),
):
    register(f"db-{kind}", "Database", label, detail, fields,
             lambda a, c, s, kind=kind: call_db(kind, a, c, s))

register("call-connector", "Integrations", "Call named connection", "Use a registered server connection with JSON options. Requests to external services run on hosted sites.",
         [field("name", "Connection ID", "connector", "", required=True),
          field("options", "Request options", "object", {}, description="Supported keys: method, path, query, body.")],
         lambda a, _c, s: call_service(s, "connector", string(a["name"]), mapping(a["options"])))
register("run-task", "Integrations", "Run registered task", "Pass JSON input to a named program registered on the server. Tasks run on hosted sites.",
         [field("name", "Task ID", "task", "server-clock"), field("values", "Task input", "any", {})],
         lambda a, _c, s: call_service(s, "task", string(a["name"]), a["values"]))

register("run-package", "Packages", "Run package operation", "Use an operation from a package pinned to this project.",
         [field("package", "Package", "package", "", required=True),
          field("operation", "Operation", "package-operation", "", required=True),
          field("input", "Input fields", "object", {})],
         lambda a, _c, s: mapping(call_service(s, "package", a["package"], a["operation"], mapping(a["input"]))),
         value_type="object")


def run_python_node(args, context, services):
    timeout = integer(args["timeout"], 1, LIMITS["pythonTimeoutSeconds"])
    timeout = min(timeout, math.floor(context["python_seconds"]))
    if timeout < 1:
        fail("The workflow used its 15-second Python execution budget.", "PYTHON_BUDGET", 429)
    source = context["python_scripts"][args["script"]]
    started = time.monotonic()
    try:
        return mapping(call_service(services, "python", source, args["values"], timeout))
    finally:
        context["python_seconds"] -= time.monotonic() - started


register("run-python", "Python", "Run Python script",
         "Run a Python script saved in this project with JSON input. The node returns result, logs, and durationMs.",
         [field("script", "Python script", "python-script", required=True),
          field("values", "Input values", "any", None, description="Pass JSON or a value from the workflow."),
          field("timeout", "Timeout in seconds", "integer", 5, description="Set a whole number from 1 to 15. Python nodes share 15 seconds per request.")],
         run_python_node, value_type="object")


def native(operation, value, services):
    path = services.get("native_path")
    if not path or (services.get("preview") and not services.get("allow_native")):
        fail("The Rust helper is unavailable for this run.", "NATIVE_UNAVAILABLE", 503)
    path = Path(path)
    if not path.is_absolute() or not path.is_file():
        fail("The Rust executable has not been configured.", "NATIVE_UNAVAILABLE", 503)
    data = string(value).encode("utf-8")
    if len(data) > LIMITS["textChars"]:
        fail("The Rust input is too large.", "RESULT_LIMIT")
    try:
        result = subprocess.run([str(path), operation], input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=2, check=False,
                                env={"LANG": "C.UTF-8"})
    except (OSError, subprocess.TimeoutExpired):
        fail("The Rust helper could not complete the operation.", "NATIVE_FAILED", 502)
    if result.returncode or len(result.stdout) > LIMITS["textChars"]:
        fail("The Rust helper rejected the operation.", "NATIVE_FAILED", 422)
    return result.stdout.decode("utf-8")


for key, label, detail, output_type in (
    ("fnv1a", "FNV-1a fingerprint", "Compute a 64-bit non-cryptographic fingerprint of UTF-8 text.", str),
    ("unicode-count", "Count Unicode characters", "Count Unicode scalar values using the native processor.", int),
    ("word-count", "Count words", "Count whitespace-separated words using the native processor.", int),
    ("unicode-reverse", "Reverse Unicode text", "Reverse Unicode scalar values using the native processor.", str),
    ("slug", "Make ASCII slug", "Build a lowercase ASCII slug from letters and digits using the native processor.", str),
    ("crc32", "CRC-32 checksum", "Compute the standard CRC-32 checksum of UTF-8 text.", str),
    ("line-count", "Count lines", "Count newline-delimited text lines using the native processor.", int),
):
    register(f"rust-{key}", "Rust", label, detail, [field("value", "Text", "text", "")],
             lambda a, _c, s, key=key, convert=output_type: convert(native(key, a["value"], s)))


ANALYTICS = "Analytics"
TRANSFORMS = "Data transforms"
TIME = "Date and time"
AUTH = "Security"
STRUCTURE_DEPTH = 24
STRUCTURE_LIMIT = 1000
SAFE_INTEGER = 2 ** 53 - 1
DOT_KEY = re.compile(r"[a-zA-Z0-9_-]{1,80}\Z")
DIGEST = re.compile(r"[a-fA-F0-9]{64}\Z")
RESERVED_NAMES = frozenset(("__proto__", "constructor", "prototype"))
LIST_INPUT = field("value", "List", "array", [])
FIELD_PATH = field("path", "Field path", default="", description="Use a dot path, or leave blank to use each whole entry.")
OBJECT_INPUT = field("value", "Object", "object", {})
ISO_INPUT = field("value", "ISO date", default="2026-01-01T00:00:00Z")
DECIMAL_PLACES = field("places", "Decimal places", "integer", 2, description="0–8 decimal places.")


def transform(key, group, label, description, fields, kind, fn):
    register(key, group, label, description, fields, lambda a, _c, _s: fn(a), value_type=kind)


def option(value, accepted):
    if not isinstance(value, str) or value not in accepted:
        fail("Choose one of the supported options.")
    return value


def small_object(value, limit=STRUCTURE_LIMIT):
    result = mapping(value)
    if len(result) > limit:
        fail(f"Use at most {limit} object fields.", "RESULT_LIMIT")
    return result


def path_parts(value):
    if not isinstance(value, str) or len(value) > 400:
        fail("Use field paths of at most 400 characters.")
    parts = value.split(".") if value else []
    if len(parts) > STRUCTURE_DEPTH or not all(part for part in parts):
        fail("Use a dot path with at most 24 non-empty components.")
    return parts


NO_FIELD = object()


def path_value(value, path, fallback=None):
    for part in path:
        if isinstance(value, dict) and part in value:
            value = value[part]
        elif isinstance(value, list) and part.isascii() and part.isdecimal() and len(part) <= 6 and int(part) < len(value):
            value = value[int(part)]
        else:
            return fallback
    return value


def result_rows(rows):
    # Prevent join and projection fan-out from accumulating oversized JSON.
    result = []
    space = LIMITS["valueBytes"] - 2
    for row in rows:
        size = json_size(row, space)
        if len(result) >= LIMITS["listItems"] or size is None:
            fail("The resulting list is too large.", "RESULT_LIMIT")
        space -= size + 1
        result.append(row)
    return result


def scalar_key(value):
    if type(value) in (int, float):
        return ("number", number(value))
    if value is None or type(value) in (bool, str):
        return (type(value).__name__, value)
    fail("Use a text, number, boolean or null value as the key.")


def json_key(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False, separators=(",", ":"))


def checked_name(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 160 or value in RESERVED_NAMES or any(ord(c) < 32 for c in value):
        fail("Use a nonempty field name of at most 160 characters.")
    return value


def project_rows(args):
    missing = option(args["missing"], ("null", "omit", "error"))
    columns = [(checked_name(target), path_parts(source)) for target, source in small_object(args["fields"], 64).items()]

    def project(row):
        output_row = {}
        for target, source in columns:
            value = path_value(row, source, NO_FIELD)
            if value is NO_FIELD:
                if missing == "error":
                    fail("A projected field is missing from a list entry.", "REFERENCE_MISSING", 400)
                if missing == "omit":
                    continue
                value = None
            output_row[target] = value
        return output_row

    return result_rows(project(row) for row in sequence(args["value"]))


def iso_date(value):
    try:
        return timestamp(value)
    except (OverflowError, ValueError):
        fail("Choose a supported ISO date or timestamp.")


def sort_rows(args):
    path = path_parts(args["path"])
    direction = option(args["direction"], ("ascending", "descending"))
    kind = option(args["kind"], ("text", "number", "date", "boolean"))
    present, absent = [], []

    def boolean(value):
        if type(value) is not bool:
            fail("Use true or false for a boolean sort.")
        return value

    evaluate = {"text": string, "number": number, "date": iso_date, "boolean": boolean}[kind]
    for row in sequence(args["value"]):
        value = path_value(row, path)
        if value is None:
            absent.append(row)
        else:
            present.append((evaluate(value), row))
    present.sort(key=lambda pair: pair[0], reverse=direction == "descending")
    return [row for _, row in present] + absent


def distinct_rows(args):
    rows = sequence(args["value"])
    path = path_parts(args["path"])
    last = option(args["keep"], ("first", "last")) == "last"
    seen, result = set(), []
    for row in reversed(rows) if last else rows:
        key = json_key(path_value(row, path))
        if key not in seen:
            seen.add(key)
            result.append(row)
    return result[::-1] if last else result


def index_rows(args):
    path = path_parts(args["path"])
    collision = option(args["collision"], ("error", "first", "last"))
    index = {}
    for row in sequence(args["value"]):
        key = checked_name(path_value(row, path))
        if key in index:
            if collision == "error":
                fail("The same index key occurs more than once.", "DUPLICATE_KEY")
            if collision == "first":
                continue
        index[key] = row
    return index


def join_rows(args):
    left_path, right_path = path_parts(args["leftPath"]), path_parts(args["rightPath"])
    mode = option(args["mode"], ("left", "inner"))
    index = {}
    for row in sequence(args["other"]):
        value = path_value(row, right_path)
        if value is None:
            continue
        key = scalar_key(value)
        if key in index:
            fail("The right list contains duplicate join keys.", "DUPLICATE_KEY")
        index[key] = row

    def joined():
        for row in sequence(args["value"]):
            value = path_value(row, left_path)
            match = index.get(scalar_key(value)) if value is not None else None
            if mode == "left" or match is not None:
                yield {"left": row, "right": match}
    return result_rows(joined())


def grouped_rows(rows, path):
    groups = {}
    for row in rows:
        value = path_value(row, path)
        key = scalar_key(value)
        if key not in groups:
            groups[key] = (value, [])
        groups[key][1].append(row)
    return groups.values()


def group_counts(args):
    groups = grouped_rows(sequence(args["value"]), path_parts(args["path"]))
    return result_rows({"key": key, "count": len(rows)} for key, rows in groups)


def partition_rows(args):
    matched, rejected = [], []
    path = path_parts(args["path"])
    operator = option(args["operator"], RELATIONS)
    for row in sequence(args["value"]):
        group = matched if compare(path_value(row, path), operator, args["right"]) else rejected
        group.append(row)
    return {"matched": matched, "rejected": rejected}


def page_rows(args):
    rows = sequence(args["value"])
    page, size = integer(args["page"], 1, LIMITS["listItems"]), integer(args["size"], 1, 500)
    pages = (len(rows) + size - 1) // size
    return {"items": rows[(page - 1) * size:page * size], "total": len(rows), "page": page,
            "size": size, "pages": pages, "hasNext": page < pages, "hasPrevious": page > 1 and pages > 0}


transform("list-project-rows", LIST, "Project list fields", "Shape each item into a record by mapping output names to dot paths.",
          [LIST_INPUT, field("fields", "Field map", "object", {"id": "id"}),
           field("missing", "Missing fields", "select", "null", options=("null", "omit", "error"))], "array", project_rows)
transform("list-sort-by", LIST, "Sort list by field", "Sort entries stably by a typed field. Missing and null values appear last.",
          [LIST_INPUT, FIELD_PATH, field("direction", "Direction", "select", "ascending", options=("ascending", "descending")),
           field("kind", "Sort type", "select", "text", options=("text", "number", "date", "boolean"))], "array", sort_rows)
transform("list-distinct-by", LIST, "Distinct list by field", "Keep the first or last entry for each JSON key, in original order.",
          [LIST_INPUT, FIELD_PATH, field("keep", "Keep entry", "select", "first", options=("first", "last"))], "array", distinct_rows)
transform("list-index-by", LIST, "Index list by text field", "Build a lookup object using a required text key from each item.",
          [LIST_INPUT, field("path", "Key path", default="id"),
           field("collision", "Duplicate keys", "select", "error", options=("error", "first", "last"))], "object", index_rows)
transform("list-join-by", LIST, "Join two lists by key", "Join on a unique right-side scalar key. Left mode retains unmatched entries.",
          [LIST_INPUT, field("leftPath", "Left key path", default="id"), field("other", "Right list", "array", []),
           field("rightPath", "Right key path", default="id"), field("mode", "Join mode", "select", "left", options=("left", "inner"))],
          "array", join_rows)
transform("list-group-counts", LIST, "Count entries by group", "Return each field value with the number of entries in that group.",
          [LIST_INPUT, FIELD_PATH], "array", group_counts)
transform("list-partition", LIST, "Partition list", "Split entries into matched and rejected lists using a comparison.",
          [LIST_INPUT, FIELD_PATH, *COMPARISON[1:]], "object", partition_rows)
transform("list-page-window", LIST, "Paginate a list", "Return one numbered page, counts and next or previous page indicators.",
          [LIST_INPUT, field("page", "Page number", "integer", 1), field("size", "Page size", "integer", 20)], "object", page_rows)


def dot_key(value):
    if not isinstance(value, str) or not DOT_KEY.fullmatch(value) or value in RESERVED_NAMES:
        fail("Use dot-path fields containing letters, numbers, dashes or underscores.")
    return value


def flatten_fields(args):
    def children(record, prefix):
        for next_key, value in small_object(record).items():
            path = prefix + (dot_key(next_key),)
            joined = ".".join(path)
            if len(path) > STRUCTURE_DEPTH or len(joined) > 400:
                fail("This object is too deeply nested to flatten.", "RESULT_LIMIT")
            if isinstance(value, dict) and value:
                yield from children(value, path)
            else:
                yield (joined, value)
    flattened = {}
    for key, value in children(args["value"], ()):
        if len(flattened) >= STRUCTURE_LIMIT:
            fail("Flattening produces more than 1,000 fields.", "RESULT_LIMIT")
        flattened[key] = value
    return flattened


def expand_fields(args):
    source = small_object(args["value"])
    result = {}
    for key, value in source.items():
        parts = [dot_key(part) for part in path_parts(key)]
        if not parts:
            fail("Use nonempty keys to expand an object.")
        node = result
        for index, part in enumerate(parts[:-1], start=1):
            if ".".join(parts[:index]) in source:
                fail("A field is both a destination and a parent path.", "PATH_CONFLICT")
            node = node.setdefault(part, {})
        node[parts[-1]] = value
    return result


def apply_defaults(args):
    value = mapping(args["value"])
    defaults = small_object(args["defaults"])
    replace_null = args["replaceNull"]
    if type(replace_null) is not bool:
        fail("Choose true or false for replacing null fields.")
    return {**value, **{key: item for key, item in defaults.items()
                       if key not in value or (replace_null and value[key] is None)}}


def rename_fields(args):
    renames = {checked_name(key): checked_name(value) for key, value in small_object(args["renames"]).items()}
    result = {}
    for key, value in mapping(args["value"]).items():
        destination = renames.get(key, key)
        if destination in result:
            fail("Two fields would have the same name after renaming.", "DUPLICATE_KEY")
        result[destination] = value
    return result


def changed_fields(args):
    earlier, later = mapping(args["value"]), mapping(args["other"])
    return {"added": [key for key in later if key not in earlier],
            "removed": [key for key in earlier if key not in later],
            "changed": result_rows({"key": key, "before": earlier[key], "after": later[key]} for key in earlier
                                   if key in later and json_key(earlier[key]) != json_key(later[key]))}


transform("object-flatten-paths", OBJECT, "Flatten object paths", "Convert nested fields into dot-path fields. Arrays stay intact.",
          [OBJECT_INPUT], "object", flatten_fields)
transform("object-expand-paths", OBJECT, "Expand dot paths", "Build a nested object from dot-path fields. Reject overlapping parent and leaf paths.",
          [OBJECT_INPUT], "object", expand_fields)
transform("object-apply-defaults", OBJECT, "Fill missing fields", "Fill absent fields from a default object, with an option to replace nulls.",
          [OBJECT_INPUT, field("defaults", "Default fields", "object", {}), field("replaceNull", "Replace null values", "boolean", False)],
          "object", apply_defaults)
transform("object-rename-keys", OBJECT, "Rename object fields", "Rename top-level fields without overwriting another field.",
          [OBJECT_INPUT, field("renames", "Rename map", "object", {"old": "new"})], "object", rename_fields)
transform("object-change-set", OBJECT, "Compare object fields", "List added and removed keys and before or after values for changed fields.",
          [OBJECT_INPUT, field("other", "New object", "object", {})], "object", changed_fields)


def sample_numbers(rows, path):
    values = (path_value(row, path) for row in rows)
    return [number(value) for value in values if value is not None]


def samples(args):
    return sample_numbers(sequence(args["value"]), path_parts(args["path"]))


def finite_sum(values):
    try:
        return number(math.fsum(values))
    except OverflowError:
        fail("The numeric sum exceeds the supported range.")


def percentile(ordered, percent):
    if not ordered:
        return None
    point = (len(ordered) - 1) * percent / 100
    left, fraction = int(point), point % 1
    if not fraction:
        return ordered[left]
    return number(ordered[left] * (1 - fraction) + ordered[left + 1] * fraction)


def summary(args):
    ordered = sorted(samples(args))
    total = finite_sum(ordered)
    length = len(ordered)
    return {"count": length, "min": ordered[0] if length else None, "max": ordered[-1] if length else None,
            "sum": total, "mean": total / length if length else None, "median": percentile(ordered, 50)}


def chosen_percentile(args):
    percent = number(args["percent"])
    if not 0 <= percent <= 100:
        fail("Choose a percentile from 0 to 100.")
    return percentile(sorted(samples(args)), percent)


def histogram(args):
    bounds = [number(item) for item in sequence(args["bounds"])]
    if not 1 <= len(bounds) <= 50 or any(a >= b for a, b in zip(bounds, bounds[1:])):
        fail("Use 1–50 strictly increasing bucket boundaries.")
    counts = [0] * (len(bounds) + 1)
    for value in samples(args):
        counts[bisect_right(bounds, value)] += 1
    return [{"lower": bounds[i - 1] if i else None, "upper": bounds[i] if i < len(bounds) else None, "count": count}
            for i, count in enumerate(counts)]


def group_sum(args):
    groups = grouped_rows(sequence(args["value"]), path_parts(args["path"]))
    amount_path = path_parts(args["amountPath"])

    def totals():
        for key, rows in groups:
            numbers = sample_numbers(rows, amount_path)
            yield {"key": key, "count": len(numbers), "sum": finite_sum(numbers)}
    return result_rows(totals())


def moving_average(args):
    window = integer(args["window"], 1, 500)
    values = samples(args)
    averages = []
    # Use a small, bounded compensated sum for each window to keep results
    # stable when positive and negative values cancel.
    for i in range(len(values)):
        if i + 1 < window:
            averages.append(None)
        else:
            averages.append(finite_sum(item / window for item in values[i + 1 - window:i + 1]))
    return averages


transform("stats-number-summary", ANALYTICS, "Summarise numbers", "Report count, sum, min, max, mean and median. Omit missing or null values.",
          [LIST_INPUT, FIELD_PATH], "object", summary)
transform("stats-percentile", ANALYTICS, "Calculate percentile", "Interpolate a numeric percentile, returning null for an empty sample.",
          [LIST_INPUT, FIELD_PATH, field("percent", "Percentile", "number", 95)], "number", chosen_percentile)
transform("stats-histogram", ANALYTICS, "Count histogram buckets", "Count sample values in ordered, half-open bands, including end buckets.",
          [LIST_INPUT, FIELD_PATH, field("bounds", "Upper boundaries", "array", [10, 50, 100])], "array", histogram)
transform("stats-group-sum", ANALYTICS, "Sum amounts by group", "Return each group with the sum and count of its numeric values.",
          [LIST_INPUT, FIELD_PATH, field("amountPath", "Amount path", default="amount")], "array", group_sum)
transform("stats-moving-average", ANALYTICS, "Moving average", "Average each numeric window. Omit null inputs and return null for incomplete windows.",
          [LIST_INPUT, FIELD_PATH, field("window", "Sample window", "integer", 3)], "array", moving_average)


def secret_value(services, argument):
    alias = argument.get("$secret") if isinstance(argument, dict) else argument
    value = credential(services, alias)
    if value is None:
        fail("The required server key is unavailable.", "SECRET_UNAVAILABLE", 503)
    return value


def authorised(condition):
    if not condition:
        fail("The credential or signature could not be verified.", "UNAUTHORIZED", 401)
    return True


def presented_token(value):
    if not isinstance(value, str) or not 0 < len(value) <= 4096:
        return None
    try:
        return value.encode("utf-8")
    except UnicodeError:
        return None


def verify_secret_token(args, _context, services):
    expected = secret_value(services, args["secret"]).encode("utf-8")
    supplied = presented_token(args["token"])
    return authorised(supplied is not None and hmac.compare_digest(expected, supplied))


def verify_token_digest(args):
    expected = args["digest"]
    if not isinstance(expected, str) or not DIGEST.fullmatch(expected):
        fail("Use a 64-character SHA-256 hex digest.")
    supplied = presented_token(args["token"])
    return authorised(supplied is not None and hmac.compare_digest(bytes.fromhex(expected), hashlib.sha256(supplied).digest()))


def verify_timed_hmac(args, _context, services):
    key = secret_value(services, args["secret"]).encode("utf-8")
    timestamp_value = args["timestamp"]
    if isinstance(timestamp_value, str) and re.fullmatch(r"(?:0|[1-9][0-9]{0,11})", timestamp_value):
        # A timestamp bound from an HTTP header is represented as text.
        timestamp_value = int(timestamp_value)
    seconds = integer(timestamp_value, 0, 253402300799)
    tolerance = integer(args["tolerance"], 1, 900)
    signal = args["signature"]
    if not isinstance(signal, str) or len(signal) > 71:
        return authorised(False)
    signal = signal.removeprefix("sha256=")
    if abs(int(time.time()) - seconds) > tolerance or not DIGEST.fullmatch(signal):
        return authorised(False)
    message = (str(seconds) + "." + string(args["payload"])).encode("utf-8")
    expected = hmac.new(key, message, hashlib.sha256).digest()
    return authorised(hmac.compare_digest(expected, bytes.fromhex(signal)))


def idempotency_key(args):
    value = args["value"]
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}", value):
        fail("Use an idempotency key of 16–128 ASCII letters, numbers, dots, colons, dashes or underscores.", "VALIDATION", 400)
    return value


register("security-verify-secret-token", AUTH, "Verify a server token", "Compare a presented token to a configured server secret.",
         [field("token", "Presented token", "text", ""), field("secret", "Server key alias", "secret", "PLOT_SECRET_BEARER_TOKEN")],
         verify_secret_token, value_type="boolean")
transform("security-verify-token-digest", AUTH, "Verify token digest", "Check an opaque random token against a trusted stored SHA-256 digest.",
          [field("token", "Presented token", "text", ""), field("digest", "Trusted SHA-256 digest", default="")],
          "boolean", verify_token_digest)
register("security-verify-timed-hmac", AUTH, "Verify timestamped HMAC", "Verify hexadecimal HMAC-SHA256 over Unix seconds, a dot and the raw payload.",
         [field("payload", "Raw payload", "text", ""),
          field("timestamp", "Unix seconds", "integer", 0, description="Also accepts a decimal Unix timestamp bound from a header."),
          field("signature", "Signature", default=""), field("secret", "Server key alias", "secret", "PLOT_SECRET_WEBHOOK"),
          field("tolerance", "Allowed clock difference in seconds", "integer", 300)],
         verify_timed_hmac, value_type="boolean")
transform("require-idempotency-key", VALID, "Require idempotency key", "Validate the key format before looking up or storing a request reference.",
          [field("value", "Key value", default="")], "string", idempotency_key)


def utc_window(args):
    instant = iso_date(args["value"])
    unit = option(args["unit"], ("minute", "hour", "day", "week"))
    if unit == "minute":
        start, duration = instant.replace(second=0, microsecond=0), timedelta(minutes=1)
    elif unit == "hour":
        start, duration = instant.replace(minute=0, second=0, microsecond=0), timedelta(hours=1)
    else:
        start = instant.replace(hour=0, minute=0, second=0, microsecond=0)
        duration = timedelta(days=1)
        if unit == "week":
            start, duration = start - timedelta(days=instant.weekday()), timedelta(days=7)
    try:
        end = start + duration
    except OverflowError:
        fail("The end of this UTC window is outside the supported date range.")
    return {"start": iso(start), "end": iso(end)}


def in_window(args):
    value, start, end = (iso_date(args[key]) for key in ("value", "start", "end"))
    if end <= start:
        fail("The window end must come after the start.")
    return start <= value < end


def calendar_week(args):
    year, week, weekday = iso_date(args["value"]).isocalendar()
    return {"year": year, "week": week, "weekday": weekday}


transform("time-window", TIME, "UTC time window", "Return the start and next boundary of a UTC minute, hour, day or Monday-based week.",
          [ISO_INPUT, field("unit", "Window unit", "select", "day", options=("minute", "hour", "day", "week"))],
          "object", utc_window)
transform("time-in-window", TIME, "Time in window", "Check whether a timestamp lies at or after the start and strictly before the end.",
          [ISO_INPUT, field("start", "Start date", default="2026-01-01T00:00:00Z"), field("end", "End date", default="2026-01-02T00:00:00Z")],
          "boolean", in_window)
transform("time-iso-week", TIME, "ISO calendar week", "Return the ISO week-year, week number and weekday for the UTC date.",
          [ISO_INPUT], "object", calendar_week)


def minor_units(args):
    places = integer(args["places"], 0, 8)
    value = string(args["value"]).strip()
    match = re.fullmatch(r"([+-]?)([0-9]{1,18})(?:\.([0-9]{1,8}))?", value)
    if not match:
        fail("Enter a decimal amount using digits and an optional decimal point.")
    sign, whole, fraction = match.group(1), match.group(2), match.group(3) or ""
    if len(fraction) > places:
        fail("The amount contains more decimal places than requested.")
    units = int(whole + fraction.ljust(places, "0"))
    if units > SAFE_INTEGER:
        fail("The result exceeds the safe integer range.")
    return -units if sign == "-" else units


def decimal_amount(args):
    places = integer(args["places"], 0, 8)
    value = integer(args["value"], -SAFE_INTEGER, SAFE_INTEGER)
    whole, fraction = divmod(abs(value), 10 ** places)
    return ("-" if value < 0 else "") + str(whole) + (f".{fraction:0{places}d}" if places else "")


def csv_cell(value):
    if value is None:
        return ""
    if isinstance(value, str):
        cell = string(value)
        return "'" + cell if cell[:1] in {"\t", "\r", "\n"} or cell.lstrip()[:1] in {"=", "+", "-", "@", "＝", "＋", "－", "＠"} else cell
    return json_key(value)


def write_rows(args):
    columns = [checked_name(key) for key in sequence(args["columns"])]
    if not columns or len(columns) > 64 or len(set(columns)) != len(columns):
        fail("Choose 1–64 distinct CSV column names.")
    output_file, row_file = io.StringIO(), io.StringIO()
    writer = csv.writer(row_file, lineterminator="\r\n")

    def write(record):
        writer.writerow(csv_cell(item) for item in record)
        if output_file.tell() + row_file.tell() > LIMITS["textChars"]:
            fail("The CSV text exceeds the output limit.", "RESULT_LIMIT")
        output_file.write(row_file.getvalue())
        row_file.seek(0)
        row_file.truncate()

    write(columns)
    for row in sequence(args["value"]):
        data = mapping(row)
        write(data.get(column) for column in columns)
    return output_file.getvalue()


transform("data-parse-minor-units", TRANSFORMS, "Decimal to minor units", "Parse decimal text into a safe integer without binary floating-point rounding.",
          [field("value", "Decimal amount", default="0.00"), DECIMAL_PLACES], "number", minor_units)
transform("data-format-minor-units", TRANSFORMS, "Minor units to decimal", "Format a safe integer as decimal text with a fixed number of places.",
          [field("value", "Minor units", "integer", 0), DECIMAL_PLACES], "string", decimal_amount)
transform("csv-write", TRANSFORMS, "Write CSV records", "Write records in the chosen column order and protect formula-like text cells.",
          [LIST_INPUT, field("columns", "Column names", "array", ["id", "name"])], "string", write_rows)
