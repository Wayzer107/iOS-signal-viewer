import SwiftUI

struct ConversationListView: View {
    @EnvironmentObject private var database: DatabaseManager
    @State private var conversations: [(Conversation, Recipient?)] = []
    @State private var loading = true

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if conversations.isEmpty {
                ContentUnavailableView("No conversations",
                                       systemImage: "bubble.left.and.bubble.right",
                                       description: Text("The archive doesn't contain any chats."))
            } else {
                List(conversations, id: \.0.id) { conv, _ in
                    NavigationLink(value: ThreadTarget(conversationId: conv.id, anchorMessageId: nil)) {
                        ConversationRow(conv: conv)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Chats")
        .navigationDestination(for: ThreadTarget.self) { target in
            ThreadView(target: target)
        }
        .task { await load() }
    }

    private func load() async {
        guard let queue = database.dbQueue else { return }
        let svc = SearchService(dbQueue: queue)
        do {
            self.conversations = try await svc.allConversations()
        } catch {
            print("conversation list error:", error)
        }
        self.loading = false
    }
}

private struct ConversationRow: View {
    let conv: Conversation

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(.tint.opacity(0.18))
                Image(systemName: conv.isGroup ? "person.3.fill" : "person.fill")
                    .foregroundStyle(.tint)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 2) {
                Text(conv.title).font(.body).lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(conv.messageCount.formatted()) msgs")
                    if let first = conv.firstDate, let last = conv.lastDate {
                        Text("· \(first.formatted(.dateTime.year().month())) – \(last.formatted(.dateTime.year().month()))")
                    }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }
}
