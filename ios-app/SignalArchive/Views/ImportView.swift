import SwiftUI
import UniformTypeIdentifiers

struct ImportView: View {
    @EnvironmentObject private var database: DatabaseManager
    @State private var pickerShown = false

    private static let sqliteType: UTType =
        UTType(filenameExtension: "sqlite") ?? UTType.database

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: "tray.and.arrow.down.fill")
                        .font(.system(size: 64, weight: .light))
                        .foregroundStyle(.tint)
                        .padding(.top, 40)

                    Text("Signal Archive")
                        .font(.largeTitle.bold())
                    Text("Import a Signal chat archive (.sqlite) to search and browse.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)

                    if case .error(let msg) = database.state {
                        ErrorBanner(message: msg)
                    }

                    Button {
                        pickerShown = true
                    } label: {
                        Label("Import archive…", systemImage: "square.and.arrow.down")
                            .font(.headline)
                            .padding(.vertical, 12)
                            .frame(maxWidth: 320)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 8)

                    StepsExplainer()
                        .padding(.top, 16)
                }
                .padding()
            }
            .navigationBarHidden(true)
            .fileImporter(
                isPresented: $pickerShown,
                allowedContentTypes: [Self.sqliteType, .data],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    if let url = urls.first {
                        Task { await database.open(url: url, alreadyInSandbox: false) }
                    }
                case .failure(let err):
                    print("Picker error: \(err)")
                }
            }
        }
    }
}

private struct ErrorBanner: View {
    let message: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(message)
                .font(.callout)
        }
        .padding()
        .background(.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

private struct StepsExplainer: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("How to prepare the archive", systemImage: "info.circle")
                .font(.headline)
            step(num: 1, text: "Export your Signal data on Android (or use signalbackup-tools).")
            step(num: 2, text: "On your Mac, run preprocess/signal_to_sqlite.py to produce a .sqlite file.")
            step(num: 3, text: "Move the .sqlite into iCloud Drive or AirDrop it to this device.")
            step(num: 4, text: "Tap Import and pick the .sqlite file.")
        }
        .padding()
        .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private func step(num: Int, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(num)")
                .font(.caption.bold())
                .frame(width: 22, height: 22)
                .background(.tint, in: Circle())
                .foregroundStyle(.white)
            Text(text)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
