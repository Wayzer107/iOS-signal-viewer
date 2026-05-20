// Classic Web Worker — loaded via importScripts so it works without ESM bundling.
// sql-wasm.js and sql-wasm.wasm are copied to public/ during pnpm setup.
importScripts('/sql-wasm.js')

let db = null

function sanitizeFTSQuery(raw) {
  const hasOp = raw.includes('"') || /\b(AND|OR|NOT|NEAR)\b/.test(raw)
  if (hasOp) return raw
  return raw.split(/\s+/).filter(Boolean).map(token => {
    const cleaned = token.replace(/[^\p{L}\p{N}'\-]/gu, '')
    return cleaned ? '"' + cleaned + '"*' : ''
  }).filter(Boolean).join(' ')
}

function rows(stmt, bind) {
  if (bind) stmt.bind(bind)
  const out = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

function one(stmt, bind) {
  return rows(stmt, bind)[0] ?? null
}

const handlers = {
  async init(buffer) {
    const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
    db = new SQL.Database(new Uint8Array(buffer))
    db.run('PRAGMA cache_size = -65536')
    db.run('PRAGMA temp_store = MEMORY')
    return { ok: true }
  },

  getInfo() {
    const info = Object.fromEntries(
      rows(db.prepare('SELECT key, value FROM schema_info'))
        .map(r => [r.key, r.value])
    )
    const [vrow] = db.exec('PRAGMA user_version')
    info.user_version = vrow?.values[0][0] ?? 0
    return info
  },

  getConversations() {
    return rows(db.prepare(`
      SELECT c.id, c.title, c.is_group, c.archived, c.pinned_order,
             c.message_count, c.first_ts, c.last_ts,
             r.display_name, r.avatar_color, r.kind AS recipient_kind
      FROM conversations c
      JOIN recipients r ON r.id = c.recipient_id
      ORDER BY c.pinned_order ASC NULLS LAST, COALESCE(c.last_ts, 0) DESC
    `))
  },

  getRecipients() {
    return rows(db.prepare('SELECT * FROM recipients'))
  },

  getMessages(convId, params = {}) {
    const { direction, refId, refTs, limit, anchorId, before, after } = params
    if (direction === 'before' && refId != null && refTs != null) {
      return handlers._getMessagesBefore(convId, Number(refTs), Number(refId), Number(limit) || 100)
    }
    if (direction === 'after' && refId != null && refTs != null) {
      return handlers._getMessagesAfter(convId, Number(refTs), Number(refId), Number(limit) || 100)
    }
    const aid = anchorId != null ? Number(anchorId) : null
    if (aid != null) {
      const anchor = one(db.prepare('SELECT * FROM messages WHERE id = ?'), [aid])
      if (!anchor) return []
      const earlier = rows(db.prepare(`
        SELECT * FROM messages WHERE conversation_id = ?
          AND (timestamp < ? OR (timestamp = ? AND id < ?))
        ORDER BY timestamp DESC, id DESC LIMIT ?
      `), [convId, anchor.timestamp, anchor.timestamp, anchor.id, Number(before) || 80]).reverse()
      const later = rows(db.prepare(`
        SELECT * FROM messages WHERE conversation_id = ?
          AND (timestamp > ? OR (timestamp = ? AND id > ?))
        ORDER BY timestamp ASC, id ASC LIMIT ?
      `), [convId, anchor.timestamp, anchor.timestamp, anchor.id, Number(after) || 80])
      return [...earlier, anchor, ...later]
    }
    return rows(db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ?
      ORDER BY timestamp DESC, id DESC LIMIT ?
    `), [convId, Number(limit) || 120]).reverse()
  },

  _getMessagesBefore(convId, timestamp, id, limit = 100) {
    return rows(db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ?
        AND (timestamp < ? OR (timestamp = ? AND id < ?))
      ORDER BY timestamp DESC, id DESC LIMIT ?
    `), [convId, timestamp, timestamp, id, limit]).reverse()
  },

  _getMessagesAfter(convId, timestamp, id, limit = 100) {
    return rows(db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ?
        AND (timestamp > ? OR (timestamp = ? AND id > ?))
      ORDER BY timestamp ASC, id ASC LIMIT ?
    `), [convId, timestamp, timestamp, id, limit])
  },

  search(rawQuery, { convId, authorId, startMs, endMs, limit = 250, offset = 0, orderBy = 'newest' } = {}) {
    const q = sanitizeFTSQuery(rawQuery.trim())
    if (!q) return { results: [], hasMore: false }

    const conditions = ['messages_fts MATCH ?']
    const args = [q]
    if (convId != null && convId !== '')   { conditions.push('m.conversation_id = ?'); args.push(Number(convId)) }
    if (authorId != null && authorId !== '') { conditions.push('m.author_id = ?');       args.push(Number(authorId)) }
    if (startMs != null)  { conditions.push('m.timestamp >= ?');      args.push(Number(startMs)) }
    if (endMs != null)    { conditions.push('m.timestamp <= ?');      args.push(Number(endMs)) }

    // FTS4 (sql.js) does not support bm25(); relevance falls back to newest
    const orderClause =
      orderBy === 'oldest' ? 'ORDER BY m.timestamp ASC, m.id ASC' :
                             'ORDER BY m.timestamp DESC, m.id DESC'

    const result = rows(db.prepare(`
      SELECT m.id           AS message_id,
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
      WHERE ${conditions.join(' AND ')}
      ${orderClause}
      LIMIT ? OFFSET ?
    `), [...args, limit + 1, offset])

    const hasMore = result.length > limit
    return { results: hasMore ? result.slice(0, limit) : result, hasMore }
  },

  getStats(convId) {
    const conv = one(db.prepare('SELECT * FROM conversations WHERE id = ?'), [convId])
    if (!conv) return null
    const topSenders = rows(db.prepare(`
      SELECT r.display_name, r.avatar_color, COUNT(*) AS count
      FROM messages m JOIN recipients r ON r.id = m.author_id
      WHERE m.conversation_id = ?
      GROUP BY m.author_id ORDER BY count DESC LIMIT 5
    `), [convId])
    return { conversation: conv, topSenders }
  },
}

self.onmessage = async ({ data: { id, method, args = [] } }) => {
  try {
    const fn = handlers[method]
    if (!fn) throw new Error('Unknown method: ' + method)
    const result = await fn(...args)
    self.postMessage({ id, result })
  } catch (e) {
    self.postMessage({ id, error: e.message })
  }
}

self.postMessage({ type: 'ready' })
