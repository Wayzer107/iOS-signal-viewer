import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var database: DatabaseManager
    @State private var confirmDelete = false

    var body: some View {
        Form {
            Section("Archive") {
                if let info = database.info {
                    LabeledContent("Schema version", value: "\(info.schemaVersion)")
                    LabeledContent("Messages",       value: info.messageCount.formatted())
                    LabeledContent("Conversations",  value: info.conversationCount.formatted())
                    LabeledContent("Recipients",     value: info.recipientCount.formatted())
                    if let g = info.generatedAt {
                        LabeledContent("Generated",  value: g)
                    }
                    if let src = info.sourceJsonl {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Source JSONL").font(.subheadline)
                            Text(src).font(.caption).foregroundStyle(.secondary).lineLimit(2).truncationMode(.head)
                        }
                    }
                }
            }

            Section("Database file") {
                Text(DatabaseManager.databaseURL.lastPathComponent)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
                Button("Replace archive…", systemImage: "arrow.triangle.2.circlepath") {
                    confirmDelete = true
                }
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Delete archive", systemImage: "trash")
                }
            }

            Section("About") {
                Text("Signal Chat Archive Reader is read-only. It never connects to your live Signal account.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .confirmationDialog(
            "Delete the imported archive?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { database.deleteDatabase() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will need to re-import a .sqlite file to continue using the app.")
        }
    }
}
