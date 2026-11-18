"""SQLite runtime for Plot Studio exports.

Run locally with python runtime.py, or point a WSGI host at runtime.application.
"""

import argparse
import json
import math
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import uuid

from contextlib import contextmanager
from datetime import date, datetime, timezone
from http import HTTPStatus
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlsplit
from wsgiref.simple_server import WSGIServer, make_server
from wsgiref.util import FileWrapper


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
SCHEMA = ROOT / "database" / "schema.json"
API_PATH = "/api/data/query"
BACKEND_CONFIG = ROOT / "backend.json"
MAX_BODY = 2 * 1024 * 1024
MAX_SAFE_INTEGER = 9007199254740991
OPERATIONS = {"list", "read", "create", "update", "delete"}
TEXT_TYPES = {"text", "longText", "email", "url"}
ORDERED_TYPES = {"number", "integer", "date", "datetime"}
FIELD_TYPES = TEXT_TYPES | ORDERED_TYPES | {"boolean", "json"}
FILTER_OPERATORS = {"eq", "ne", "contains", "gt", "gte", "lt", "lte", "empty"}
RESERVED_IDS = {"id", "__proto__", "constructor", "prototype"}
ID_PATTERN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}")
DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
DATETIME_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]"
    r"(?::[0-5][0-9](?:\.[0-9]{1,3})?)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])?"
)
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+")
PRIVATE_LAYOUT = "__plot_layout"
READY = threading.Lock()
DB = None


class ApiError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.status = status


def invalid_query(message):
    return ApiError("INVALID_QUERY", message)


def invalid_value(field, detail):
    return ApiError("INVALID_VALUE", f"{field.get('name') or 'Value'} {detail}")


def valid_id(value):
    return isinstance(value, str) and ID_PATTERN.fullmatch(value) is not None and value not in RESERVED_IDS


def plain_text(value):
    return isinstance(value, str) and not re.search(r"[\ud800-\udfff]", value)


def finite_number(value):
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def canonical_date(value):
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def canonical_datetime(value):
    if not isinstance(value, str) or not DATETIME_PATTERN.fullmatch(value):
        return None
    try:
        padded = re.sub(r"\.([0-9]{1,3})(?=Z|[+-]|$)", lambda match: "." + match[1].ljust(3, "0"), value)
        timestamp = datetime.fromisoformat(padded[:-1] + "+00:00" if padded.endswith("Z") else padded)
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return timestamp.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        return None


def valid_url(value):
    if re.search(r"[\s\\\x00-\x1f\x7f]", value):
        return False
    try:
        url = urlsplit(value)
        port = url.port
        return url.scheme.lower() in {"https", "http"} and bool(url.hostname) and (port is None or 0 <= port <= 65535)
    except ValueError:
        return False


def normal_json(value, depth=0):
    if depth > 64:
        raise ValueError("JSON nesting is too deep")
    if value is None or type(value) is bool or plain_text(value):
        return value
    if finite_number(value):
        number = float(value)
        return int(number) if number.is_integer() and abs(number) < 1e21 else number
    if isinstance(value, list):
        return [normal_json(child, depth + 1) for child in value]
    if isinstance(value, dict) and all(plain_text(key) for key in value):
        return {key: normal_json(child, depth + 1) for key, child in value.items()}
    raise ValueError("Unsupported JSON value")


def typed_value(field, value, *, require=None):
    required = field.get("required", False) if require is None else require
    kind = field["type"]
    if value is None:
        if required:
            raise invalid_value(field, "is required.")
        return None
    if kind in TEXT_TYPES:
        if not plain_text(value):
            raise invalid_value(field, "must be text.")
        if required and not value.strip():
            raise invalid_value(field, "is required.")
        if kind == "email" and value and not EMAIL_PATTERN.fullmatch(value):
            raise invalid_value(field, "must be an email address.")
        if kind == "url" and value and not valid_url(value):
            raise invalid_value(field, "must be an HTTP or HTTPS URL.")
        return value
    if kind == "number" and finite_number(value):
        return float(value) or 0
    if kind == "integer" and finite_number(value) and int(value) == value and abs(value) <= MAX_SAFE_INTEGER:
        return int(value)
    if kind == "boolean" and type(value) is bool:
        return value
    if kind == "date" and canonical_date(value):
        return value
    if kind == "datetime":
        timestamp = canonical_datetime(value)
        if timestamp:
            return timestamp
    if kind == "json":
        try:
            return normal_json(value)
        except ValueError as error:
            raise invalid_value(field, "must contain valid JSON.") from error
    details = {
        "number": "must be a finite number.",
        "integer": "must be a safe whole number.",
        "boolean": "must be true or false.",
        "date": "must be a valid date (YYYY-MM-DD).",
        "datetime": "must be a valid ISO date and time.",
    }
    raise invalid_value(field, details.get(kind, "has an unsupported field type."))


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False)


def physical_name(prefix, item_id):
    if re.fullmatch(r"[a-z0-9-]+", item_id):
        return f"{prefix}_{item_id}"
    return f"{prefix}_encoded_{item_id.encode('ascii').hex()}"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def table_name(table_id):
    return identifier(physical_name("table", table_id))


def field_name(field_id):
    return identifier(physical_name("field", field_id))


def sql_column(field):
    name = field_name(field["id"])
    kind = field["type"]
    type_name = {"number": "REAL", "integer": "INTEGER", "boolean": "INTEGER"}.get(kind, "TEXT")
    required = " NOT NULL" if field.get("required") else ""
    constraint = f" CHECK ({name} IN (0,1))" if kind == "boolean" else ""
    return f"{name} {type_name}{required}{constraint}"


def sql_value(field, value):
    if value is None:
        return None
    if field["type"] == "json":
        return compact_json(value)
    return int(value) if field["type"] == "boolean" else value


def from_sql(field, value):
    if value is None:
        return None
    if field["type"] == "json":
        return json.loads(value)
    return bool(value) if field["type"] == "boolean" else value


def read_schema(source=None):
    try:
        schema = source if isinstance(source, dict) else json.loads((source or SCHEMA).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RuntimeError("Could not read database/schema.json.") from error
    if not isinstance(schema, dict) or schema.get("version") != 1 or not isinstance(schema.get("tables"), list):
        raise RuntimeError("The export has an unsupported database schema.")
    tables = {}
    for table in schema["tables"]:
        if not isinstance(table, dict) or not valid_id(table.get("id")) or table["id"] in tables:
            raise RuntimeError("The export has an invalid or duplicate table ID.")
        if not isinstance(table.get("fields"), list) or not isinstance(table.get("permissions"), dict):
            raise RuntimeError("The export has an invalid table definition.")
        seen = set()
        for field in table["fields"]:
            if not isinstance(field, dict) or not valid_id(field.get("id")) or field["id"] in seen:
                raise RuntimeError("The export has an invalid or duplicate field ID.")
            if not isinstance(field.get("type"), str) or field["type"] not in FIELD_TYPES or type(field.get("required")) is not bool:
                raise RuntimeError("The export has an invalid field type.")
            seen.add(field["id"])
        tables[table["id"]] = table
    return tables


class Database:
    def __init__(self, schema=None, path=None, *, initialize=True):
        self.tables = read_schema(schema)
        self.path = Path(path or os.environ.get("PLOT_DATA_DB", str(ROOT / "database" / "site.sqlite3"))).resolve()
        if self.path.is_relative_to(PUBLIC.resolve()):
            raise RuntimeError("The SQLite database must be outside the public directory.")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if initialize:
            self.initialize()

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.path, timeout=8)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def initialize(self):
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(f'CREATE TABLE IF NOT EXISTS "{PRIVATE_LAYOUT}" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL)')
            stored = conn.execute(f'SELECT "value" FROM "{PRIVATE_LAYOUT}" WHERE "key" = ?', ("layout",)).fetchone()
            old_layout = json.loads(stored[0]) if stored else {}
            merged_layout = dict(old_layout)
            for table in self.tables.values():
                self.reconcile_table(conn, table, old_layout, merged_layout)
            conn.execute(f'INSERT OR REPLACE INTO "{PRIVATE_LAYOUT}" ("key","value") VALUES (?,?)', ("layout", compact_json(merged_layout)))

    def reconcile_table(self, conn, table, old_layout, merged_layout):
        table_id = table["id"]
        name = table_name(table_id)
        current = {field["id"]: [field["type"], field["required"]] for field in table["fields"]}
        previous = old_layout.get(table_id)
        if previous is None:
            column_defs = ['"_position" INTEGER PRIMARY KEY AUTOINCREMENT', '"id" TEXT NOT NULL UNIQUE']
            column_defs.extend(sql_column(field) for field in table["fields"])
            # A manually imported schema.sql may have already created an empty table.
            conn.execute(f"CREATE TABLE IF NOT EXISTS {name} ({', '.join(column_defs)})")
            self.seed_table(conn, table)
            merged_layout[table_id] = current
            return

        for field_id, old in previous.items():
            if (field_id in current and old != current[field_id]) or (field_id not in current and old[1]):
                raise RuntimeError(f"Table {table_id} has an incompatible field change. Back up and migrate the existing database.")
        for field in table["fields"]:
            if field["id"] not in previous:
                if field["required"]:
                    raise RuntimeError(f"Table {table_id} has a new required field. Back up and migrate the existing database.")
                conn.execute(f"ALTER TABLE {name} ADD COLUMN {sql_column(field)}")
        merged_layout[table_id] = {**previous, **current}

    def seed_table(self, conn, table):
        seed = table.get("rows", [])
        if not isinstance(seed, list):
            raise RuntimeError("The export has invalid seed rows.")
        if seed and conn.execute(f"SELECT 1 FROM {table_name(table['id'])} LIMIT 1").fetchone() is None:
            for row in seed:
                if not isinstance(row, dict) or not valid_id(row.get("id")):
                    raise RuntimeError("The export contains an invalid seed row.")
                body = {key: value for key, value in row.items() if key != "id"}
                self.insert(conn, table, row["id"], self.collect_values(table, body, partial=False))

    def collect_values(self, table, data, *, partial):
        if data is None:
            data = {}
        if not isinstance(data, dict):
            raise invalid_query("Provide a data object with field IDs as keys.")
        known = {field["id"]: field for field in table["fields"]}
        for field_id in data:
            if field_id not in known:
                raise ApiError("UNKNOWN_FIELD", f"Unknown field ID: {field_id}.")
        return {
            field["id"]: typed_value(field, data.get(field["id"]))
            for field in table["fields"] if not partial or field["id"] in data
        }

    def insert(self, conn, table, row_id, data):
        columns = ['"id"'] + [field_name(field["id"]) for field in table["fields"]]
        values = [row_id] + [sql_value(field, data[field["id"]]) for field in table["fields"]]
        placeholders = ", ".join("?" for _ in values)
        conn.execute(f"INSERT INTO {table_name(table['id'])} ({', '.join(columns)}) VALUES ({placeholders})", values)
        return {"id": row_id, **data}

    def select(self, conn, table, where, values, suffix=""):
        columns = ['"id"'] + [field_name(field["id"]) for field in table["fields"]]
        query = f"SELECT {', '.join(columns)} FROM {table_name(table['id'])}"
        if where:
            query += " WHERE " + where
        for row in conn.execute(query + suffix, values):
            yield {"id": row[0], **{
                field["id"]: from_sql(field, value)
                for field, value in zip(table["fields"], row[1:])
            }}

    def query(self, request, *, internal=False):
        if not isinstance(request, dict) or not isinstance(request.get("operation"), str) or request["operation"] not in OPERATIONS:
            raise invalid_query("Choose a supported data operation.")
        operation = request["operation"]
        table_id = request.get("table")
        table = self.tables.get(table_id) if isinstance(table_id, str) else None
        if table is None:
            raise ApiError("TABLE_NOT_FOUND", "The table was not found.", 404)
        permissions = table["permissions"]
        if not internal and permissions.get(operation) is not True:
            raise ApiError("FORBIDDEN", "This operation is disabled for this table.", 403)

        with self.connection() as conn:
            if operation == "list":
                filters, values = compile_filters(table, request.get("filter"))
                limit = pagination(request.get("limit"), 100, 500)
                offset = pagination(request.get("offset"), 0, MAX_SAFE_INTEGER)
                return list(self.select(conn, table, filters, [*values, limit, offset], ' ORDER BY "_position" LIMIT ? OFFSET ?'))
            if operation == "create":
                data = self.collect_values(table, request.get("data"), partial=False)
                return self.insert(conn, table, f"row-{uuid.uuid4()}", data)

            row_id = request.get("id")
            if not valid_id(row_id):
                raise invalid_query("Provide a valid row ID.")
            if operation in {"update", "delete"}:
                conn.execute("BEGIN IMMEDIATE")
            row = next(self.select(conn, table, '"id" = ?', (row_id,)), None)
            if row is None:
                raise ApiError("NOT_FOUND", "The row was not found.", 404)
            disclose = internal or permissions.get("read") is True or permissions.get("list") is True
            if operation == "update":
                changes = self.collect_values(table, request.get("data"), partial=True)
                fields = [field for field in table["fields"] if field["id"] in changes]
                if fields:
                    assignments = ", ".join(f"{field_name(field['id'])} = ?" for field in fields)
                    values = [sql_value(field, changes[field["id"]]) for field in fields]
                    conn.execute(f'UPDATE {table_name(table["id"])} SET {assignments} WHERE "id" = ?', (*values, row_id))
                return {**row, **changes} if disclose else {"id": row_id, **changes}
            if operation == "delete":
                conn.execute(f'DELETE FROM {table_name(table["id"])} WHERE "id" = ?', (row_id,))
                return row if disclose else {"id": row_id}
            return row


def pagination(value, fallback, maximum):
    if value is None:
        return fallback
    if not finite_number(value) or value < 0 or value > maximum or int(value) != value:
        raise invalid_query("The pagination value is out of range.")
    return int(value)


def compile_filters(table, filters):
    if filters is None:
        return "", []
    entries = filters if isinstance(filters, list) else [filters]
    if len(entries) > 16:
        raise invalid_query("Use no more than 16 filters per query.")
    known = {field["id"]: field for field in table["fields"]}
    known["id"] = {"id": "id", "name": "ID", "type": "text"}
    clauses, values = [], []
    for item in entries:
        if not isinstance(item, dict) or not isinstance(item.get("operator"), str) or item["operator"] not in FILTER_OPERATORS:
            raise invalid_query("Each filter needs a supported operator.")
        field_id = item.get("field")
        field = known.get(field_id) if isinstance(field_id, str) else None
        if field is None:
            raise ApiError("UNKNOWN_FIELD", "Unknown filter field ID.")
        operator = item["operator"]
        column = '"id"' if field_id == "id" else field_name(field_id)
        kind = field["type"]
        if operator == "empty":
            if kind in TEXT_TYPES or kind == "json":
                clauses.append(f"({column} IS NULL OR {column} = ?)")
                values.append(sql_value(field, ""))
            else:
                clauses.append(f"{column} IS NULL")
            continue
        if "value" not in item:
            raise invalid_query("This filter requires a value.")
        if operator == "contains":
            if kind not in TEXT_TYPES or not plain_text(item["value"]):
                raise invalid_query("Contains requires a text field and a text value.")
            clauses.append(f"instr({column}, ?) > 0")
            values.append(item["value"])
            continue
        value = typed_value(field, item["value"], require=False)
        if operator in {"eq", "ne"}:
            comparison = "IS" if operator == "eq" else "IS NOT"
            clauses.append(f"{column} {comparison} ?")
        else:
            if kind not in ORDERED_TYPES or value is None:
                raise invalid_query("Ordering filters require a number, date, or date and time.")
            comparison = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[operator]
            clauses.append(f"{column} {comparison} ?")
        values.append(sql_value(field, value))
    return " AND ".join(clauses), values


def database():
    global DB
    with READY:
        if DB is None:
            DB = Database()
        return DB


def json_response(start_response, status, data, headers=()):
    body = compact_json(data).encode("utf-8", errors="replace")
    start_response(f"{status} {HTTPStatus(status).phrase}", [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
        *headers,
    ])
    return [body]


def reject_constant(_value):
    raise ValueError("JSON numbers must be finite")


def read_query(environ):
    if environ.get("REQUEST_METHOD") != "POST":
        raise ApiError("METHOD_NOT_ALLOWED", "Use POST for data queries.", 405)
    origin = environ.get("HTTP_ORIGIN")
    if origin:
        try:
            location = urlsplit(origin)
            valid_origin = location.scheme in {"http", "https"} and location.netloc.lower() == environ.get("HTTP_HOST", "").lower()
        except ValueError:
            valid_origin = False
        if not valid_origin:
            raise ApiError("FORBIDDEN", "Send the request from the website's origin.", 403)
    media_type = environ.get("CONTENT_TYPE", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise ApiError("UNSUPPORTED_MEDIA_TYPE", "Send the query as JSON.", 415)
    try:
        size = int(environ.get("CONTENT_LENGTH", ""))
    except (TypeError, ValueError):
        raise ApiError("LENGTH_REQUIRED", "Provide a request body length.", 411) from None
    if size > MAX_BODY:
        raise ApiError("REQUEST_TOO_LARGE", "The data query is too large.", 413)
    if size <= 0:
        raise invalid_query("The query body is empty.")
    try:
        text = environ["wsgi.input"].read(size).decode("utf-8")
        return json.loads(text, parse_constant=reject_constant)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise invalid_query("The query body is not valid JSON.") from error


def unpack_query(value):
    return {key: items[0] if len(items) == 1 else items for key, items in parse_qs(value, keep_blank_values=True, max_num_fields=128).items()}


def read_workflow_request(environ):
    method = environ.get("REQUEST_METHOD", "GET")
    headers = {key[5:].lower().replace("_", "-"): value for key, value in environ.items()
               if key.startswith("HTTP_") and key not in {"HTTP_COOKIE", "HTTP_PROXY", "HTTP_CONNECTION"}}
    media_type = environ.get("CONTENT_TYPE", "").split(";", 1)[0].strip().lower()
    headers["content-type"] = media_type
    try:
        size = int(environ.get("CONTENT_LENGTH") or "0")
        if size < 0 or size > MAX_BODY:
            raise ApiError("REQUEST_TOO_LARGE", "The request body is too large.", 413)
        text = environ["wsgi.input"].read(size).decode("utf-8") if size else ""
        if media_type.endswith("json") and text:
            body = json.loads(text, parse_constant=reject_constant)
        elif media_type == "application/x-www-form-urlencoded" and text:
            body = unpack_query(text)
        else:
            body = text or None
        query = unpack_query(environ.get("QUERY_STRING", ""))
    except (ValueError, UnicodeError, RecursionError) as issue:
        if isinstance(issue, ApiError):
            raise
        raise ApiError("INVALID_REQUEST", "The body or query could not be read.", 400) from issue
    return {"method": method, "path": environ.get("PATH_INFO", "/"), "query": query, "headers": headers,
            "body": body, "raw": text, "client": environ.get("REMOTE_ADDR", "")}


def workflow_response(environ, start_response):
    from backend_engine import run_workflow
    from backend_services import services_for
    from python_runner import run_python

    try:
        config = json.loads(BACKEND_CONFIG.read_text(encoding="utf-8"))
        services = services_for(database(), packages=config.get("packages", []))
        services['python'] = run_python
        result = run_workflow(config, read_workflow_request(environ), services)
        status = result.get("status", 200)
        safe_headers = []
        response_type = "application/json; charset=utf-8"
        for key, value in (result.get("headers") or {}).items():
            lower = key.lower()
            if isinstance(value, str) and "\r" not in value and "\n" not in value:
                if lower == "content-type" and value.startswith(("application/json", "text/plain")):
                    response_type = value
                elif lower in {"retry-after", "allow"} or (re.fullmatch(r"x-[a-z0-9-]{1,60}", lower) and not re.match(r"x-(?:accel-|sendfile|forwarded-|real-ip|frame-options|content-type-options|original-|rewrite-|internal-|upstream-)", lower)):
                    safe_headers.append((key, value))
        data = result.get("body")
        body = (str(data or "") if response_type.startswith("text/plain") else compact_json(data)).encode("utf-8", "replace")
        if status in {204, 304}:
            body = b""
        start_response(f"{status} {HTTPStatus(status).phrase}", [("Content-Type", response_type), ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), *safe_headers])
        return [body] if environ.get("REQUEST_METHOD") != "HEAD" else []
    except ApiError as issue:
        return json_response(start_response, issue.status, {"error": {"code": issue.code, "message": str(issue)}})
    except (OSError, RuntimeError, ValueError, sqlite3.DatabaseError):
        return json_response(start_response, 500, {"error": {"code": "BACKEND_RUNTIME", "message": "The backend could not complete the request."}})


def serve_public(environ, start_response):
    method = environ.get("REQUEST_METHOD")
    if method not in {"GET", "HEAD"}:
        return json_response(start_response, 405, {"error": {"code": "METHOD_NOT_ALLOWED", "message": "Use GET or HEAD."}}, [("Allow", "GET, HEAD")])
    requested = environ.get("PATH_INFO", "/")
    root = PUBLIC.resolve()
    try:
        parts = requested.strip("/").split("/")
        if "\\" in requested or any(part.startswith(".") for part in parts):
            raise ValueError("Invalid path")
        relative = requested.lstrip("/") or "index.html"
        target = (root / relative).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise FileNotFoundError()
        size = target.stat().st_size
        stream = target.open("rb") if method == "GET" else None
    except (ValueError, OSError, RuntimeError):
        return json_response(start_response, 404, {"error": {"code": "NOT_FOUND", "message": "The page was not found."}})
    content_type = {
        ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    }.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    start_response("200 OK", [
        ("Content-Type", content_type), ("Content-Length", str(size)),
        ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ])
    return environ.get("wsgi.file_wrapper", FileWrapper)(stream) if stream else []


def application(environ, start_response):
    path = environ.get("PATH_INFO", "/")
    if path != API_PATH:
        if path.startswith("/api/") and BACKEND_CONFIG.is_file():
            return workflow_response(environ, start_response)
        return serve_public(environ, start_response)
    try:
        request = read_query(environ)
        return json_response(start_response, 200, {"result": database().query(request)})
    except ApiError as error:
        headers = [("Allow", "POST")] if error.status == 405 else []
        return json_response(start_response, error.status, {"error": {"code": error.code, "message": str(error)}}, headers)
    except sqlite3.OperationalError as error:
        if any(marker in str(error).lower() for marker in ("locked", "busy")):
            return json_response(start_response, 503, {"error": {"code": "DATABASE_BUSY", "message": "The database is busy. Try again."}}, [("Retry-After", "1")])
        print("Plot Studio database query failed:", error, file=sys.stderr)
    except (OSError, RuntimeError, ValueError, sqlite3.DatabaseError) as error:
        print("Plot Studio database query failed:", error, file=sys.stderr)
    return json_response(start_response, 500, {"error": {"code": "DATABASE_ERROR", "message": "The site database could not complete the query."}})


class LocalServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True
    request_queue_size = 64


def main():
    parser = argparse.ArgumentParser(description="Run a Plot Studio export with its SQLite database.")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    try:
        database()
    except (OSError, RuntimeError, ValueError, ApiError, sqlite3.DatabaseError) as error:
        parser.exit(1, f"{error}\n")
    with make_server("127.0.0.1", args.port, application, server_class=LocalServer) as server:
        print(f"Plot Studio export running at http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
