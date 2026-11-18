import base64
import json
import os
import sqlite3
import sys
import zlib
from pathlib import Path
from time import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


MAX_REVISIONS = 30
PROJECT_HISTORY_BYTES = 24 * 1024 * 1024
ALL_HISTORY_BYTES = 128 * 1024 * 1024
MARKER = b"PLOTPS1\0"


class DraftEncryption:
    def __init__(self, key, legacy=False):
        data = base64.urlsafe_b64decode(key + "=")
        if len(data) != 32 or base64.urlsafe_b64encode(data).decode().rstrip("=") != key:
            raise ValueError("Invalid private draft encryption key.")
        self.cipher = AESGCM(data)
        self.legacy = legacy

    def write(self, value, scope, *, compress=False):
        payload = value.encode("utf-8") if isinstance(value, str) else value
        if compress:
            payload = zlib.compress(payload, level=3)
        nonce = os.urandom(12)
        return MARKER + nonce + self.cipher.encrypt(nonce, payload, self.aad(scope))

    def read(self, value, scope, *, decompress=False, legacy_packed=False):
        if isinstance(value, bytes) and value.startswith(MARKER):
            offset = len(MARKER) + 12
            value = self.cipher.decrypt(value[len(MARKER):offset], value[offset:], self.aad(scope))
            return zlib.decompress(value).decode("utf-8") if decompress else value.decode("utf-8")
        if self.legacy and scope != "key-guard":
            return zlib.decompress(value).decode("utf-8") if legacy_packed else value
        raise ValueError("An authenticated private draft record is required.")

    @staticmethod
    def aad(scope):
        return MARKER + scope.encode("utf-8")

    def verify(self, db):
        tag = db.execute("SELECT key_guard FROM project_storage WHERE id=1").fetchone()
        if tag is None:
            db.execute("INSERT OR IGNORE INTO project_storage VALUES (1, ?)", (self.write("drafts", "key-guard"),))
            tag = db.execute("SELECT key_guard FROM project_storage WHERE id=1").fetchone()
        if self.read(tag[0], "key-guard") != "drafts":
            raise ValueError("Could not authenticate the private draft store.")


def field_scope(project_id, revision, field):
    return f"{project_id}:{revision}:{field}"


def reply(status, payload):
    print(json.dumps({"status": status, "payload": payload}, ensure_ascii=True, separators=(",", ":")))


def snapshot(db, encryption, project_id, revision, name, updated, content, note="", restored_from=None):
    name_enc = encryption.write(name, field_scope(project_id, revision, "checkpoint-name"))
    note_enc = encryption.write(note, field_scope(project_id, revision, "checkpoint-note"))
    packed = encryption.write(content, field_scope(project_id, revision, "checkpoint-content"), compress=True)
    db.execute("INSERT OR IGNORE INTO project_revisions VALUES (?,?,?,?,?,?,?,?)",
               (project_id, revision, name_enc, updated, note_enc, restored_from, len(packed), packed))


def prune(db, project_id):
    db.execute("""DELETE FROM project_revisions WHERE project_id=? AND revision IN (
        SELECT revision FROM (SELECT revision, ROW_NUMBER() OVER w AS position, SUM(bytes) OVER w AS total
            FROM project_revisions WHERE project_id=? WINDOW w AS (ORDER BY revision DESC))
        WHERE position>? OR total>?)""", (project_id, project_id, MAX_REVISIONS, PROJECT_HISTORY_BYTES))
    if db.execute("SELECT COALESCE(SUM(bytes),0) FROM project_revisions").fetchone()[0] > ALL_HISTORY_BYTES:
        db.execute("""DELETE FROM project_revisions WHERE rowid IN (SELECT key FROM (
            SELECT rowid AS key, SUM(bytes) OVER (ORDER BY updated DESC, rowid DESC) AS total
            FROM project_revisions) WHERE total>?)""", (ALL_HISTORY_BYTES,))


def history_record(revision, name, updated, note="", restored_from=None):
    return {"revision": revision, "name": name, "updated": updated, "note": note, "restoredFrom": restored_from}


def migrate(db, encryption):
    db.execute("BEGIN IMMEDIATE")
    projects = 0
    revisions = 0
    legacy_projects = db.execute("SELECT rowid FROM projects WHERE typeof(content)='text'").fetchall()
    for key in legacy_projects:
        project_id, revision, name, content = db.execute("SELECT id,revision,name,content FROM projects WHERE rowid=?", key).fetchone()
        name_enc = encryption.write(name, field_scope(project_id, revision, "draft-name"))
        project_enc = encryption.write(content, field_scope(project_id, revision, "draft-content"), compress=True)
        db.execute("UPDATE projects SET name=?,content=? WHERE id=?", (name_enc, project_enc, project_id))
        projects += 1
    legacy_revisions = db.execute("SELECT rowid FROM project_revisions WHERE typeof(name)='text'").fetchall()
    for key in legacy_revisions:
        project_id, revision, name, note, packed = db.execute(
            "SELECT project_id,revision,name,note,compressed FROM project_revisions WHERE rowid=?", key).fetchone()
        name_enc = encryption.write(name, field_scope(project_id, revision, "checkpoint-name"))
        note_enc = encryption.write(note, field_scope(project_id, revision, "checkpoint-note"))
        packed_enc = encryption.write(packed, field_scope(project_id, revision, "checkpoint-content"))
        db.execute("UPDATE project_revisions SET name=?,note=?,bytes=?,compressed=? WHERE project_id=? AND revision=?",
                   (name_enc, note_enc, len(packed_enc), packed_enc, project_id, revision))
        revisions += 1
    db.commit()
    db.execute("VACUUM")
    busy, _, _ = db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
    if busy:
        raise RuntimeError("Could not clear the draft database write-ahead log. Stop readers and run the migration again.")
    return reply(200, {"drafts": projects, "revisions": revisions})


def main():
    path, operation, project_id = sys.argv[1:4]
    input_data = json.load(sys.stdin.buffer)
    encryption = DraftEncryption(input_data["key"], legacy=input_data.get("legacy") is True)
    request = input_data["payload"]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=8, isolation_level=None) as db:
        db.execute("PRAGMA journal_mode=WAL").fetchone()
        db.execute("PRAGMA secure_delete=ON")
        db.execute("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, content TEXT NOT NULL)")
        db.execute("""CREATE TABLE IF NOT EXISTS project_revisions (
            project_id TEXT NOT NULL, revision INTEGER NOT NULL, name TEXT NOT NULL, updated INTEGER NOT NULL,
            note TEXT NOT NULL, restored_from INTEGER, bytes INTEGER NOT NULL, compressed BLOB NOT NULL,
            PRIMARY KEY (project_id,revision))""")
        db.execute("CREATE TABLE IF NOT EXISTS project_storage (id INTEGER PRIMARY KEY CHECK(id=1), key_guard BLOB NOT NULL)")
        encryption.verify(db)
        if operation == "migrate":
            return migrate(db, encryption)
        if operation == "exists":
            found = db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone()
            return reply(200, {}) if found else reply(404, {"error": "Project not found."})
        if operation == "list":
            values = db.execute("SELECT id,name,revision,updated FROM projects ORDER BY updated DESC LIMIT 1000")
            return reply(200, [{"id": key, "name": encryption.read(name, field_scope(key, rev, "draft-name")),
                                "revision": rev, "updated": updated} for key, name, rev, updated in values])
        if operation in ("get", "history", "revision"):
            db.execute("BEGIN")
            current = db.execute("SELECT revision,name,updated,content FROM projects WHERE id=?", (project_id,)).fetchone()
            if current is None:
                return reply(404, {"error": "Project not found."})
            rev, name, updated, content = current
            if operation == "history":
                current_name = encryption.read(name, field_scope(project_id, rev, "draft-name"))
                rows = db.execute("SELECT revision,name,updated,note,restored_from FROM project_revisions WHERE project_id=? ORDER BY revision DESC", (project_id,))
                records = [history_record(revision,
                           encryption.read(label, field_scope(project_id, revision, "checkpoint-name")),
                           date, encryption.read(note, field_scope(project_id, revision, "checkpoint-note")), origin)
                           for revision, label, date, note, origin in rows]
                if not records or records[0]["revision"] != rev:
                    records.insert(0, history_record(rev, current_name, updated))
                return reply(200, {"id": project_id, "name": current_name, "revision": rev, "revisions": records[:MAX_REVISIONS]})
            if operation == "revision":
                target = request["revision"]
                if target != rev:
                    row = db.execute("SELECT updated,compressed FROM project_revisions WHERE project_id=? AND revision=?", (project_id, target)).fetchone()
                    if row is None:
                        return reply(404, {"error": "Revision no longer exists."})
                    updated, packed = row
                    rev = target
                    content = encryption.read(packed, field_scope(project_id, rev, "checkpoint-content"), decompress=True, legacy_packed=True)
                    return reply(200, {"id": project_id, "revision": rev, "updated": updated, "project": json.loads(content)})
            decoded = encryption.read(content, field_scope(project_id, rev, "draft-content"), decompress=True)
            return reply(200, {"id": project_id, "revision": rev, "updated": updated, "project": json.loads(decoded)})

        expected = request["expected"]
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT revision,name,updated,content FROM projects WHERE id=?", (project_id,)).fetchone()
        actual = row[0] if row else None
        if actual != expected:
            db.rollback()
            return reply(409, {"error": "A newer version is on the server.", "revision": actual})
        if operation == "delete":
            db.execute("DELETE FROM projects WHERE id=?", (project_id,))
            db.execute("DELETE FROM project_revisions WHERE project_id=?", (project_id,))
            db.commit()
            return reply(200, {"id": project_id})

        target = request.get("revision") if operation == "restore" else None
        if target is not None:
            if target == actual:
                db.rollback()
                return reply(422, {"error": "That revision is already current."})
            selected = db.execute("SELECT compressed FROM project_revisions WHERE project_id=? AND revision=?", (project_id, target)).fetchone()
            if selected is None:
                db.rollback()
                return reply(404, {"error": "Revision no longer exists."})
            project = json.loads(encryption.read(selected[0], field_scope(project_id, target, "checkpoint-content"),
                                 decompress=True, legacy_packed=True))
        else:
            project = request["project"]
        rev = (actual or 0) + 1
        updated = int(time() * 1000)
        content = json.dumps(project, ensure_ascii=False, separators=(",", ":"))
        if row:
            exists = db.execute("SELECT 1 FROM project_revisions WHERE project_id=? AND revision=?", (project_id, row[0])).fetchone()
            if not exists:
                past_revision, past_name, past_updated, past_content = row
                snapshot(db, encryption, project_id, past_revision,
                         encryption.read(past_name, field_scope(project_id, past_revision, "draft-name")), past_updated,
                         encryption.read(past_content, field_scope(project_id, past_revision, "draft-content"), decompress=True))
        name_enc = encryption.write(project["name"], field_scope(project_id, rev, "draft-name"))
        content_enc = encryption.write(content, field_scope(project_id, rev, "draft-content"), compress=True)
        db.execute("INSERT INTO projects VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=excluded.revision,updated=excluded.updated,content=excluded.content",
                   (project_id, name_enc, rev, updated, content_enc))
        snapshot(db, encryption, project_id, rev, project["name"], updated, content, request.get("note", ""), target)
        prune(db, project_id)
        db.commit()
        reply(201 if actual is None else 200, {"id": project_id, "revision": rev, "updated": updated})


if __name__ == "__main__":
    main()
