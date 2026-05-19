import Foundation
import GRDB

struct Conversation: Codable, FetchableRecord, PersistableRecord, Identifiable, Hashable {
    static let databaseTableName = Schema.Tables.conversations

    var id: Int64
    var recipientId: Int64
    var title: String
    var isGroup: Bool
    var archived: Bool
    var pinnedOrder: Int?
    var messageCount: Int
    var firstTs: Int64?
    var lastTs: Int64?

    enum CodingKeys: String, CodingKey {
        case id
        case recipientId  = "recipient_id"
        case title
        case isGroup      = "is_group"
        case archived
        case pinnedOrder  = "pinned_order"
        case messageCount = "message_count"
        case firstTs      = "first_ts"
        case lastTs       = "last_ts"
    }

    var firstDate: Date? { firstTs.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) } }
    var lastDate:  Date? { lastTs.map  { Date(timeIntervalSince1970: TimeInterval($0) / 1000) } }
}
