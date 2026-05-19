# Signal Chat Archive Reader

A personal-use native iOS app for searching and browsing a Signal chat export.
SwiftUI + GRDB.swift + SQLite/FTS5, targeting iOS 17+.

The work is split into two pieces:

1. **`preprocess/signal_to_sqlite.py`** — a small Python script that runs on
   your Mac. It converts the Signal export `main.jsonl` into a single
   `signal_archive.sqlite` file containing all conversations, recipients, and
   messages plus an FTS5 full-text index over message bodies.
2. **`SignalArchive/` + `SignalArchive.xcodeproj`** — the iOS app. It opens a
   `.sqlite` you import via the Files app and lets you search, filter, and
   browse the archive. The app never connects to your live Signal account.

## End-to-end workflow

1. Export your Signal data (e.g. using `signalbackup-tools` on the decrypted
   Android backup). You should end up with a folder containing `main.jsonl`.
2. On your Mac, run the preprocessor:

   ```bash
   cd "Signal Chat Archive Reader — iOS App"
   python3 preprocess/signal_to_sqlite.py \
       /path/to/signal-export/main.jsonl \
       ~/Downloads/signal_archive.sqlite
   ```

   On a 344k-message archive this takes well under a minute on a modern Mac
   and produces a ~50 MB SQLite file.
3. Move `signal_archive.sqlite` somewhere the phone can reach it — drop it
   into iCloud Drive, AirDrop it to the device, or save it under "On My
   iPhone" in Files. The file extension must remain `.sqlite`.
4. Open the project in Xcode (`open SignalArchive.xcodeproj`). On first open,
   Xcode resolves the GRDB.swift Swift Package dependency automatically.
   Sign with your Apple Developer account, pick your iPhone, and Run.
5. In the app, tap **Import archive…** and select the `.sqlite` file. The
   app copies it into its sandbox, validates the schema, and you're searching
   in a couple of seconds.

## What's inside

```
preprocess/
    signal_to_sqlite.py        JSONL → SQLite + FTS5 converter
SignalArchive/
    SignalArchiveApp.swift     @main entry point
    Models/                    GRDB Records: Recipient, Conversation, Message
    Database/                  DatabaseManager (open/validate) + SearchService
    Views/                     SwiftUI screens
    Assets.xcassets            App icon placeholder, accent color
SignalArchive.xcodeproj/       Hand-written Xcode project
```

The schema (defined in `preprocess/signal_to_sqlite.py`) is the single source
of truth. The Swift `Schema.supportedVersion` constant must match the
`PRAGMA user_version` the preprocessor writes; if they diverge the app
refuses to open the database with a clear error.

## Performance

On a Signal export of 344,407 messages (~100 MB JSONL → ~53 MB SQLite):

* Preprocessor: ~9 seconds end-to-end on a 2024 MacBook-class machine.
* Top-20 ranked FTS5 search for any reasonable query: sub-millisecond.
* Even high-recall queries (`"and"`, 37k hits): ~76 ms for top-20 ranked.

The MVP's "<100 ms search latency" target is easily satisfied by FTS5 on the
device — no caching layer needed.

## Features (MVP)

* Full-text search with BM25 ranking, phrase queries, prefix queries
  (`pancake*`), and boolean operators (`AND` / `OR` / `NOT`).
* Filters: conversation, sender, date range.
* Result rows show a snippet with the matched terms highlighted; tap a row
  to jump to that point in the thread.
* Read-only thread view that loads context around an anchor message and
  pages bidirectionally as you scroll.
* Per-conversation and global stats: message counts, date ranges, top
  senders.
* Settings tab with archive metadata, file location, and "delete archive"
  to re-import a newer export.

## Re-importing a newer export

Run the preprocessor again, copy the new `.sqlite` to the phone, then in
the app go to **Settings → Delete archive**, return to the import screen,
and pick the new file. The schema version check guards against mismatched
DBs.

## Schema version

The schema version is `1`. Any breaking schema change (added/removed
columns, retypes, etc.) should bump both `SCHEMA_VERSION` in
`signal_to_sqlite.py` and `Schema.supportedVersion` in `Schema.swift`.

## Out of scope (for now)

* Sending messages or talking to the live Signal account.
* Attachment rendering beyond a paperclip indicator.
* iCloud sync of the archive.
* Multi-user / multi-account support.
# iOS-signal-viewer
# iOS-signal-viewer
