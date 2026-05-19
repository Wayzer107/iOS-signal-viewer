import Foundation

/// The schema version the app is built against. The Mac-side preprocessor
/// writes the same number into `PRAGMA user_version` and the `schema_info`
/// table; we refuse to open any database whose version does not match.
enum Schema {
    static let supportedVersion: Int32 = 1

    enum Tables {
        static let recipients     = "recipients"
        static let conversations  = "conversations"
        static let messages       = "messages"
        static let messagesFTS    = "messages_fts"
        static let schemaInfo     = "schema_info"
    }

    enum MessageKind {
        static let text          = "text"
        static let sticker       = "sticker"
        static let update        = "update"
        static let remoteDeleted = "remote_deleted"
        static let viewOnce      = "view_once"
        static let contactShare  = "contact_share"
        static let storyReply    = "story_reply"
        static let payment       = "payment"
        static let gift          = "gift"
    }

    enum Direction {
        static let outgoing      = "outgoing"
        static let incoming      = "incoming"
        static let directionless = "directionless"
    }
}
