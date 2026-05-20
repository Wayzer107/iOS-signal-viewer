# Signal Archive — Browser WASM

A fully static web app that opens a Signal archive `.sqlite` file **entirely in the browser** using [sql.js](https://sql-js.github.io/sql.js/) (SQLite compiled to WebAssembly via Emscripten). No server, no uploads — the file never leaves your machine.

## How it works

1. User drops or selects a `.sqlite` archive file.
2. The file is read as an `ArrayBuffer` and passed to a Web Worker.
3. The worker opens it with sql.js (`new SQL.Database(buffer)`) — SQLite running as WASM in the browser.
4. All queries (conversations, messages, FTS5 search) run locally in the worker.
5. Results are sent back to the React UI via `postMessage`.

## Prerequisites

- Node.js v20+
- pnpm (or npm)

## Quick start

```sh
pnpm install       # installs dependencies including sql.js
pnpm dev           # copies sql-wasm.{js,wasm} to public/ then starts Vite on :5173
```

Open http://localhost:5173, drop in your `.sqlite` archive file.

## Build for static hosting

```sh
pnpm build         # outputs to dist/
```

The `dist/` folder is a standalone static site. Host it anywhere — GitHub Pages, Netlify, Cloudflare Pages, `npx serve dist`, etc.

### Required HTTP headers

The dev server and `pnpm preview` set these automatically. For production hosting, you must configure:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These enable `SharedArrayBuffer`, which lets sql.js use its faster synchronous WASM path.

- **Netlify / Cloudflare Pages**: the `public/_headers` file in this repo sets them automatically.
- **GitHub Pages**: does not support custom response headers — use Cloudflare as a proxy instead.
- **nginx**: add the headers in your `location` block.
- **Apache**: add to `.htaccess` with `Header set`.

### Without the COOP/COEP headers

The app still works — sql.js falls back to a slightly slower (non-SharedArrayBuffer) WASM path. Remove the headers from `vite.config.js` if you're hosting on a service that rejects them.

## Limitations

- The entire archive is loaded into memory. A 500 MB archive needs ~500 MB of browser RAM.
- On page refresh the user must re-select the file (no server-side persistence).
- Works in all modern browsers (Chrome, Firefox, Safari 15.2+, Edge).

## Performance vs signal-web

| | signal-web | signal-wasm |
|---|---|---|
| Architecture | HTTP + Node.js server + SQLite | SQLite WASM in browser |
| Latency | Network round-trip per query | No network — all local |
| RAM | Server-side only | Entire DB in browser RAM |
| Hosting | Requires Node.js server | Pure static (CDN/GitHub Pages) |
| Cold start | Instant (server stays running) | ~1–3 s to load archive into WASM heap |

For large archives (>200 MB), signal-tauri (Rust backend) will have the best performance.
