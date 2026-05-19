import Foundation
import GRDB

/// Owns the connection to the imported Signal archive database. Read-only.
@MainActor
final class DatabaseManager: ObservableObject {
    enum State: Equatable {
        case noDatabase
        case opening
        case ready
        case error(String)
    }

    @Published private(set) var state: State = .noDatabase
    @Published private(set) var info: ArchiveInfo? = nil

    private(set) var dbQueue: DatabaseQueue?

    /// Where the imported .sqlite lives inside the app sandbox.
    static var databaseURL: URL {
        let base = try! FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return base.appendingPathComponent("signal_archive.sqlite")
    }

    var databaseExists: Bool {
        FileManager.default.fileExists(atPath: Self.databaseURL.path)
    }

    // MARK: - Open / close

    func openIfPresent() async {
        guard databaseExists else {
            state = .noDatabase
            return
        }
        await open(url: Self.databaseURL, alreadyInSandbox: true)
    }

    /// Open the database at `url`. If it's not yet in the sandbox we copy it.
    func open(url: URL, alreadyInSandbox: Bool) async {
        state = .opening
        do {
            let finalURL = Self.databaseURL
            if !alreadyInSandbox {
                if FileManager.default.fileExists(atPath: finalURL.path) {
                    try FileManager.default.removeItem(at: finalURL)
                }
                // Security-scoped resource — the picker hands us a URL we need to ask permission for.
                let needsScope = url.startAccessingSecurityScopedResource()
                defer { if needsScope { url.stopAccessingSecurityScopedResource() } }
                try FileManager.default.copyItem(at: url, to: finalURL)
            }

            var config = Configuration()
            config.readonly = true
            config.label = "SignalArchive"

            let queue = try DatabaseQueue(path: finalURL.path, configuration: config)
            let archiveInfo = try await readAndValidate(queue: queue)
            self.dbQueue = queue
            self.info = archiveInfo
            self.state = .ready
        } catch let err as ImportError {
            self.state = .error(err.message)
            self.dbQueue = nil
        } catch {
            self.state = .error(error.localizedDescription)
            self.dbQueue = nil
        }
    }

    func deleteDatabase() {
        dbQueue = nil
        info = nil
        try? FileManager.default.removeItem(at: Self.databaseURL)
        state = .noDatabase
    }

    // MARK: - Validation

    struct ArchiveInfo: Equatable {
        let schemaVersion: Int32
        let generatedAt: String?
        let sourceJsonl: String?
        let messageCount: Int
        let recipientCount: Int
        let conversationCount: Int
    }

    private func readAndValidate(queue: DatabaseQueue) async throws -> ArchiveInfo {
        try await queue.read { db in
            let userVersion = try Int32.fetchOne(db, sql: "PRAGMA user_version") ?? 0
            guard userVersion == Schema.supportedVersion else {
                throw ImportError(message:
                    "Schema version mismatch. App expects v\(Schema.supportedVersion), file is v\(userVersion). Re-run signal_to_sqlite.py and try again.")
            }
            for table in [Schema.Tables.messages, Schema.Tables.conversations,
                          Schema.Tables.recipients, Schema.Tables.messagesFTS] {
                let exists = try Bool.fetchOne(db, sql:
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE name = ?", arguments: [table]) ?? false
                guard exists else {
                    throw ImportError(message: "Missing required table '\(table)'.")
                }
            }

            // schema_info is a small key/value table.
            var infoMap: [String: String] = [:]
            let rows = try Row.fetchAll(db, sql: "SELECT key, value FROM schema_info")
            for r in rows {
                if let k: String = r["key"], let v: String = r["value"] {
                    infoMap[k] = v
                }
            }

            let mc = try Int(infoMap["message_count"] ?? "")
                ?? Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages") ?? 0
            let rc = try Int(infoMap["recipient_count"] ?? "")
                ?? Int.fetchOne(db, sql: "SELECT COUNT(*) FROM recipients") ?? 0
            let cc = try Int(infoMap["conversation_count"] ?? "")
                ?? Int.fetchOne(db, sql: "SELECT COUNT(*) FROM conversations") ?? 0

            return ArchiveInfo(
                schemaVersion: userVersion,
                generatedAt: infoMap["generated_at"],
                sourceJsonl: infoMap["source_jsonl"],
                messageCount: mc,
                recipientCount: rc,
                conversationCount: cc,
            )
        }
    }
}

struct ImportError: Error {
    let message: String
}
