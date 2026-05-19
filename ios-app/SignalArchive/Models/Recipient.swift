import Foundation
import GRDB

struct Recipient: Codable, FetchableRecord, PersistableRecord, Identifiable, Hashable {
    static let databaseTableName = Schema.Tables.recipients

    var id: Int64
    var kind: String
    var displayName: String
    var givenName: String?
    var familyName: String?
    var phoneNumber: String?
    var aci: String?
    var groupTitle: String?
    var avatarColor: String?

    enum CodingKeys: String, CodingKey {
        case id
        case kind
        case displayName  = "display_name"
        case givenName    = "given_name"
        case familyName   = "family_name"
        case phoneNumber  = "phone_number"
        case aci
        case groupTitle   = "group_title"
        case avatarColor  = "avatar_color"
    }

    var isSelf:  Bool { kind == "self" }
    var isGroup: Bool { kind == "group" }
}
