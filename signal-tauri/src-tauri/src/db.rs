use rusqlite::{Connection, Result, params};
use serde_json::{json, Value, Map};

pub struct ArchiveDb {
    conn: Connection,
}

impl ArchiveDb {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA query_only = ON;
             PRAGMA cache_size = -65536;
             PRAGMA mmap_size = 536870912;
             PRAGMA temp_store = MEMORY;",
        )?;
        Ok(ArchiveDb { conn })
    }

    pub fn get_info(&self) -> Result<Value> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM schema_info")?;
        let mut map = Map::new();
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (k, v) = row?;
            map.insert(k, Value::String(v));
        }
        let version: i64 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        map.insert("user_version".into(), json!(version));
        Ok(Value::Object(map))
    }

    pub fn get_conversations(&self) -> Result<Value> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.title, c.is_group, c.archived, c.pinned_order,
                    c.message_count, c.first_ts, c.last_ts,
                    r.display_name, r.avatar_color, r.kind AS recipient_kind
             FROM conversations c
             JOIN recipients r ON r.id = c.recipient_id
             ORDER BY c.pinned_order ASC NULLS LAST, COALESCE(c.last_ts, 0) DESC",
        )?;
        let rows = stmt.query_map([], row_to_json)?;
        rows.collect::<Result<Vec<_>>>().map(Value::Array)
    }

    pub fn get_recipients(&self) -> Result<Value> {
        let mut stmt = self.conn.prepare("SELECT * FROM recipients")?;
        let rows = stmt.query_map([], row_to_json)?;
        rows.collect::<Result<Vec<_>>>().map(Value::Array)
    }

    pub fn get_messages(&self, conv_id: i64, params: &Value) -> Result<Value> {
        let direction = params["direction"].as_str().unwrap_or("");
        let ref_id    = params["refId"].as_i64();
        let ref_ts    = params["refTs"].as_i64();
        let limit     = params["limit"].as_i64().unwrap_or(100);
        let anchor_id = params["anchorId"].as_i64();
        let before    = params["before"].as_i64().unwrap_or(80);
        let after     = params["after"].as_i64().unwrap_or(80);
        let pg_limit  = params["limit"].as_i64().unwrap_or(120);

        if direction == "before" {
            if let (Some(rts), Some(rid)) = (ref_ts, ref_id) {
                return self.get_messages_before(conv_id, rts, rid, limit);
            }
        }
        if direction == "after" {
            if let (Some(rts), Some(rid)) = (ref_ts, ref_id) {
                return self.get_messages_after(conv_id, rts, rid, limit);
            }
        }
        self.get_messages_window(conv_id, anchor_id, before, after, pg_limit)
    }

    fn get_messages_window(
        &self, conv_id: i64, anchor_id: Option<i64>, before: i64, after: i64, limit: i64,
    ) -> Result<Value> {
        if let Some(aid) = anchor_id {
            let anchor: Value = self.conn.query_row(
                "SELECT * FROM messages WHERE id = ?",
                params![aid],
                row_to_json,
            )?;
            let ts = anchor["timestamp"].as_i64().unwrap_or(0);
            let id = anchor["id"].as_i64().unwrap_or(0);

            let mut earlier_stmt = self.conn.prepare(
                "SELECT * FROM messages WHERE conversation_id = ?
                 AND (timestamp < ? OR (timestamp = ? AND id < ?))
                 ORDER BY timestamp DESC, id DESC LIMIT ?",
            )?;
            let mut earlier: Vec<Value> = earlier_stmt
                .query_map(params![conv_id, ts, ts, id, before], row_to_json)?
                .collect::<Result<_>>()?;
            earlier.reverse();

            let mut later_stmt = self.conn.prepare(
                "SELECT * FROM messages WHERE conversation_id = ?
                 AND (timestamp > ? OR (timestamp = ? AND id > ?))
                 ORDER BY timestamp ASC, id ASC LIMIT ?",
            )?;
            let later: Vec<Value> = later_stmt
                .query_map(params![conv_id, ts, ts, id, after], row_to_json)?
                .collect::<Result<_>>()?;

            let mut result = earlier;
            result.push(anchor);
            result.extend(later);
            return Ok(Value::Array(result));
        }

        let mut stmt = self.conn.prepare(
            "SELECT * FROM messages WHERE conversation_id = ?
             ORDER BY timestamp DESC, id DESC LIMIT ?",
        )?;
        let mut rows: Vec<Value> = stmt
            .query_map(params![conv_id, limit], row_to_json)?
            .collect::<Result<_>>()?;
        rows.reverse();
        Ok(Value::Array(rows))
    }

    fn get_messages_before(&self, conv_id: i64, ts: i64, id: i64, limit: i64) -> Result<Value> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM messages WHERE conversation_id = ?
             AND (timestamp < ? OR (timestamp = ? AND id < ?))
             ORDER BY timestamp DESC, id DESC LIMIT ?",
        )?;
        let mut rows: Vec<Value> = stmt
            .query_map(params![conv_id, ts, ts, id, limit], row_to_json)?
            .collect::<Result<_>>()?;
        rows.reverse();
        Ok(Value::Array(rows))
    }

    fn get_messages_after(&self, conv_id: i64, ts: i64, id: i64, limit: i64) -> Result<Value> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM messages WHERE conversation_id = ?
             AND (timestamp > ? OR (timestamp = ? AND id > ?))
             ORDER BY timestamp ASC, id ASC LIMIT ?",
        )?;
        let rows: Vec<Value> = stmt
            .query_map(params![conv_id, ts, ts, id, limit], row_to_json)?
            .collect::<Result<_>>()?;
        Ok(Value::Array(rows))
    }

    pub fn search(&self, raw_query: &str, filters: &Value) -> Result<Value> {
        let q = sanitize_fts_query(raw_query.trim());
        if q.is_empty() {
            return Ok(json!({ "results": [], "hasMore": false }));
        }

        let conv_id   = filters["convId"].as_i64();
        let author_id = filters["authorId"].as_i64();
        let start_ms  = filters["startMs"].as_i64();
        let end_ms    = filters["endMs"].as_i64();
        let limit     = filters["limit"].as_i64().unwrap_or(250).min(500);
        let offset    = filters["offset"].as_i64().unwrap_or(0);
        let order_by  = filters["orderBy"].as_str().unwrap_or("newest");

        let mut conditions = vec!["messages_fts MATCH ?1".to_string()];
        let mut next_param = 2i32;

        if conv_id.is_some()   { conditions.push(format!("m.conversation_id = ?{}", next_param)); next_param += 1; }
        if author_id.is_some() { conditions.push(format!("m.author_id = ?{}", next_param)); next_param += 1; }
        if start_ms.is_some()  { conditions.push(format!("m.timestamp >= ?{}", next_param)); next_param += 1; }
        if end_ms.is_some()    { conditions.push(format!("m.timestamp <= ?{}", next_param)); next_param += 1; }

        // Schema uses FTS4 (required for WASM/sql.js compatibility); bm25() is FTS5-only
        let order_clause = match order_by {
            "oldest" => "ORDER BY m.timestamp ASC, m.id ASC",
            _        => "ORDER BY m.timestamp DESC, m.id DESC",
        };

        let limit_param  = next_param;
        let offset_param = next_param + 1;

        let sql = format!(
            "SELECT m.id           AS message_id,
                    m.conversation_id,
                    c.title        AS conversation_title,
                    c.is_group,
                    r.display_name AS author_name,
                    m.author_id,
                    m.direction,
                    m.timestamp,
                    0 AS rank,
                    snippet(messages_fts, '«', '»', '…', 0, 14) AS snippet
             FROM messages_fts
             JOIN messages      m ON m.id = messages_fts.rowid
             JOIN conversations c ON c.id = m.conversation_id
             JOIN recipients    r ON r.id = m.author_id
             WHERE {}
             {}
             LIMIT ?{} OFFSET ?{}",
            conditions.join(" AND "), order_clause, limit_param, offset_param
        );

        let mut stmt = self.conn.prepare(&sql)?;

        // Build the positional parameter list
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(q)];
        if let Some(v) = conv_id   { args.push(Box::new(v)); }
        if let Some(v) = author_id { args.push(Box::new(v)); }
        if let Some(v) = start_ms  { args.push(Box::new(v)); }
        if let Some(v) = end_ms    { args.push(Box::new(v)); }
        args.push(Box::new(limit + 1));
        args.push(Box::new(offset));

        let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let mut rows: Vec<Value> = stmt
            .query_map(refs.as_slice(), row_to_json)?
            .collect::<Result<_>>()?;

        let has_more = rows.len() > limit as usize;
        if has_more { rows.truncate(limit as usize); }
        Ok(json!({ "results": rows, "hasMore": has_more }))
    }

    pub fn get_stats(&self, conv_id: i64) -> Result<Value> {
        let conv = self.conn.query_row(
            "SELECT * FROM conversations WHERE id = ?",
            params![conv_id],
            row_to_json,
        )?;
        let mut stmt = self.conn.prepare(
            "SELECT r.display_name, r.avatar_color, COUNT(*) AS count
             FROM messages m JOIN recipients r ON r.id = m.author_id
             WHERE m.conversation_id = ?
             GROUP BY m.author_id ORDER BY count DESC LIMIT 5",
        )?;
        let top: Vec<Value> = stmt
            .query_map(params![conv_id], row_to_json)?
            .collect::<Result<_>>()?;
        Ok(json!({ "conversation": conv, "topSenders": top }))
    }
}

fn row_to_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let count = row.as_ref().column_count();
    let names: Vec<String> = (0..count)
        .map(|i| row.as_ref().column_name(i).unwrap_or("").to_string())
        .collect();
    let mut map = Map::new();
    for (i, name) in names.iter().enumerate() {
        let val: Value = match row.get_ref(i)? {
            rusqlite::types::ValueRef::Null         => Value::Null,
            rusqlite::types::ValueRef::Integer(n)   => json!(n),
            rusqlite::types::ValueRef::Real(f)      => json!(f),
            rusqlite::types::ValueRef::Text(s)      => {
                Value::String(String::from_utf8_lossy(s).into_owned())
            }
            rusqlite::types::ValueRef::Blob(b)      => {
                Value::String(base64_encode(b))
            }
        };
        map.insert(name.clone(), val);
    }
    Ok(Value::Object(map))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        out.push(CHARS[(b0 >> 2)] as char);
        out.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        out.push(if chunk.len() > 1 { CHARS[((b1 & 0xf) << 2) | (b2 >> 6)] as char } else { '=' });
        out.push(if chunk.len() > 2 { CHARS[b2 & 0x3f] as char } else { '=' });
    }
    out
}

fn sanitize_fts_query(raw: &str) -> String {
    if raw.contains('"') || raw.contains("AND") || raw.contains("OR") || raw.contains("NOT") || raw.contains("NEAR") {
        return raw.to_string();
    }
    raw.split_whitespace()
        .filter_map(|token| {
            let cleaned: String = token.chars()
                .filter(|c| c.is_alphabetic() || c.is_numeric() || *c == '\'' || *c == '-')
                .collect();
            if cleaned.is_empty() { None } else { Some(format!("\"{}\"*", cleaned)) }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
