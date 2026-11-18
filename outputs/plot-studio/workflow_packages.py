"""Versioned, curated operations available to PLOT backend projects."""

import csv
import io
import json
import re
from decimal import Decimal, ROUND_HALF_UP, localcontext
from importlib import import_module, metadata, util


PACKAGE_VERSION = "1.0.0"
PHONE_VERSION = "9.0.43"
VALUE_BYTES = 384 * 1024
CSV_ROWS = 500
CSV_COLUMNS = 40
CSV_CELL_CHARS = 4096
MAX_SAFE_INTEGER = 9007199254740991
TEMPLATE_TOKEN = re.compile(r"\{\{[ \t]*([A-Za-z_][A-Za-z0-9_]{0,63})[ \t]*\}\}")
DECIMAL_TEXT = re.compile(r"-?[0-9]{1,13}(?:\.[0-9]{1,8})?\Z")


def _text(value, label, limit, *, empty=False):
    if not isinstance(value, str) or len(value) > limit or "\0" in value or (not empty and not value.strip()):
        raise ValueError(f"{label} must be text of at most {limit} characters" + ("." if empty else " and cannot be empty."))
    return value


def _json_budget(value, label):
    encoder = json.JSONEncoder(ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    size = 0
    try:
        for part in encoder.iterencode(value):
            size += len(part.encode("utf-8"))
            if size > VALUE_BYTES:
                break
    except (TypeError, ValueError, RecursionError):
        raise ValueError(f"{label} must contain valid JSON values.") from None
    if size > VALUE_BYTES:
        raise ValueError(f"{label} exceeds {VALUE_BYTES // 1024} KiB.")


def _delimiter(data):
    value = data.get("delimiter", ",")
    if value not in (",", ";", "\t"):
        raise ValueError("Choose a comma, semicolon or tab for the CSV delimiter.")
    return value


def _columns(values):
    if not isinstance(values, list) or not 1 <= len(values) <= CSV_COLUMNS:
        raise ValueError(f"Provide between 1 and {CSV_COLUMNS} column names.")
    names = [_text(value, "Every column name", 128).strip() for value in values]
    if len(set(names)) != len(names):
        raise ValueError("CSV column names must be unique.")
    if any(ord(char) < 32 or ord(char) == 127 for name in names for char in name):
        raise ValueError("CSV column names cannot contain control characters.")
    if set(names).intersection({"__proto__", "constructor", "prototype"}):
        raise ValueError("The CSV contains a reserved column name.")
    return names


def _parse_csv(data):
    text = _text(data["csv"], "CSV content", VALUE_BYTES).removeprefix("\ufeff")
    required = _columns(data["requiredColumns"]) if "requiredColumns" in data else []
    source = csv.reader(io.StringIO(text, newline=""), delimiter=_delimiter(data), strict=True)
    records = []
    try:
        names = _columns(next(source, []))
        missing = [name for name in required if name not in names]
        if missing:
            raise ValueError("The CSV is missing required columns: " + ", ".join(missing[:8]) + ".")
        for row in source:
            if not row:
                continue
            line = source.line_num
            if len(records) >= CSV_ROWS:
                raise ValueError(f"A CSV can contain at most {CSV_ROWS} records.")
            if len(row) != len(names):
                raise ValueError(f"The CSV record ending on line {line} does not match the header.")
            if any(len(cell) > CSV_CELL_CHARS for cell in row):
                raise ValueError(f"The CSV record ending on line {line} contains a field that is too long.")
            records.append(dict(zip(names, row)))
    except csv.Error:
        raise ValueError("The CSV contains invalid quoting or an oversized field.") from None
    return {"columns": names, "records": records, "rowCount": len(records)}


def _cell(value):
    if value is None:
        return ""
    if type(value) is bool:
        return "true" if value else "false"
    if type(value) in (int, float):
        return json.dumps(value, allow_nan=False)
    text = _text(value, "CSV field", CSV_CELL_CHARS, empty=True)
    spreadsheet_prefix = text.lstrip().startswith(("=", "+", "-", "@", "＝", "＋", "－", "＠"))
    if spreadsheet_prefix or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def _write_csv(data):
    columns = _columns(data["columns"])
    rows = data["records"]
    if not isinstance(rows, list) or len(rows) > CSV_ROWS:
        raise ValueError(f"Provide at most {CSV_ROWS} records.")
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=_delimiter(data), lineterminator="\r\n")
    writer.writerow([_cell(name) for name in columns])
    allowed = set(columns)
    for index, record in enumerate(rows, start=1):
        if not isinstance(record, dict) or any(key not in allowed for key in record):
            raise ValueError(f"Record {index} contains fields outside the chosen CSV columns.")
        writer.writerow([_cell(record.get(name)) for name in columns])
        if output.tell() > VALUE_BYTES:
            raise ValueError("The generated CSV exceeds the output limit.")
    return {"csv": output.getvalue(), "rowCount": len(rows)}


def _amount(value, label, *, allow_negative=False):
    if type(value) is int:
        if abs(value) >= 10**13:
            raise ValueError(f"{label} exceeds the supported range.")
        raw = str(value)
    else:
        raw = value
    if not isinstance(raw, str) or not 1 <= len(raw) <= 23 or not DECIMAL_TEXT.fullmatch(raw):
        raise ValueError(f"{label} must be a decimal string or an integer.")
    amount = Decimal(raw)
    if not allow_negative and amount < 0:
        raise ValueError(f"{label} cannot be negative.")
    return amount


def _scale(data):
    digits = data.get("decimals", 2)
    if type(digits) is not int or not 0 <= digits <= 4:
        raise ValueError("Choose between 0 and 4 decimal places.")
    return digits


def _rounded(amount, digits):
    rounded = amount.quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return abs(rounded) if not rounded else rounded


def _minor_units(rounded, digits):
    minor = int(rounded.scaleb(digits))
    if abs(minor) > MAX_SAFE_INTEGER:
        raise ValueError("The amount is too large for safe integer minor units.")
    return minor


def _to_minor_units(data):
    amount = _amount(data["amount"], "Amount", allow_negative=True)
    digits = _scale(data)
    rounded = _rounded(amount, digits)
    return {"amount": str(rounded), "minorUnits": _minor_units(rounded, digits), "decimals": digits}


def _quote_totals(data):
    lines = data["lines"]
    if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
        raise ValueError("Provide between 1 and 100 quote lines.")
    digits = _scale(data)
    tax_rate = _amount(data.get("taxRate", 0), "Tax rate")
    if tax_rate > 1:
        raise ValueError("Tax rate must be a fraction between 0 and 1.")
    with localcontext() as context:
        context.prec = 64
        subtotals = []
        for index, line in enumerate(lines, start=1):
            if not isinstance(line, dict) or set(line) != {"quantity", "unitPrice"}:
                raise ValueError(f"Line {index} must contain quantity and unitPrice.")
            quantity = _amount(line["quantity"], f"Line {index} quantity")
            price = _amount(line["unitPrice"], f"Line {index} unit price")
            if quantity == 0:
                raise ValueError(f"Line {index} quantity must be greater than zero.")
            subtotals.append(_rounded(quantity * price, digits))
        subtotal = sum(subtotals, Decimal(0))
        tax = _rounded(subtotal * tax_rate, digits)
        total = subtotal + tax
        total_minor = _minor_units(total, digits)
    return {"lineTotals": [str(line) for line in subtotals], "subtotal": str(subtotal),
            "tax": str(tax), "total": str(total), "totalMinorUnits": total_minor, "decimals": digits}


def _render_text(data):
    template = _text(data["template"], "Template", 30_000, empty=True)
    fields = data["fields"]
    if not isinstance(fields, dict) or len(fields) > 100:
        raise ValueError("Provide an object with at most 100 template fields.")
    pieces = []
    offset = 0
    length = 0
    used = set()
    for match in TEMPLATE_TOKEN.finditer(template):
        name = match[1]
        if name not in fields:
            raise ValueError(f"Template field {name} is missing.")
        value = fields[name]
        if value is None:
            rendered = ""
        elif type(value) in (bool, int, float):
            rendered = json.dumps(value, allow_nan=False)
        else:
            rendered = _text(value, f"Template field {name}", 8000, empty=True)
        prefix = template[offset:match.start()]
        length += len(prefix) + len(rendered)
        if length > 100_000:
            raise ValueError("The rendered text is too long.")
        pieces.extend((prefix, rendered))
        used.add(name)
        offset = match.end()
    pieces.append(template[offset:])
    text = "".join(pieces)
    if len(text) > 100_000:
        raise ValueError("The rendered text is too long.")
    return {"text": text, "fieldsUsed": sorted(used)}


def _text_stats(data):
    text = _text(data["text"], "Text", 100_000, empty=True)
    return {"characters": len(text), "bytes": len(text.encode("utf-8")),
            "words": len(text.split()), "lines": len(text.splitlines())}


def _phone_module():
    try:
        module = import_module("phonenumbers")
    except ImportError:
        raise ValueError("Install the approved Phone Contacts runtime before using this action.") from None
    if getattr(module, "__version__", None) != PHONE_VERSION:
        raise ValueError("Phone Contacts requires the approved phonenumbers version.")
    return module


def _parsed_phone(data):
    phone = _phone_module()
    number = _text(data["number"], "Phone number", 120).strip()
    raw_region = data.get("region", "")
    region = _text(raw_region, "Default region", 2, empty=True).upper() or None
    if region is not None and region not in phone.SUPPORTED_REGIONS:
        raise ValueError("Choose a supported two-letter region, such as GB or US.")
    try:
        parsed = phone.parse(number, region)
    except phone.NumberParseException:
        parsed = None
    return phone, parsed


def _phone_check(data):
    phone, parsed = _parsed_phone(data)
    if parsed is None:
        return {"possible": False, "valid": False, "region": None}
    return {"possible": phone.is_possible_number(parsed), "valid": phone.is_valid_number(parsed),
            "region": phone.region_code_for_number(parsed)}


def _phone_normalize(data):
    phone, parsed = _parsed_phone(data)
    if parsed is None or not phone.is_valid_number(parsed):
        raise ValueError("Enter a valid phone number for the supplied region.")
    return {"e164": phone.format_number(parsed, phone.PhoneNumberFormat.E164),
            "international": phone.format_number(parsed, phone.PhoneNumberFormat.INTERNATIONAL),
            "national": phone.format_number(parsed, phone.PhoneNumberFormat.NATIONAL),
            "region": phone.region_code_for_number(parsed), "extension": parsed.extension or None}


def _field(name, kind, description, required=True):
    return {"name": name, "type": kind, "description": description, "required": required}


def _action(label, description, inputs, output, run):
    return {"label": label, "description": description, "inputs": inputs,
            "output": {"type": "object", "description": output}, "run": run}


DELIMITER = _field("delimiter", "text", "Comma (default), semicolon or tab.", False)
DECIMALS = _field("decimals", "integer", "Decimal places from 0 to 4. Default is 2.", False)
PHONE = [_field("number", "text", "Local or international phone number."),
         _field("region", "text", "Two-letter default region for local numbers.", False)]

PACKAGES = {
    "csv-toolkit": {
        "label": "CSV Toolkit", "description": "Validate imports and produce spreadsheet-ready exports.", "actions": {
            "parse-csv": _action("Parse CSV", "Read header-based CSV into typed workflow data. Column values remain strings.",
                [_field("csv", "text", "CSV with a header and up to 500 records."),
                 _field("requiredColumns", "array", "Exact column names the CSV must contain.", False), DELIMITER],
                "columns, records and rowCount.", _parse_csv),
            "write-csv": _action("Write CSV", "Generate a CSV and neutralize formula-like string cells.",
                [_field("columns", "array", "Ordered header names."),
                 _field("records", "array", "Objects with fields from the selected headers."), DELIMITER],
                "csv and rowCount.", _write_csv),
        },
    },
    "decimal-billing": {
        "label": "Decimal Billing", "description": "Calculate quotes and exact minor units with fixed decimal rounding.", "actions": {
            "to-minor-units": _action("Convert to minor units", "Round an exact decimal and return a safe integer.",
                [_field("amount", "decimal", "Decimal string or integer."), DECIMALS],
                "amount as a string, minorUnits as an integer, and decimals.", _to_minor_units),
            "quote-totals": _action("Calculate quote totals", "Round each line, sum the subtotal, then round and add one tax amount.",
                [_field("lines", "array", "Up to 100 objects with quantity and unitPrice as decimal strings or integers."),
                 _field("taxRate", "decimal", "Fraction between 0 and 1. Default is 0.", False), DECIMALS],
                "lineTotals, subtotal, tax, total as decimal strings, totalMinorUnits and decimals.", _quote_totals),
        },
    },
    "document-text": {
        "label": "Document Text", "description": "Merge fields into plain text and measure document limits.", "actions": {
            "render-text": _action("Fill text template", "Replace {{field}} placeholders with simple values.",
                [_field("template", "text", "Plain text containing named placeholders."),
                 _field("fields", "object", "Object with the named text, numeric, boolean or null values.")],
                "text and fieldsUsed.", _render_text),
            "text-stats": _action("Measure text", "Count Unicode characters, bytes, words and lines.",
                [_field("text", "text", "Plain text of up to 100,000 characters.")],
                "characters, bytes, words and lines.", _text_stats),
        },
    },
    "phone-contacts": {
        "label": "Phone Contacts", "description": "Validate and normalize contact numbers using offline numbering metadata.",
        "dependency": {"name": "phonenumbers", "version": PHONE_VERSION,
                       "url": f"https://pypi.org/project/phonenumbers/{PHONE_VERSION}/", "license": "Apache-2.0"},
        "actions": {
            "check-number": _action("Check phone number", "Check plausibility and validity against numbering rules.", PHONE,
                "possible and valid as booleans, and region when recognised.", _phone_check),
            "normalize-number": _action("Normalize phone number", "Format a valid number as E.164, international and national text.", PHONE,
                "e164, international, national, region and extension.", _phone_normalize),
        },
    },
}


def _availability(package):
    dependency = package.get("dependency")
    if not dependency:
        return True, None
    try:
        installed = metadata.version(dependency["name"])
        available = installed == dependency["version"] and util.find_spec(dependency["name"]) is not None
    except (ImportError, metadata.PackageNotFoundError, ValueError):
        available = False
    setup = None if available else (
        f"Install {dependency['name']}=={dependency['version']} in the Studio backend Python environment "
        "using workflow-package-requirements.txt, then reload the service."
    )
    return available, setup


def package_catalog():
    result = []
    for package_id, spec in PACKAGES.items():
        available, setup = _availability(spec)
        actions = [{"id": action_id, **{key: value for key, value in action.items() if key != "run"}}
                   for action_id, action in spec["actions"].items()]
        result.append({"id": package_id, "label": spec["label"], "version": PACKAGE_VERSION,
                       "description": spec["description"], "available": available, "setup": setup,
                       "status": "ready" if available else "unavailable", "dependency": spec.get("dependency"),
                       "actions": actions})
    return result


def validate_package_manifest(records, *, require_available=False):
    if records is None:
        return {}
    if not isinstance(records, (list, tuple)) or len(records) > len(PACKAGES):
        raise ValueError("Provide a list of approved workflow package versions.")
    enabled = {}
    for record in records:
        if not isinstance(record, dict) or set(record) != {"id", "version"}:
            raise ValueError("A workflow package entry must contain its ID and pinned version.")
        package_id = record["id"]
        if not isinstance(package_id, str) or package_id not in PACKAGES:
            raise ValueError("The workflow package is not in the approved catalog.")
        if package_id in enabled or record["version"] != PACKAGE_VERSION:
            raise ValueError("Each workflow package must have one approved version.")
        if require_available:
            available, setup = _availability(PACKAGES[package_id])
            if not available:
                raise ValueError(setup)
        enabled[package_id] = PACKAGE_VERSION
    return enabled


def run_package(enabled, package_id, operation, value):
    if not isinstance(package_id, str) or package_id not in PACKAGES:
        raise ValueError("Choose a workflow package from the approved catalog.")
    if package_id not in validate_package_manifest(enabled):
        raise ValueError("Enable the approved package version in this project before running the action.")
    package = PACKAGES[package_id]
    available, setup = _availability(package)
    if not available:
        raise ValueError(setup)
    action = package["actions"].get(operation) if isinstance(operation, str) else None
    if action is None:
        raise ValueError("Choose an action from the selected workflow package.")
    if not isinstance(value, dict):
        raise ValueError("Provide a JSON object as the package action input.")
    fields = {entry["name"]: entry["required"] for entry in action["inputs"]}
    if set(value).difference(fields):
        raise ValueError("The package action received an unknown input field.")
    missing = [name for name, required in fields.items() if required and name not in value]
    if missing:
        raise ValueError("Missing required package input: " + ", ".join(missing) + ".")
    _json_budget(value, "The package input")
    result = action["run"](value)
    _json_budget(result, "The package output")
    return result
