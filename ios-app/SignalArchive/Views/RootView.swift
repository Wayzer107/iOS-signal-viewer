import SwiftUI

struct RootView: View {
    @EnvironmentObject private var database: DatabaseManager

    var body: some View {
        Group {
            switch database.state {
            case .noDatabase, .error:
                ImportView()
            case .opening:
                ProgressView("Opening archive…")
                    .progressViewStyle(.circular)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .ready:
                MainTabs()
            }
        }
    }
}

private struct MainTabs: View {
    @EnvironmentObject private var database: DatabaseManager

    var body: some View {
        TabView {
            NavigationStack { SearchView() }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }

            NavigationStack { ConversationListView() }
                .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right") }

            NavigationStack { StatsView() }
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }

            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
