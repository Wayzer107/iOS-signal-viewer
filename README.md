# Signal Archive Reader

A suite of tools for reading and searching Signal chat archives. Start with the [preprocessor](#database) to convert your Signal export into a `.sqlite` database, then pick whichever viewer suits your setup.

## Projects

### [preprocess/](./preprocess) — Export preprocessor

Converts a Signal export (`main.jsonl`) into a `signal_archive.sqlite` file consumed by all viewers.

```bash
python3 preprocess/signal_to_sqlite.py /path/to/main.jsonl output.sqlite
```

No third-party dependencies. Python 3.10+.

---

### [ios-app/](./ios-app) — Native iOS / macOS app

SwiftUI application targeting iOS 17+. Full-text search, conversation browsing, thread view with bidirectional paging, and immersive reading mode (tap to toggle chrome).

**Technologies:** Swift, SwiftUI, GRDB.swift, SQLite FTS5

**To build:** `open ios-app/SignalArchive.xcodeproj` in Xcode, sign with your Apple Developer account, and run on device or simulator.

---

### [signal-web/](./signal-web) — Web & Electron desktop app

Node.js + Express backend with a React + Vite frontend. Run as a local web server or build an Electron desktop app. Virtualised message list renders large conversations smoothly.

**Technologies:** Node.js, Express, React, Tailwind CSS, Vite, better-sqlite3, Electron, @tanstack/react-virtual

**Modes:**
- **Web server** — `pnpm build && node src/server/index.js --db /path/to/archive.sqlite`
- **Development** — `pnpm dev` (Vite on :5173 + API on :3001)
- **Desktop app** — `pnpm build:desktop` → produces a `.dmg` / `.exe` / `.AppImage`

---

### [signal-wasm/](./signal-wasm) — Browser-only static app

Fully static web app — no server required. Drops a `.sqlite` file, reads it entirely in the browser using [sql.js](https://sql-js.github.io/sql.js/) (SQLite compiled to WebAssembly). The file never leaves your machine.

**Technologies:** React, Vite, sql.js (SQLite WASM), Web Worker, Tailwind CSS

**Run locally:**
```bash
cd signal-wasm
pnpm install
pnpm dev      # copies sql-wasm.{js,wasm} to public/ then starts Vite on :5173
```

**Static hosting:** `pnpm build` → deploy `dist/` to Netlify, Cloudflare Pages, etc. Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers (the included `public/_headers` sets them automatically for Netlify/Cloudflare).

---

### [signal-tauri/](./signal-tauri) — Tauri native desktop app

Native desktop app built with Tauri v2 and Rust. SQLite queries run directly in Rust — no HTTP layer, no Electron overhead. Uses the system WebView; bundle size is ~5–15 MB vs ~200 MB for Electron.

**Technologies:** Tauri v2, Rust, rusqlite (bundled SQLite + FTS5), React, Vite, Tailwind CSS

**Development:**
```bash
cd signal-tauri
pnpm install
cargo tauri dev   # first run compiles rusqlite (~2 min); subsequent builds are fast
```

**Distribution:** `cargo tauri build` → `.dmg`/`.app` (macOS), NSIS installer + `.msi` (Windows), `.deb`/`.rpm`/`.AppImage` (Linux).

---

## Database

All viewers read from a `.sqlite` file produced by the preprocessor. Export your Signal data first (e.g. using [signalbackup-tools](https://github.com/bepaald/signalbackup-tools) on an Android backup), then run:

```bash
python3 preprocess/signal_to_sqlite.py /path/to/signal-export/main.jsonl output.sqlite
```

The resulting file contains:

| Table | Contents |
|---|---|
| `messages` | All messages with direction, kind, body, quote fields |
| `messages_fts` | FTS5 full-text index over `messages.body` |
| `conversations` | Conversation metadata (title, group flag, message count, date range) |
| `recipients` | Contact info (display name, phone, ACI) |
| `schema_info` | Export metadata and schema version |

## Feature comparison

| Feature | ios-app | signal-web | signal-wasm | signal-tauri |
|---|:---:|:---:|:---:|:---:|
| Full-text search (FTS5 / BM25) | ✓ | ✓ | ✓ | ✓ |
| Filter by conversation / sender / date | ✓ | ✓ | ✓ | ✓ |
| Sort by relevance / date | ✓ | ✓ | ✓ | ✓ |
| Virtual scroll (large threads) | ✓ | ✓ | ✓ | ✓ |
| Quote display | ✓ | ✓ | ✓ | ✓ |
| No server required | ✓ | | ✓ | ✓ |
| No install required | | | ✓ | |
| Immersive reading mode | ✓ | | | |
| Pinned conversations | ✓ | | | |

## License

MIT
