import SwiftUI

@main
struct SignalArchiveApp: App {
    @StateObject private var database = DatabaseManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(database)
                .task { await database.openIfPresent() }
        }
    }
}
