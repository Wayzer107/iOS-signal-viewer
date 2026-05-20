const Database = require('better-sqlite3')

class ArchiveDB {
  constructor(dbPath) {
    this.db = new Database(dbPath, { readonly: true })
    this.db.pragma('cache_size = -65536')    // 64MB page cache
    this.db.pragma('mmap_size = 536870912')  // 512MB memory-mapped I/O
    this.db.pragma('temp_store = MEMORY')
  }

  getInfo() {
    const rows = this.db.prepare('SELECT key, value FROM schema_info').all()
    const info = Object.fromEntries(rows.map(r => [r.key, r.value]))
    info.user_version = this.db.pragma('user_version', { simple: true })
    return info
  }

  getConversations() {
    return this.db.prepare(`
      SELECT c.id, c.title, c.is_group, c.archived, c.pinned_order,
             c.message_count, c.first_ts, c.last_ts,
             r.display_name, r.avatar_color, r.kind AS recipient_kind
      FROM conversations c
      JOIN recipients r ON r.id = c.recipient_id
      ORDER BY c.pinned_order ASC NULLS LAST, COALESCE(c.last_ts, 0) DESC
    `).all()
  }

  getRecipients() {
    return this.db.prepare('SELECT * FROM recipients').all()
  }

  // Initial load: context window around anchor, or tail of conversation
  getMessages(convId, { anchorId, before = 80, after = 80, limit = 120 } = {}) {
    if (anchorId) {
      const anchor = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(anchorId)
      if (!anchor) return []
      const earlier = this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
          AND (timestamp < ? OR (timestamp = ? AND id < ?))
        ORDER BY timestamp DESC, id DESC LIMIT ?
      `).all(convId, anchor.timestamp, anchor.timestamp, anchor.id, before)
      const later = this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
          AND (timestamp > ? OR (timestamp = ? AND id > ?))
        ORDER BY timestamp ASC, id ASC LIMIT ?
      `).all(convId, anchor.timestamp, anchor.timestamp, anchor.id, after)
      return [...earlier.reverse(), anchor, ...later]
    }
    const msgs = this.db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ?
      ORDER BY timestamp DESC, id DESC LIMIT ?
    `).all(convId, limit)
    return msgs.reverse()
  }

  getMessagesBefore(convId, timestamp, id, limit = 100) {
    const msgs = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND (timestamp < ? OR (timestamp = ? AND id < ?))
      ORDER BY timestamp DESC, id DESC LIMIT ?
    `).all(convId, timestamp, timestamp, id, limit)
    return msgs.reverse()
  }

  getMessagesAfter(convId, timestamp, id, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND (timestamp > ? OR (timestamp = ? AND id > ?))
      ORDER BY timestamp ASC, id ASC LIMIT ?
    `).all(convId, timestamp, timestamp, id, limit)
  }

  search(rawQuery, { convId, authorId, startMs, endMs, limit = 250, offset = 0, orderBy = 'newest' } = {}) {
    const q = sanitizeFTSQuery(rawQuery.trim())
    if (!q) return { results: [], hasMore: false }

    const conditions = ['messages_fts MATCH ?']
    const args = [q]
    if (convId)   { conditions.push('m.conversation_id = ?'); args.push(convId) }
    if (authorId) { conditions.push('m.author_id = ?');       args.push(authorId) }
    if (startMs)  { conditions.push('m.timestamp >= ?');      args.push(startMs) }
    if (endMs)    { conditions.push('m.timestamp <= ?');      args.push(endMs) }

    const orderClause =
      orderBy === 'relevance' ? 'ORDER BY bm25(messages_fts) ASC' :
      orderBy === 'oldest'    ? 'ORDER BY m.timestamp ASC,  m.id ASC' :
                                'ORDER BY m.timestamp DESC, m.id DESC'

    // Fetch one extra to detect hasMore without a separate COUNT query
    const rows = this.db.prepare(`
      SELECT m.id           AS message_id,
             m.conversation_id,
             c.title        AS conversation_title,
             c.is_group,
             r.display_name AS author_name,
             m.author_id,
             m.direction,
             m.timestamp,
             bm25(messages_fts) AS rank,
             snippet(messages_fts, 0, '«', '»', '…', 14) AS snippet
      FROM messages_fts
      JOIN messages      m ON m.id = messages_fts.rowid
      JOIN conversations c ON c.id = m.conversation_id
      JOIN recipients    r ON r.id = m.author_id
      WHERE ${conditions.join(' AND ')}
      ${orderClause}
      LIMIT ? OFFSET ?
    `).all(...args, limit + 1, offset)

    const hasMore = rows.length > limit
    return { results: hasMore ? rows.slice(0, limit) : rows, hasMore }
  }

  getStats(convId) {
    const conv = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId)
    if (!conv) return null
    const topSenders = this.db.prepare(`
      SELECT r.display_name, r.avatar_color, COUNT(*) AS count
      FROM messages m JOIN recipients r ON r.id = m.author_id
      WHERE m.conversation_id = ?
      GROUP BY m.author_id ORDER BY count DESC LIMIT 5
    `).all(convId)
    return { conversation: conv, topSenders }
  }

  close() { this.db.close() }
}

function sanitizeFTSQuery(raw) {
  const hasOperator = raw.includes('"') || /\b(AND|OR|NOT|NEAR)\b/.test(raw)
  if (hasOperator) return raw
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map(token => {
      // Keep letters (Unicode), digits, apostrophes, hyphens — matches iOS logic
      const cleaned = token.replace(/[^\p{L}\p{N}'\-]/gu, '')
      return cleaned ? `"${cleaned}"*` : ''
    })
    .filter(Boolean)
    .join(' ')
}

module.exports = ArchiveDB
