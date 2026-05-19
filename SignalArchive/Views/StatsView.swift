import SwiftUI

struct StatsView: View {
    @EnvironmentObject private var database: DatabaseManager
    @State private var conversations: [(Conversation, Recipient?)] = []
    @State private var total: Int = 0
    @State private var firstDate: Date? = nil
    @State private var lastDate: Date? = nil
    @State private var loading = true

    var body: some View {
        List {
            Section {
                StatTile(label: "Total messages", value: total.formatted())
                if let f = firstDate { StatTile(label: "First message", value: f.formatted(date: .abbreviated, time: .omitted)) }
                if let l = lastDate { StatTile(label: "Latest message", value: l.formatted(date: .abbreviated, time: .omitted)) }
                StatTile(label: "Conversations", value: conversations.count.formatted())
            }

            Section("Top conversations") {
                ForEach(conversations.sorted { $0.0.messageCount > $1.0.messageCount }
                                  .prefix(10), id: \.0.id) { conv, _ in
                    NavigationLink(value: ThreadTarget(conversationId: conv.id, anchorMessageId: nil)) {
                        HStack {
                            Image(systemName: conv.isGroup ? "person.3.fill" : "person.fill")
                                .foregroundStyle(.tint)
                            VStack(alignment: .leading) {
                                Text(conv.title).font(.body)
                                if let f = conv.firstDate, let l = conv.lastDate {
                                    Text("\(f.formatted(.dateTime.year().month())) – \(l.formatted(.dateTime.year().month()))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text(conv.messageCount.formatted())
                                .font(.callout.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Stats")
        .navigationDestination(for: ThreadTarget.self) { target in
            ThreadView(target: target)
        }
        .overlay {
            if loading { ProgressView() }
        }
        .task { await load() }
    }

    private func load() async {
        guard let queue = database.dbQueue else { return }
        let svc = SearchService(dbQueue: queue)
        do {
            async let cs = svc.allConversations()
            async let global = svc.globalStats()
            self.conversations = try await cs
            let g = try await global
            self.total = g.totalMessages
            self.firstDate = g.firstDate
            self.lastDate = g.lastDate
        } catch {
            print("stats error:", error)
        }
        self.loading = false
    }
}

private struct StatTile: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).font(.body.monospacedDigit()).foregroundStyle(.secondary)
        }
    }
}
