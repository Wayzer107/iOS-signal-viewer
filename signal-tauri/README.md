# Signal Archive — Tauri Desktop App

A native desktop viewer for Signal chat archives built with [Tauri v2](https://tauri.app) and Rust. SQLite queries run directly in Rust with no HTTP layer — same architecture as the iOS app, closest possible performance to native.

## Why Tauri?

| | signal-web | signal-tauri |
|---|---|---|
| SQLite access | Node.js via HTTP | Rust native — zero serialization overhead |
| RAM | Node.js + Chromium | Only the WebView (no Electron bundled Node) |
| Bundle size | ~200 MB (Electron) | ~5–15 MB (uses system WebView) |
| Startup | Fast | Fast |
| FTS5 search | ✓ | ✓ (rusqlite bundled) |

## Prerequisites

### 1. Rust toolchain

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
```

### 2. Tauri system dependencies

**macOS** — Xcode Command Line Tools (usually already installed):
```sh
xcode-select --install
```

**Linux (Debian/Ubuntu)**:
```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows** — WebView2 is bundled with Windows 11 / Edge. No extra install needed.

### 3. Node.js (v20+) and pnpm

```sh
npm install -g pnpm
```

### 4. Tauri CLI

```sh
cargo install tauri-cli --version "^2"
# or via pnpm:
pnpm add -D @tauri-apps/cli
```

## Development

```sh
pnpm install          # install JS dependencies
cargo tauri dev       # build Rust backend + start Vite + open the app window
```

On first run, Cargo will compile rusqlite with the bundled SQLite (including FTS5). This takes ~2 minutes. Subsequent builds are fast.

## Build for distribution

```sh
cargo tauri build
```

Output in `src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| macOS | `.dmg` + `.app` in `macos/` |
| Windows | `setup.exe` (NSIS) + `.msi` in `nsis/` / `msi/` |
| Linux | `.deb`, `.rpm`, `.AppImage` in respective directories |

### Code signing

- **macOS**: set `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` and add `"signingIdentity"` to `tauri.conf.json`'s `bundle.macOS`.
- **Windows**: set `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD` for update signatures; use a `.pfx` certificate for installer signing.

## Architecture

```
src/                     React + Vite frontend
  api.js                 invoke() wrappers — replaces HTTP fetch
  App.jsx                file picker (system dialog) → archive UI
  components/            MessageRow, SearchView, ThreadView (virtual scroll)

src-tauri/
  src/
    main.rs              Tauri commands + DbState (Mutex<Option<ArchiveDb>>)
    db.rs                All SQLite logic in Rust (same queries as signal-web/db.js)
  Cargo.toml             rusqlite = "bundled" → includes FTS5
  tauri.conf.json        Window config + build settings
  capabilities/          IPC permissions (dialog:allow-open)
```

### Data flow

```
User picks file → open_db(path) → Rust opens SQLite
get_conversations() → Rust query → JSON → invoke() → React state
search(q) → Rust FTS5 query → JSON → React list (virtual scroll)
```

All data stays local. No network requests after the app loads.
