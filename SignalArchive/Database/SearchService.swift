import Foundation
import GRDB

/// All read-only queries against the archive. Use `DatabaseManager`'s queue.
struct SearchService {
    let dbQueue: DatabaseQueue

    // MARK: - Full text search

    /// `query` is passed straight to FTS5 MATCH. Empty string returns no rows.
    func search(query: String, filters: SearchFilters, limit: Int? = nil) async throws -> [SearchResult] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return [] }
        let ftsQuery = Self.sanitizeFTSQuery(q)

        return try await dbQueue.read { db in
            var where_ = ["messages_fts MATCH ?"]
            var args: [DatabaseValueConvertible] = [ftsQuery]
            if let cid = filters.conversationId {
                where_.append("m.conversation_id = ?")
                args.append(cid)
            }
            if let aid = filters.authorId {
                where_.append("m.author_id = ?")
                args.append(aid)
            }
            if let start = filters.startDate {
                where_.append("m.timestamp >= ?")
                args.append(Int64(start.timeIntervalSince1970 * 1000))
            }
            if let end = filters.endDate {
                where_.append("m.timestamp <= ?")
                args.append(Int64(end.timeIntervalSince1970 * 1000))
            }

            let limitClause = limit.map { "LIMIT \($0)" } ?? ""
            let sql = """
                SELECT m.id           AS messageId,
                       m.conversation_id AS conversationId,
                       c.title        AS conversationTitle,
                       c.is_group     AS isGroupConversation,
                       r.display_name AS authorName,
                       m.author_id    AS authorId,
                       m.direction    AS direction,
                       m.timestamp    AS timestamp,
                       bm25(messages_fts) AS rank,
                       snippet(messages_fts, 0, '«', '»', '…', 14) AS snippet
                FROM messages_fts
                JOIN messages       m ON m.id = messages_fts.rowid
                JOIN conversations  c ON c.id = m.conversation_id
                JOIN recipients     r ON r.id = m.author_id
                WHERE \(where_.joined(separator: " AND "))
                \(limitClause)
                """

            let rows = try Row.fetchAll(db, sql: sql, arguments: StatementArguments(args))
            return rows.map { row in
                let isGroup: Bool = row["isGroupConversation"]
                let snippet: String = row["snippet"] ?? ""
                let rank: Double = row["rank"] ?? 0
                return SearchResult(
                    messageId: row["messageId"],
                    conversationId: row["conversationId"],
                    conversationTitle: row["conversationTitle"],
                    isGroupConversation: isGroup,
                    authorName: row["authorName"],
                    authorId: row["authorId"],
                    direction: row["direction"],
                    timestamp: row["timestamp"],
                    snippet: snippet,
                    rank: rank
                )
            }
        }
    }

    /// Sanitize a user-typed query for FTS5. We treat the user's input as a phrase
    /// of prefix-tokens unless they used FTS operators (AND/OR/NOT, quotes, `*`).
    static func sanitizeFTSQuery(_ raw: String) -> String {
        // If the user used quoting or boolean operators, pass through but strip
        // characters that would break the FTS grammar.
        let hasOperator = raw.contains("\"") || raw.range(of: #"\b(AND|OR|NOT|NEAR)\b"#, options: .regularExpression) != nil
        if hasOperator {
            return raw
        }
        // Tokenize on whitespace, escape each token, append `*` for prefix matching.
        let tokens = raw
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .map { token -> String in
                let cleaned = token.filter { $0.isLetter || $0.isNumber || $0 == "'" || $0 == "-" }
                return cleaned.isEmpty ? "" : "\"\(cleaned)\"*"
            }
            .filter { !$0.isEmpty }
        return tokens.joined(separator: " ")
    }

    // MARK: - Conversation list & lookups

    func allConversations() async throws -> [(Conversation, Recipient?)] {
        try await dbQueue.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT c.*, r.id AS r_id, r.kind AS r_kind, r.display_name AS r_display_name,
                       r.given_name AS r_given_name, r.family_name AS r_family_name,
                       r.phone_number AS r_phone_number, r.aci AS r_aci,
                       r.group_title AS r_group_title, r.avatar_color AS r_avatar_color
                FROM conversations c
                LEFT JOIN recipients r ON r.id = c.recipient_id
                ORDER BY COALESCE(c.last_ts, 0) DESC
                """)
            return rows.map { row in
                let isGroup: Bool = row["is_group"]
                let archived: Bool = row["archived"]
                let conv = Conversation(
                    id: row["id"], recipientId: row["recipient_id"], title: row["title"],
                    isGroup: isGroup, archived: archived,
                    pinnedOrder: row["pinned_order"],
                    messageCount: row["message_count"],
                    firstTs: row["first_ts"], lastTs: row["last_ts"]
                )
                let recipId: Int64? = row["r_id"]
                let recip: Recipient? = recipId.map { rid in
                    let kind: String = row["r_kind"] ?? "unknown"
                    let display: String = row["r_display_name"] ?? "?"
                    return Recipient(
                        id: rid,
                        kind: kind,
                        displayName: display,
                        givenName: row["r_given_name"],
                        familyName: row["r_family_name"],
                        phoneNumber: row["r_phone_number"],
                        aci: row["r_aci"],
                        groupTitle: row["r_group_title"],
                        avatarColor: row["r_avatar_color"]
                    )
                }
                return (conv, recip)
            }
        }
    }

    func conversation(id: Int64) async throws -> Conversation? {
        try await dbQueue.read { db in try Conversation.fetchOne(db, key: id) }
    }

    func recipient(id: Int64) async throws -> Recipient? {
        try await dbQueue.read { db in try Recipient.fetchOne(db, key: id) }
    }

    func recipientsById() async throws -> [Int64: Recipient] {
        try await dbQueue.read { db in
            let all = try Recipient.fetchAll(db)
            return Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
        }
    }

    func participants(in conversationId: Int64) async throws -> [Recipient] {
        try await dbQueue.read { db in
            try Recipient.fetchAll(db, sql: """
                SELECT * FROM recipients
                WHERE id IN (SELECT DISTINCT author_id FROM messages WHERE conversation_id = ?)
                ORDER BY display_name
                """, arguments: [conversationId])
        }
    }

    // MARK: - Thread browsing

    /// Latest N messages in a conversation, oldest-first.
    func tailMessages(conversationId: Int64, limit: Int) async throws -> [Message] {
        try await dbQueue.read { db in
            let msgs = try Message.fetchAll(db, sql: """
                SELECT * FROM messages WHERE conversation_id = ?
                ORDER BY timestamp DESC, id DESC LIMIT ?
                """, arguments: [conversationId, limit])
            return msgs.reversed()
        }
    }

    /// Messages around an anchor message (inclusive), oldest-first.
    func contextWindow(around anchorId: Int64, conversationId: Int64,
                       before: Int, after: Int) async throws -> [Message] {
        try await dbQueue.read { db in
            guard let anchor = try Message.fetchOne(db, key: anchorId) else { return [] }
            let earlier = try Message.fetchAll(db, sql: """
                SELECT * FROM messages
                WHERE conversation_id = ?
                  AND (timestamp < ? OR (timestamp = ? AND id < ?))
                ORDER BY timestamp DESC, id DESC LIMIT ?
                """, arguments: [conversationId, anchor.timestamp, anchor.timestamp, anchor.id, before])
            let later = try Message.fetchAll(db, sql: """
                SELECT * FROM messages
                WHERE conversation_id = ?
                  AND (timestamp > ? OR (timestamp = ? AND id > ?))
                ORDER BY timestamp ASC, id ASC LIMIT ?
                """, arguments: [conversationId, anchor.timestamp, anchor.timestamp, anchor.id, after])
            return earlier.reversed() + [anchor] + later
        }
    }

    /// Page additional messages older than `oldest`.
    func messagesBefore(_ oldest: Message, limit: Int) async throws -> [Message] {
        try await dbQueue.read { db in
            let rows = try Message.fetchAll(db, sql: """
                SELECT * FROM messages
                WHERE conversation_id = ?
                  AND (timestamp < ? OR (timestamp = ? AND id < ?))
                ORDER BY timestamp DESC, id DESC LIMIT ?
                """, arguments: [oldest.conversationId, oldest.timestamp, oldest.timestamp, oldest.id, limit])
            return rows.reversed()
        }
    }

    /// Page additional messages newer than `newest`.
    func messagesAfter(_ newest: Message, limit: Int) async throws -> [Message] {
        try await dbQueue.read { db in
            try Message.fetchAll(db, sql: """
                SELECT * FROM messages
                WHERE conversation_id = ?
                  AND (timestamp > ? OR (timestamp = ? AND id > ?))
                ORDER BY timestamp ASC, id ASC LIMIT ?
                """, arguments: [newest.conversationId, newest.timestamp, newest.timestamp, newest.id, limit])
        }
    }

    // MARK: - Stats

    struct ConversationStats {
        let conversation: Conversation
        let messageCount: Int
        let topSenders: [(Recipient, Int)]
        let firstDate: Date?
        let lastDate: Date?
    }

    func stats(for conversationId: Int64) async throws -> ConversationStats? {
        try await dbQueue.read { db in
            guard let conv = try Conversation.fetchOne(db, key: conversationId) else { return nil }
            let rows = try Row.fetchAll(db, sql: """
                SELECT r.*, COUNT(*) AS n
                FROM messages m JOIN recipients r ON r.id = m.author_id
                WHERE m.conversation_id = ?
                GROUP BY m.author_id
                ORDER BY n DESC
                LIMIT 5
                """, arguments: [conversationId])
            let top = rows.map { row -> (Recipient, Int) in
                let r = Recipient(
                    id: row["id"], kind: row["kind"], displayName: row["display_name"],
                    givenName: row["given_name"], familyName: row["family_name"],
                    phoneNumber: row["phone_number"], aci: row["aci"],
                    groupTitle: row["group_title"], avatarColor: row["avatar_color"]
                )
                let n: Int = row["n"]
                return (r, n)
            }
            return ConversationStats(
                conversation: conv,
                messageCount: conv.messageCount,
                topSenders: top,
                firstDate: conv.firstDate,
                lastDate: conv.lastDate
            )
        }
    }

    func globalStats() async throws -> (totalMessages: Int, firstDate: Date?, lastDate: Date?) {
        try await dbQueue.read { db in
            let total = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages") ?? 0
            let minTs = try Int64.fetchOne(db, sql: "SELECT MIN(timestamp) FROM messages") ?? 0
            let maxTs = try Int64.fetchOne(db, sql: "SELECT MAX(timestamp) FROM messages") ?? 0
            let first = minTs > 0 ? Date(timeIntervalSince1970: TimeInterval(minTs) / 1000) : nil
            let last  = maxTs > 0 ? Date(timeIntervalSince1970: TimeInterval(maxTs) / 1000) : nil
            return (total, first, last)
        }
    }
}
