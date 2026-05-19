import SwiftUI

@MainActor
final class ThreadViewModel: ObservableObject {
    @Published private(set) var messages: [Message] = []
    @Published private(set) var conversation: Conversation? = nil
    @Published private(set) var recipientsById: [Int64: Recipient] = [:]
    @Published private(set) var loadingOlder = false
    @Published private(set) var loadingNewer = false
    @Published private(set) var atOldest = false
    @Published private(set) var atNewest = false

    private let svc: SearchService
    let target: ThreadTarget

    init(svc: SearchService, target: ThreadTarget) {
        self.svc = svc
        self.target = target
    }

    func initialLoad() async {
        do {
            conversation = try await svc.conversation(id: target.conversationId)
            recipientsById = try await svc.recipientsById()

            if let anchor = target.anchorMessageId {
                messages = try await svc.contextWindow(
                    around: anchor,
                    conversationId: target.conversationId,
                    before: 80, after: 80
                )
            } else {
                messages = try await svc.tailMessages(conversationId: target.conversationId, limit: 120)
                atNewest = true
            }
        } catch {
            print("thread initial load:", error)
        }
    }

    func loadOlder() async {
        guard !loadingOlder, !atOldest, let oldest = messages.first else { return }
        loadingOlder = true
        defer { loadingOlder = false }
        do {
            let more = try await svc.messagesBefore(oldest, limit: 100)
            if more.isEmpty { atOldest = true; return }
            messages.insert(contentsOf: more, at: 0)
        } catch {
            print("loadOlder:", error)
        }
    }

    func loadNewer() async {
        guard !loadingNewer, !atNewest, let newest = messages.last else { return }
        loadingNewer = true
        defer { loadingNewer = false }
        do {
            let more = try await svc.messagesAfter(newest, limit: 100)
            if more.isEmpty { atNewest = true; return }
            messages.append(contentsOf: more)
        } catch {
            print("loadNewer:", error)
        }
    }
}

struct ThreadView: View {
    @EnvironmentObject private var database: DatabaseManager
    let target: ThreadTarget

    // The model is built lazily because it needs the live DatabaseQueue,
    // which isn't available in @StateObject's initializer.
    @State private var vm: ThreadViewModel? = nil
    @State private var chromeVisible = true

    var body: some View {
        Group {
            if let vm {
                ThreadContent(vm: vm, anchorId: target.anchorMessageId) {
                    withAnimation(.easeInOut(duration: 0.2)) { chromeVisible.toggle() }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(vm?.conversation?.title ?? "Thread")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(chromeVisible ? .visible : .hidden, for: .navigationBar)
        .toolbar(chromeVisible ? .visible : .hidden, for: .tabBar)
        .task {
            if vm == nil, let queue = database.dbQueue {
                let new = ThreadViewModel(svc: SearchService(dbQueue: queue), target: target)
                await new.initialLoad()
                self.vm = new
            }
        }
    }
}

private struct ThreadContent: View {
    @ObservedObject var vm: ThreadViewModel
    let anchorId: Int64?
    let onTap: () -> Void

    var body: some View {
        ScrollViewReader { proxy in
            List {
                if !vm.atOldest {
                    HStack {
                        Spacer()
                        if vm.loadingOlder { ProgressView() }
                        else { Button("Load earlier") { Task { await vm.loadOlder() } }
                            .buttonStyle(.bordered)
                            .font(.caption) }
                        Spacer()
                    }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .onAppear { Task { await vm.loadOlder() } }
                }

                ForEach(Array(vm.messages.enumerated()), id: \.element.id) { idx, msg in
                    let prev = idx > 0 ? vm.messages[idx - 1] : nil
                    if shouldShowDayHeader(prev: prev, current: msg) {
                        DayHeader(date: msg.date)
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                    MessageRow(message: msg,
                               author: vm.recipientsById[msg.authorId],
                               quoteAuthor: msg.quoteAuthorId.flatMap { vm.recipientsById[$0] },
                               isAnchor: msg.id == anchorId)
                        .id(msg.id)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
                }

                if !vm.atNewest {
                    HStack {
                        Spacer()
                        if vm.loadingNewer { ProgressView() }
                        else { Button("Load newer") { Task { await vm.loadNewer() } }
                            .buttonStyle(.bordered)
                            .font(.caption) }
                        Spacer()
                    }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .onAppear { Task { await vm.loadNewer() } }
                }
            }
            .listStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded { onTap() })
            .onAppear {
                if let anchorId {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        withAnimation { proxy.scrollTo(anchorId, anchor: .center) }
                    }
                }
            }
        }
    }

    private func shouldShowDayHeader(prev: Message?, current: Message) -> Bool {
        guard let prev else { return true }
        return !Calendar.current.isDate(prev.date, inSameDayAs: current.date)
    }
}

private struct DayHeader: View {
    let date: Date
    var body: some View {
        HStack {
            Spacer()
            Text(date.formatted(.dateTime.weekday(.wide).month().day().year()))
                .font(.caption).foregroundStyle(.secondary)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(.gray.opacity(0.12), in: Capsule())
            Spacer()
        }
        .padding(.vertical, 6)
    }
}
