# Signal Archive Reader

A suite of applications for reading and searching Signal chat archives exported via [signal_to_sqlite](https://github.com/simonw/signal_to_sqlite).

## Projects

### [iOS App](./ios-app)
SwiftUI application for macOS/iOS. Browse conversations, search messages (full-text), and view threads with pagination. Supports sorting search results by date or relevance, and immersive reading mode (tap to toggle chrome).

**Technologies:** Swift, SwiftUI, GRDB, SQLite, Vite

**To build:** Open `ios-app/SignalArchive.xcodeproj` in Xcode

### [Web App](./signal-web)
Full-stack web and desktop application built with Node.js, Express, React, and Electron.

**Modes:**
- **Web server** — `pnpm start` on port 8080
- **Desktop app** — `pnpm electron:dev` (dev) or `pnpm build:desktop` (production)

**Technologies:** Node.js, Express, React, Tailwind CSS, Vite, better-sqlite3, Electron

Both apps read from the same SQLite archive database (`preprocess/out.sqlite`).

## Database

Export your Signal chats using [signal_to_sqlite](https://github.com/simonw/signal_to_sqlite):

```bash
signal-export [OPTIONS] /path/to/signal/backup.bin
signal_to_sqlite [OPTIONS] /path/to/exported.jsonl output.sqlite
```

The resulting `output.sqlite` contains:
- `messages` table with full-text search index (`messages_fts`)
- `conversations` table with metadata
- `recipients` table with contact info
- `schema_info` table with export metadata

## Features

Both applications support:
- **Full-text search** across all messages (FTS5 with BM25 ranking)
- **Filtering** by conversation, sender, date range
- **Sorting** results by:
  - Newest first (default)
  - Oldest first  
  - Relevance (BM25 score)
- **Pagination** for large conversations (load older/newer messages on demand)
- **Quote display** and message metadata

The iOS app additionally features:
- **Immersive reading mode** — tap to toggle navigation UI
- **Pinned conversations** and conversation filtering
- **Daily message separators** and visual styling

## License

MIT
