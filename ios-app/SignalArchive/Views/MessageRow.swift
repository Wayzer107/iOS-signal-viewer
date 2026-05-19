import SwiftUI

struct MessageRow: View {
    let message: Message
    let author: Recipient?
    let quoteAuthor: Recipient?
    let isAnchor: Bool

    var body: some View {
        if message.isSystem {
            systemRow
        } else {
            chatRow
        }
    }

    private var systemRow: some View {
        HStack {
            Spacer()
            Text(message.displayBody)
                .font(.caption2).foregroundStyle(.secondary)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(.gray.opacity(0.08), in: Capsule())
            Spacer()
        }
        .padding(.vertical, 2)
    }

    private var chatRow: some View {
        HStack(alignment: .bottom) {
            if message.isOutgoing { Spacer(minLength: 40) }
            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 2) {
                if !message.isOutgoing, let author {
                    Text(author.displayName)
                        .font(.caption2).foregroundStyle(.secondary)
                        .padding(.leading, 4)
                }

                if message.hasQuote, let qb = message.quoteBody, !qb.isEmpty {
                    quoteView(body: qb)
                }

                Text(message.displayBody)
                    .font(.body)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(bubbleColor, in: RoundedRectangle(cornerRadius: 16))
                    .foregroundStyle(message.isOutgoing ? Color.white : .primary)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(isAnchor ? Color.yellow : .clear, lineWidth: 2)
                    )

                HStack(spacing: 6) {
                    if message.hasAttachments {
                        Image(systemName: "paperclip").font(.caption2).foregroundStyle(.secondary)
                    }
                    Text(message.date.formatted(date: .omitted, time: .shortened))
                        .font(.caption2).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 4)
            }
            if !message.isOutgoing { Spacer(minLength: 40) }
        }
        .padding(.vertical, 1)
    }

    private var bubbleColor: Color {
        if message.isOutgoing { return .accentColor }
        return Color(.secondarySystemBackground)
    }

    private func quoteView(body: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(.tint).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                if let qa = quoteAuthor {
                    Text(qa.displayName).font(.caption2.bold()).foregroundStyle(.secondary)
                }
                Text(body).font(.caption).foregroundStyle(.secondary).lineLimit(3)
            }
            .padding(.vertical, 4)
        }
        .padding(.horizontal, 8).padding(.vertical, 2)
        .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
    }
}
