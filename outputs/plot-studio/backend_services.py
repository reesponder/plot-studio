"""Server-configured integration transport for published workflow routes."""

import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
from functools import partial
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from workflow_packages import package_catalog, run_package


SECRET_NAME = re.compile(r"PLOT_(?:API_KEY|SECRET_[A-Z0-9_]{1,70})\Z")
NAME = re.compile(r"[a-z][a-z0-9-]{0,59}\Z")
METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"}
OUTPUT_CAP = 1024 * 1024
ROOT = Path(__file__).resolve().parent


def _registry(env_name):
    raw = os.environ.get(env_name, "")
    filename = os.environ.get(env_name + "_FILE")
    try:
        if filename:
            raw = Path(filename).read_text(encoding="utf-8")
        result = json.loads(raw) if raw and len(raw) <= 200000 else {}
    except (OSError, ValueError):
        return {}
    if not isinstance(result, dict):
        return {}
    return {name: value for name, value in result.items() if NAME.fullmatch(name) and isinstance(value, dict)}


def connection_registry(studio_connectors=None):
    if studio_connectors is None:
        studio_connectors = _registry("PLOT_STUDIO_CONNECTORS")
    else:
        studio_connectors = {name: value for name, value in studio_connectors.items()
                             if NAME.fullmatch(name) and isinstance(value, dict)}
    return {**_registry("PLOT_CONNECTORS"), **studio_connectors}


def task_registry():
    clock = "import datetime,json; print(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}))"
    return {"server-clock": {"label": "Server clock", "argv": [sys.executable, "-c", clock]}, **_registry("PLOT_SERVER_TASKS")}


def secret(name):
    return os.environ.get(name) if isinstance(name, str) and SECRET_NAME.fullmatch(name) else None


def native_path():
    configured = os.environ.get("PLOT_NATIVE_PATH")
    candidates = [Path(configured)] if configured else [ROOT / "plot-native", ROOT / "plot-native.exe"]
    return next((str(path.resolve()) for path in candidates if path.is_file() and os.access(path, os.X_OK)), None)


def available_services(studio_connectors=None):
    def labels(items):
        return [{"id": key, "label": str(item.get("label") or key)[:90]} for key, item in items.items()]
    return {
        "connectors": labels(connection_registry(studio_connectors)),
        "tasks": labels(task_registry()),
        "native": bool(native_path()),
        "packages": package_catalog(),
    }


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _public_host(host, port):
    try:
        entries = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        return bool(entries) and all(ipaddress.ip_address(entry[4][0]).is_global for entry in entries)
    except (ValueError, OSError):
        return False


def redact_credential(value, token):
    if isinstance(value, str):
        return value.replace(token, "[redacted]")
    if isinstance(value, list):
        return [redact_credential(item, token) for item in value]
    if isinstance(value, dict):
        return {redact_credential(key, token): redact_credential(item, token) for key, item in value.items()}
    return value


def connector(name, options=None, *, studio_connectors=None, secret_reader=secret, **extra):
    values = {**(options if isinstance(options, dict) else {}), **extra}
    definition = connection_registry(studio_connectors).get(name)
    if not definition:
        raise ValueError("The named server connection has not been configured.")
    address = str(definition.get("url", ""))
    parsed = urlsplit(address)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("The configured connection address is invalid.")
    local = definition.get("allowPrivate") is True
    if not local and (parsed.scheme != "https" or not _public_host(parsed.hostname, parsed.port or 443)):
        raise ValueError("This connection requires a public HTTPS address or explicit private access in its server configuration.")
    allowed = definition.get("methods") or ["GET"]
    method = str(values.get("method") or allowed[0]).upper()
    if method not in METHODS or method not in allowed:
        raise ValueError("The connection does not allow this method.")
    supplied_path = values.get("path") or ""
    allowed_paths = definition.get("paths") or []
    if supplied_path:
        if not isinstance(supplied_path, str) or supplied_path not in allowed_paths or not re.fullmatch(r"/[A-Za-z0-9_./-]{1,200}", supplied_path) or ".." in supplied_path or "//" in supplied_path:
            raise ValueError("This path is not registered for the connection.")
        address = parsed._replace(path=parsed.path.rstrip("/") + supplied_path).geturl()
    query = values.get("query")
    if isinstance(query, dict) and query:
        encoded = urlencode(query, doseq=True)
        if len(encoded) > 4000:
            raise ValueError("The connection query is too large.")
        address += ("&" if "?" in address else "?") + encoded
    headers = {"Accept": "application/json, text/plain;q=0.8", "User-Agent": "PLOT-Studio-Runner/1"}
    alias = definition.get("credentialAlias")
    header = "Authorization"
    if alias:
        if parsed.scheme != "https" or not isinstance(alias, str) or not SECRET_NAME.fullmatch(alias):
            raise ValueError("A connection with a saved secret requires HTTPS and a valid alias.")
        header = definition.get("credentialHeader", "Authorization")
        if header not in {"Authorization", "X-API-Key"}:
            raise ValueError("The configured credential header is invalid.")
        token = secret_reader(alias)
        if not token:
            raise ValueError("The connection's saved secret is unavailable.")
    else:
        token = definition.get("credential") or secret_reader(definition.get("token"))
    if token:
        if not isinstance(token, str) or len(token) > 4096 or any(ord(char) < 32 or ord(char) > 126 for char in token):
            raise ValueError("The connection credential must fit on one HTTP header line.")
        headers[header] = "Bearer " + token if header == "Authorization" else token
    body = None
    if method not in {"GET", "HEAD"} and values.get("body") is not None:
        body = json.dumps(values["body"], ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(body) > OUTPUT_CAP:
            raise ValueError("The connection request is too large.")
        headers["Content-Type"] = "application/json"
    opener = build_opener(NoRedirect())
    try:
        response = opener.open(Request(address, data=body, headers=headers, method=method), timeout=5)
    except HTTPError as error:
        if error.code in {301, 302, 303, 307, 308}:
            error.close()
            raise ValueError("The connection tried to redirect. Use the final server address.") from None
        response = error
    with response:
        data = response.read(OUTPUT_CAP + 1)
        if len(data) > OUTPUT_CAP:
            raise ValueError("The connection response is too large.")
        text = data.decode("utf-8", errors="replace")
        try:
            body = json.loads(text)
        except ValueError:
            body = text
        if token:
            body = redact_credential(body, token)
        return {"status": response.status, "body": body}


def task(name, values=None, **extra):
    rule = task_registry().get(name)
    if not rule:
        raise ValueError("The named server task has not been configured.")
    argv = rule.get("argv")
    if not isinstance(argv, list) or not 1 <= len(argv) <= 24 or not all(isinstance(part, str) and len(part) <= 2000 for part in argv) or not Path(argv[0]).is_absolute():
        raise ValueError("The registered task command is invalid.")
    data = json.dumps(values if values is not None else extra, ensure_ascii=False, allow_nan=False).encode("utf-8")
    if len(data) > OUTPUT_CAP:
        raise ValueError("The task input is too large.")
    try:
        with tempfile.TemporaryFile() as result:
            completed = subprocess.run(argv, shell=False, input=data, stdout=result, stderr=subprocess.DEVNULL, timeout=5,
                                       env={"PATH": os.defpath, "LANG": "C.UTF-8", "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")}, check=False)
            if completed.returncode:
                raise ValueError("The server task failed.")
            if result.tell() > OUTPUT_CAP:
                raise ValueError("The server task output is too large.")
            result.seek(0)
            output = result.read().decode("utf-8", errors="replace")
    except subprocess.TimeoutExpired as error:
        raise ValueError("The server task timed out.") from error
    try:
        return json.loads(output)
    except ValueError:
        return output


def services_for(database, *, preview=False, native_preview=False, packages=(), studio_connectors=None, secret_reader=None):
    reader = secret_reader if secret_reader is not None else (lambda _name: None) if preview else secret
    return {
        "db": lambda query: database.query(query, internal=True),
        "secret": reader,
        "connector": partial(connector, studio_connectors=studio_connectors, secret_reader=reader) if not preview else None,
        "task": task if not preview else None,
        "package": lambda package_id, operation, value: run_package(packages, package_id, operation, value),
        "preview": preview,
        "native_path": native_path() if not preview or native_preview else None,
        "allow_native": bool(native_preview),
    }
