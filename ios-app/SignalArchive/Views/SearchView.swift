import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var database: DatabaseManager
    @State private var query: String = ""
    @State private var results: [SearchResult] = []
    @State private var filters = SearchFilters()
    @State private var conversations: [(Conversation, Recipient?)] = []
    @State private var recipientsById: [Int64: Recipient] = [:]
    @State private var searching = false
    @State private var lastDurationMs: Int = 0
    @State private var filtersShown = false
    @State private var searchTask: Task<Void, Never>? = nil
    enum SortOrder { case newest, oldest, relevance }
    @State private var sortOrder: SortOrder = .newest

    private var sortedResults: [SearchResult] {
        switch sortOrder {
        case .newest:    return results.sorted { $0.timestamp > $1.timestamp }
        case .oldest:    return results.sorted { $0.timestamp < $1.timestamp }
        case .relevance: return results.sorted { $0.rank < $1.rank }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
            filterChips

            if results.isEmpty {
                placeholder
            } else {
                Text("\(results.count) result\(results.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    .padding(.top, 6)
                List(sortedResults) { result in
                    NavigationLink(value: ThreadTarget(conversationId: result.conversationId,
                                                       anchorMessageId: result.messageId)) {
                        SearchResultRow(result: result)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: ThreadTarget.self) { target in
            ThreadView(target: target)
        }
        .sheet(isPresented: $filtersShown) {
            FiltersSheet(
                filters: $filters,
                conversations: conversations,
                recipients: Array(recipientsById.values).sorted { $0.displayName < $1.displayName }
            )
            .presentationDetents([.medium, .large])
        }
        .task { await loadFilterMetadata() }
        .onChange(of: query) { _, newQuery in
            if newQuery.isEmpty { sortOrder = .newest }
            scheduleSearch()
        }
        .onChange(of: filters) { _, _ in scheduleSearch() }
    }

    // MARK: - UI fragments

    private var searchField: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Search messages…", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
            }
            if !results.isEmpty {
                Menu {
                    Button { sortOrder = .newest } label: {
                        Label("Newest first", systemImage: sortOrder == .newest ? "checkmark" : "arrow.down.circle")
                    }
                    Button { sortOrder = .oldest } label: {
                        Label("Oldest first", systemImage: sortOrder == .oldest ? "checkmark" : "arrow.up.circle")
                    }
                    Button { sortOrder = .relevance } label: {
                        Label("Relevance", systemImage: sortOrder == .relevance ? "checkmark" : "text.magnifyingglass")
                    }
                } label: {
                    Image(systemName: sortOrder == .relevance ? "text.magnifyingglass" : "arrow.up.arrow.down")
                }
            }
            Button {
                filtersShown = true
            } label: {
                Image(systemName: filters == SearchFilters() ?
                      "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
            }
        }
        .padding(10)
        .background(.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .padding(.top, 8)
    }

    @ViewBuilder
    private var filterChips: some View {
        if filters != SearchFilters() {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    if let cid = filters.conversationId,
                       let conv = conversations.first(where: { $0.0.id == cid })?.0 {
                        chip("Chat: \(conv.title)") { filters.conversationId = nil }
                    }
                    if let aid = filters.authorId, let recip = recipientsById[aid] {
                        chip("From: \(recip.displayName)") { filters.authorId = nil }
                    }
                    if let start = filters.startDate {
                        chip("After: \(start.formatted(date: .abbreviated, time: .omitted))") { filters.startDate = nil }
                    }
                    if let end = filters.endDate {
                        chip("Before: \(end.formatted(date: .abbreviated, time: .omitted))") { filters.endDate = nil }
                    }
                }
                .padding(.horizontal)
            }
            .padding(.top, 6)
        }
    }

    @ViewBuilder
    private var placeholder: some View {
        VStack(spacing: 12) {
            Spacer()
            if searching {
                ProgressView().padding(.bottom, 6)
                Text("Searching…").foregroundStyle(.secondary)
            } else if query.isEmpty {
                Image(systemName: "magnifyingglass").font(.largeTitle).foregroundStyle(.secondary)
                Text("Search across every conversation").foregroundStyle(.secondary)
                Text("Try a phrase like \"happy birthday\" or use AND / OR for boolean search.")
                    .font(.footnote).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).padding(.horizontal)
            } else {
                Image(systemName: "tray").font(.largeTitle).foregroundStyle(.secondary)
                Text("No matches").foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private func chip(_ label: String, onRemove: @escaping () -> Void) -> some View {
        HStack(spacing: 4) {
            Text(label).font(.caption)
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill").font(.caption2)
            }.foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(.tint.opacity(0.15), in: Capsule())
    }

    // MARK: - Actions

    private func loadFilterMetadata() async {
        guard let queue = database.dbQueue else { return }
        let svc = SearchService(dbQueue: queue)
        do {
            async let conv = svc.allConversations()
            async let recips = svc.recipientsById()
            self.conversations = try await conv
            self.recipientsById = try await recips
        } catch {
            print("loadFilterMetadata error:", error)
        }
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let q = query
        let f = filters
        searchTask = Task { [database] in
            try? await Task.sleep(nanoseconds: 120_000_000) // 120ms debounce
            if Task.isCancelled { return }
            guard let queue = database.dbQueue else { return }
            await MainActor.run { searching = true }
            let svc = SearchService(dbQueue: queue)
            let t0 = Date()
            do {
                let rs = try await svc.search(query: q, filters: f)
                let dur = Int(Date().timeIntervalSince(t0) * 1000)
                if Task.isCancelled { return }
                await MainActor.run {
                    self.results = rs
                    self.lastDurationMs = dur
                    self.searching = false
                }
            } catch {
                await MainActor.run {
                    self.results = []
                    self.searching = false
                }
                print("search error:", error)
            }
        }
    }
}

struct ThreadTarget: Hashable {
    let conversationId: Int64
    var anchorMessageId: Int64? = nil
}
