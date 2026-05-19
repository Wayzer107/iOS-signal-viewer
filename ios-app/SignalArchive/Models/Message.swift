import Foundation
import GRDB

struct Message: Codable, FetchableRecord, PersistableRecord, Identifiable, Hashable {
    static let databaseTableName = Schema.Tables.messages

    var id: Int64
    var conversationId: Int64
    var authorId: Int64
    var timestamp: Int64
    var direction: String
    var kind: String
    var body: String?
    var hasAttachments: Bool
    var hasQuote: Bool
    var quoteAuthorId: Int64?
    var quoteBody: String?
    var updateText: String?

    enum CodingKeys: String, CodingKey {
        case id
        case conversationId = "conversation_id"
        case authorId       = "author_id"
        case timestamp
        case direction
        case kind
        case body
        case hasAttachments = "has_attachments"
        case hasQuote       = "has_quote"
        case quoteAuthorId  = "quote_author_id"
        case quoteBody      = "quote_body"
        case updateText     = "update_text"
    }

    var date: Date { Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000) }
    var isOutgoing: Bool      { direction == Schema.Direction.outgoing }
    var isIncoming: Bool      { direction == Schema.Direction.incoming }
    var isDirectionless: Bool { direction == Schema.Direction.directionless }
    var isSystem: Bool        { kind == Schema.MessageKind.update }
    var displayBody: String {
        if let b = body, !b.isEmpty { return b }
        if let u = updateText { return u }
        switch kind {
        case Schema.MessageKind.sticker:       return "[sticker]"
        case Schema.MessageKind.remoteDeleted: return "[deleted]"
        case Schema.MessageKind.viewOnce:      return "[view-once media]"
        case Schema.MessageKind.contactShare:  return "[shared contact]"
        case Schema.MessageKind.payment:       return "[payment]"
        case Schema.MessageKind.gift:          return "[gift]"
        default:                                return "[no text]"
        }
    }
}
