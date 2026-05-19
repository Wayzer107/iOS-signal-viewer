import SwiftUI

struct SearchResultRow: View {
    let result: SearchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: result.isGroupConversation ? "person.3.fill" : "person.fill")
                    .font(.caption).foregroundStyle(.secondary)
                Text(result.conversationTitle)
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                Text(result.date.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            HStack(alignment: .top, spacing: 6) {
                Text("\(result.authorName):")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(result.direction == "outgoing" ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
                highlighted(snippet: result.snippet)
                    .font(.footnote)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
    }

    /// Render the FTS5 snippet, bolding the parts between `«…»`.
    private func highlighted(snippet: String) -> Text {
        var result = Text("")
        var inMatch = false
        var current = ""
        for ch in snippet {
            if ch == "«" {
                if !current.isEmpty {
                    result = result + Text(current)
                    current = ""
                }
                inMatch = true
            } else if ch == "»" {
                if !current.isEmpty {
                    result = result + Text(current).bold().foregroundColor(.accentColor)
                    current = ""
                }
                inMatch = false
            } else {
                current.append(ch)
            }
        }
        if !current.isEmpty {
            result = result + (inMatch
                               ? Text(current).bold().foregroundColor(.accentColor)
                               : Text(current))
        }
        return result
    }
}

struct FiltersSheet: View {
    @Binding var filters: SearchFilters
    let conversations: [(Conversation, Recipient?)]
    let recipients: [Recipient]
    @Environment(\.dismiss) private var dismiss

    @State private var hasStart: Bool = false
    @State private var hasEnd: Bool = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Conversation") {
                    Picker("Conversation", selection: $filters.conversationId) {
                        Text("Any").tag(Int64?.none)
                        ForEach(conversations, id: \.0.id) { conv, _ in
                            Text(conv.title).tag(Optional(conv.id))
                        }
                    }
                }
                Section("Sender") {
                    Picker("Sender", selection: $filters.authorId) {
                        Text("Anyone").tag(Int64?.none)
                        ForEach(recipients) { r in
                            Text(r.displayName).tag(Optional(r.id))
                        }
                    }
                }
                Section("Date range") {
                    Toggle("Start date", isOn: $hasStart)
                    if hasStart {
                        DatePicker("From", selection: Binding(
                            get: { filters.startDate ?? Date() },
                            set: { filters.startDate = $0 }
                        ), displayedComponents: .date)
                    }
                    Toggle("End date", isOn: $hasEnd)
                    if hasEnd {
                        DatePicker("To", selection: Binding(
                            get: { filters.endDate ?? Date() },
                            set: { filters.endDate = $0 }
                        ), displayedComponents: .date)
                    }
                }
                Section {
                    Button("Reset filters", role: .destructive) {
                        filters = SearchFilters()
                        hasStart = false; hasEnd = false
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                hasStart = filters.startDate != nil
                hasEnd   = filters.endDate   != nil
            }
            .onChange(of: hasStart) { _, on in if !on { filters.startDate = nil } }
            .onChange(of: hasEnd)   { _, on in if !on { filters.endDate   = nil } }
        }
    }
}
