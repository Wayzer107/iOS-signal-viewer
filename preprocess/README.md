# Preprocessor

`signal_to_sqlite.py` is the single Mac-side tool for the project. It reads
a Signal export `main.jsonl` and writes a `signal_archive.sqlite` that the
iOS app consumes.

Usage:

```bash
python3 signal_to_sqlite.py /path/to/main.jsonl /path/to/output.sqlite
```

No third-party dependencies. Python 3.10+.

The script is the source of truth for the database schema — see the
`SCHEMA_SQL` constant at the top. The iOS app validates `PRAGMA user_version`
against its `Schema.supportedVersion` on import and rejects mismatched
databases.

## Output schema (v1)

* `recipients(id, kind, display_name, given_name, family_name, phone_number, aci, group_title, avatar_color)`
* `conversations(id, recipient_id, title, is_group, archived, pinned_order, message_count, first_ts, last_ts)`
* `messages(id, conversation_id, author_id, timestamp, direction, kind, body, has_attachments, has_quote, quote_author_id, quote_body, update_text)`
* `messages_fts` — FTS5 external-content table over `messages.body`, using
  `unicode61 remove_diacritics 2` tokenization.
* `schema_info(key, value)` — generator metadata (schema_version,
  generated_at, source_jsonl, counts).

Triggers keep `messages_fts` in sync if any future tool writes to the
`messages` table, but the iOS app opens the file read-only.
