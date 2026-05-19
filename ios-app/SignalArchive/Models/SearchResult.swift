import Foundation

/// A single FTS5 hit, denormalized to carry everything the result row needs.
struct SearchResult: Identifiable, Hashable {
    let messageId: Int64
    let conversationId: Int64
    let conversationTitle: String
    let isGroupConversation: Bool
    let authorName: String
    let authorId: Int64
    let direction: String
    let timestamp: Int64
    /// Body snippet wrapped with `«` … `»` around the match — split for highlighting.
    let snippet: String
    let rank: Double

    var id: Int64 { messageId }
    var date: Date { Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000) }
}

/// Filters layered on top of the FTS5 query.
struct SearchFilters: Equatable {
    var conversationId: Int64? = nil
    var authorId: Int64? = nil
    var startDate: Date? = nil
    var endDate: Date? = nil
}
