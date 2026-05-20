#!/usr/bin/env python3
"""
signal_to_sqlite.py — Convert a Signal "official" backup export (JSONL) into
a SQLite database with an FTS5 full-text index over message bodies.

The output database is the read-only artifact consumed by the SignalArchive
iOS app. The schema here is the source of truth — keep it in sync with
SignalArchive/Models/Schema.swift.

Usage:
    python3 signal_to_sqlite.py <path/to/main.jsonl> <path/to/output.sqlite>

Requirements: Python 3.10+, stdlib only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

# Bump when the schema changes — the iOS app refuses DBs whose user_version
# doesn't match its expected value.
SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
PRAGMA user_version = {version};

CREATE TABLE schema_info (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE recipients (
    id            INTEGER PRIMARY KEY,
    kind          TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    given_name    TEXT,
    family_name   TEXT,
    phone_number  TEXT,
    aci           TEXT,
    group_title   TEXT,
    avatar_color  TEXT
);

CREATE TABLE conversations (
    id            INTEGER PRIMARY KEY,
    recipient_id  INTEGER NOT NULL REFERENCES recipients(id),
    title         TEXT NOT NULL,
    is_group      INTEGER NOT NULL DEFAULT 0,
    archived      INTEGER NOT NULL DEFAULT 0,
    pinned_order  INTEGER,
    message_count INTEGER NOT NULL DEFAULT 0,
    first_ts      INTEGER,
    last_ts       INTEGER
);
CREATE INDEX idx_conversations_recipient ON conversations(recipient_id);

CREATE TABLE messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    author_id       INTEGER NOT NULL REFERENCES recipients(id),
    timestamp       INTEGER NOT NULL,
    direction       TEXT NOT NULL,
    kind            TEXT NOT NULL,
    body            TEXT,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    has_quote       INTEGER NOT NULL DEFAULT 0,
    quote_author_id INTEGER REFERENCES recipients(id),
    quote_body      TEXT,
    update_text     TEXT
);
CREATE INDEX idx_messages_conv_ts   ON messages(conversation_id, timestamp);
CREATE INDEX idx_messages_author_ts ON messages(author_id, timestamp);
CREATE INDEX idx_messages_ts        ON messages(timestamp);
""".strip().format(version=SCHEMA_VERSION)

FTS_SQL = """
CREATE VIRTUAL TABLE messages_fts USING fts4(
    content="messages",
    body,
    tokenize=unicode61
);
""".strip()

# Triggers keep FTS in sync if the app or a later tool ever writes to messages.
# We create them *after* the bulk insert + rebuild to avoid per-row overhead.
TRIGGERS_SQL = """
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body) VALUES('delete', old.id, old.body);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body) VALUES('delete', old.id, old.body);
    INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
END;
""".strip()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coalesce(*xs):
    for x in xs:
        if x:
            return x
    return None


def recipient_display_name(rec_id: int, payload: dict) -> tuple[str, str, dict]:
    """Return (kind, display_name, extras) for a recipient payload."""
    extras = {
        "given_name": None,
        "family_name": None,
        "phone_number": None,
        "aci": None,
        "group_title": None,
        "avatar_color": None,
    }

    if "self" in payload:
        extras["avatar_color"] = payload["self"].get("avatarColor")
        return "self", "You", extras

    if "contact" in payload:
        c = payload["contact"]
        given = _coalesce(
            (c.get("nickname") or {}).get("given"),
            c.get("profileGivenName"),
            c.get("systemGivenName"),
        )
        family = _coalesce(
            (c.get("nickname") or {}).get("family"),
            c.get("profileFamilyName"),
            c.get("systemFamilyName"),
        )
        name_parts = [p for p in (given, family) if p]
        display = " ".join(name_parts) if name_parts else _coalesce(
            c.get("systemJoinedName"),
            c.get("e164"),
            c.get("username"),
            f"Contact {rec_id}",
        )
        extras["given_name"] = given
        extras["family_name"] = family
        extras["phone_number"] = c.get("e164")
        extras["aci"] = c.get("aci")
        extras["avatar_color"] = c.get("avatarColor")
        return "contact", display, extras

    if "group" in payload:
        g = payload["group"]
        title = ((g.get("snapshot") or {}).get("title") or {}).get("title") or f"Group {rec_id}"
        extras["group_title"] = title
        extras["avatar_color"] = g.get("avatarColor")
        return "group", title, extras

    if "releaseNotes" in payload:
        return "release_notes", "Signal", extras
    if "distributionList" in payload:
        dl = payload["distributionList"]
        return "distribution_list", dl.get("name") or f"List {rec_id}", extras
    if "callLink" in payload:
        cl = payload["callLink"]
        return "call_link", cl.get("name") or f"Call link {rec_id}", extras

    return "unknown", f"Recipient {rec_id}", extras


def update_message_summary(update_msg: dict) -> str:
    """Render a short, human-readable summary of a Signal updateMessage."""
    if "groupChange" in update_msg:
        gc = update_msg["groupChange"]
        updates = gc.get("updates") or []
        if not updates:
            return "[group updated]"
        parts = []
        for u in updates:
            for key in u.keys():
                # Convert camelCase keys to spaces, drop "Update" suffix
                pretty = key.replace("Update", "")
                # crude camelCase → words
                out = "".join(" " + c.lower() if c.isupper() else c for c in pretty).strip()
                parts.append(out or key)
        return "[" + ", ".join(parts) + "]"

    if "simpleUpdate" in update_msg:
        t = update_msg["simpleUpdate"].get("type") or "update"
        return f"[{t.lower().replace('_', ' ')}]"

    if "expirationTimerChange" in update_msg:
        ms = update_msg["expirationTimerChange"].get("expiresInMs") or "0"
        if ms == "0":
            return "[disappearing messages turned off]"
        return f"[disappearing messages: {ms} ms]"

    if "profileChange" in update_msg:
        pc = update_msg["profileChange"]
        old = pc.get("previousName") or "?"
        new = pc.get("newName") or "?"
        return f"[profile name changed: {old} → {new}]"

    if "individualCall" in update_msg:
        ic = update_msg["individualCall"]
        return f"[{(ic.get('type') or 'call').lower()} call]"

    if "groupCall" in update_msg:
        return "[group call]"

    if "sessionSwitchover" in update_msg:
        return "[session switchover]"

    if "learnedProfileChange" in update_msg:
        return "[learned profile change]"

    if "threadMerge" in update_msg:
        return "[thread merge]"

    # fallback — name the first key we see
    for k in update_msg.keys():
        return f"[{k}]"
    return "[update]"


def classify_chatitem(ci: dict) -> tuple[str, str | None, str | None]:
    """Return (kind, body, update_text) for a chatItem."""
    if "standardMessage" in ci:
        sm = ci["standardMessage"]
        body = (sm.get("text") or {}).get("body")
        return "text", body, None
    if "stickerMessage" in ci:
        return "sticker", None, None
    if "contactMessage" in ci:
        return "contact_share", None, None
    if "remoteDeletedMessage" in ci:
        return "remote_deleted", None, None
    if "viewOnceMessage" in ci:
        return "view_once", None, None
    if "directStoryReplyMessage" in ci:
        sm = ci["directStoryReplyMessage"]
        body = (sm.get("textReply") or {}).get("text", {}).get("body")
        return "story_reply", body, None
    if "paymentNotification" in ci:
        return "payment", None, None
    if "giftBadge" in ci:
        return "gift", None, None
    if "updateMessage" in ci:
        return "update", None, update_message_summary(ci["updateMessage"])
    return "unknown", None, None


def direction_of(ci: dict) -> str:
    if "outgoing" in ci:
        return "outgoing"
    if "incoming" in ci:
        return "incoming"
    return "directionless"


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert(jsonl_path: Path, sqlite_path: Path, verbose: bool = True) -> dict:
    if sqlite_path.exists():
        sqlite_path.unlink()

    t0 = time.perf_counter()
    conn = sqlite3.connect(sqlite_path)
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -200000")  # ~200MB page cache
    conn.executescript(SCHEMA_SQL)

    recipients: dict[int, dict] = {}
    chats: dict[int, dict] = {}
    # Pre-pass not needed — JSONL ordering puts recipients and chats before chatItems.

    messages_buffer: list[tuple] = []
    BATCH = 5000

    def flush_messages():
        if not messages_buffer:
            return
        conn.executemany(
            """
            INSERT INTO messages(
                conversation_id, author_id, timestamp, direction, kind,
                body, has_attachments, has_quote, quote_author_id, quote_body, update_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            messages_buffer,
        )
        messages_buffer.clear()

    n_lines = 0
    n_messages = 0
    n_skipped = 0

    conn.execute("BEGIN")
    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            n_lines += 1
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                n_skipped += 1
                continue

            if "recipient" in obj:
                r = obj["recipient"]
                rid = int(r["id"])
                kind, display, extras = recipient_display_name(rid, r)
                recipients[rid] = {"kind": kind, "display": display, **extras}
                conn.execute(
                    """INSERT INTO recipients(id, kind, display_name, given_name,
                                              family_name, phone_number, aci,
                                              group_title, avatar_color)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        rid, kind, display,
                        extras["given_name"], extras["family_name"],
                        extras["phone_number"], extras["aci"],
                        extras["group_title"], extras["avatar_color"],
                    ),
                )
                continue

            if "chat" in obj:
                c = obj["chat"]
                cid = int(c["id"])
                recip_id = int(c["recipientId"])
                title = (recipients.get(recip_id) or {}).get("display") or f"Chat {cid}"
                is_group = 1 if (recipients.get(recip_id) or {}).get("kind") == "group" else 0
                archived = 1 if c.get("archived") else 0
                pinned = c.get("pinnedOrder")
                chats[cid] = {"recipient_id": recip_id, "title": title, "is_group": is_group}
                conn.execute(
                    """INSERT INTO conversations(id, recipient_id, title,
                                                 is_group, archived, pinned_order)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (cid, recip_id, title, is_group, archived, pinned),
                )
                continue

            if "chatItem" in obj:
                ci = obj["chatItem"]
                cid = int(ci["chatId"])
                author = int(ci["authorId"])
                try:
                    ts = int(ci.get("dateSent") or 0)
                except (TypeError, ValueError):
                    ts = 0
                direction = direction_of(ci)
                kind, body, update_text = classify_chatitem(ci)

                has_attach = 0
                has_quote = 0
                quote_author = None
                quote_body = None
                if "standardMessage" in ci:
                    sm = ci["standardMessage"]
                    if sm.get("attachments"):
                        has_attach = 1
                    q = sm.get("quote")
                    if q:
                        has_quote = 1
                        try:
                            quote_author = int(q.get("authorId")) if q.get("authorId") is not None else None
                        except (TypeError, ValueError):
                            quote_author = None
                        quote_body = (q.get("text") or {}).get("body")

                messages_buffer.append((
                    cid, author, ts, direction, kind,
                    body, has_attach, has_quote, quote_author, quote_body, update_text,
                ))
                n_messages += 1

                if len(messages_buffer) >= BATCH:
                    flush_messages()
                continue

            # Account / version / debugInfo / chatFolder / stickerPack: ignore for MVP

    flush_messages()
    conn.execute("COMMIT")

    if verbose:
        print(f"  loaded {n_messages:,} messages, {len(recipients):,} recipients, {len(chats):,} conversations", file=sys.stderr)

    # Per-conversation stats
    conn.execute("""
        UPDATE conversations
        SET
            message_count = COALESCE((SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conversations.id), 0),
            first_ts      = (SELECT MIN(timestamp) FROM messages m WHERE m.conversation_id = conversations.id),
            last_ts       = (SELECT MAX(timestamp) FROM messages m WHERE m.conversation_id = conversations.id)
    """)

    # Build FTS5 index (external content) — rebuild is far faster than per-row insert.
    conn.executescript(FTS_SQL)
    conn.execute("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')")

    # Triggers (so the app can write later if it ever needs to)
    conn.executescript(TRIGGERS_SQL)

    # Schema metadata
    now_iso = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    info = {
        "schema_version": str(SCHEMA_VERSION),
        "generator": "signal_to_sqlite.py",
        "source_jsonl": str(jsonl_path),
        "source_jsonl_size": str(jsonl_path.stat().st_size),
        "generated_at": now_iso,
        "message_count": str(n_messages),
        "recipient_count": str(len(recipients)),
        "conversation_count": str(len(chats)),
    }
    conn.executemany(
        "INSERT INTO schema_info(key, value) VALUES (?, ?)",
        list(info.items()),
    )

    if verbose:
        print("  rebuilt FTS5 index", file=sys.stderr)
        print("  analyzing & vacuuming…", file=sys.stderr)

    conn.execute("ANALYZE")
    conn.commit()
    conn.execute("VACUUM")

    elapsed = time.perf_counter() - t0
    out_size = sqlite_path.stat().st_size
    stats = {
        "elapsed_sec": elapsed,
        "messages": n_messages,
        "recipients": len(recipients),
        "conversations": len(chats),
        "skipped_lines": n_skipped,
        "total_lines": n_lines,
        "output_bytes": out_size,
    }
    conn.close()
    return stats


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Convert a Signal JSONL export into a SQLite+FTS5 archive.")
    ap.add_argument("jsonl", type=Path, help="Path to main.jsonl from signal-export")
    ap.add_argument("sqlite", type=Path, help="Output SQLite path (will be overwritten)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if not args.jsonl.exists():
        print(f"error: {args.jsonl} not found", file=sys.stderr)
        return 1

    print(f"Converting {args.jsonl} → {args.sqlite}", file=sys.stderr)
    stats = convert(args.jsonl, args.sqlite, verbose=not args.quiet)
    print(
        "Done in {elapsed:.1f}s. {messages:,} messages · {recipients:,} recipients · "
        "{conversations:,} conversations · output {mb:.1f} MB".format(
            elapsed=stats["elapsed_sec"],
            messages=stats["messages"],
            recipients=stats["recipients"],
            conversations=stats["conversations"],
            mb=stats["output_bytes"] / 1_048_576,
        ),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
