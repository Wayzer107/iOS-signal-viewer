# Signal Archive — Web & Desktop

A web-based and Electron desktop viewer for Signal chat archives exported by the `preprocess` tool.

## Prerequisites

- [Node.js](https://nodejs.org) v20 or later
- [pnpm](https://pnpm.io) v8 or later (`npm install -g pnpm`)

```sh
pnpm install          # install dependencies
pnpm rebuild          # compile native modules for your Node version
```

---

## Web server (port 8080)

Serves the React frontend and JSON API on a single port. Requires a preprocessed `.sqlite` archive.

### Run once

```sh
pnpm build                                    # build the frontend into dist/
node src/server/index.js --port 8080 --db /path/to/archive.sqlite
```

Open http://localhost:8080 in any browser.

The port and database path can also be set via environment variables:

```sh
PORT=8080 DB_PATH=/path/to/archive.sqlite node src/server/index.js
```

### Development (hot reload)

```sh
pnpm dev    # Vite on :5173 + API server on :3001 with live reload
```

---

## Run as a background service

### macOS — launchd

Create `~/Library/LaunchAgents/com.signalarchive.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.signalarchive</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/signal-web/src/server/index.js</string>
    <string>--port</string>   <string>8080</string>
    <string>--db</string>     <string>/path/to/archive.sqlite</string>
  </array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>/tmp/signalarchive.log</string>
  <key>StandardErrorPath</key> <string>/tmp/signalarchive.err</string>
</dict>
</plist>
```

```sh
launchctl load   ~/Library/LaunchAgents/com.signalarchive.plist   # start + enable on login
launchctl unload ~/Library/LaunchAgents/com.signalarchive.plist   # stop + disable
```

### Linux — systemd (user service)

Create `~/.config/systemd/user/signalarchive.service`:

```ini
[Unit]
Description=Signal Archive viewer

[Service]
ExecStart=/usr/bin/node /path/to/signal-web/src/server/index.js \
          --port 8080 --db /path/to/archive.sqlite
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now signalarchive   # start + enable on login
systemctl --user stop signalarchive           # stop
journalctl --user -u signalarchive -f         # tail logs
```

### Cross-platform — PM2

[PM2](https://pm2.keymetrics.io) works on macOS, Linux, and Windows.

```sh
npm install -g pm2

pm2 start src/server/index.js \
  --name signalarchive \
  -- --port 8080 --db /path/to/archive.sqlite

pm2 save              # persist across reboots
pm2 startup           # print the command to enable auto-start (run it as instructed)
pm2 stop signalarchive
pm2 logs signalarchive
```

### Windows — Task Scheduler

```powershell
schtasks /create /tn "SignalArchive" /sc ONLOGON /delay 0000:30 /tr `
  "node C:\path\to\signal-web\src\server\index.js --port 8080 --db C:\path\to\archive.sqlite" `
  /f
```

Or use [NSSM](https://nssm.cc) for a proper Windows service with restart-on-crash.

---

## Desktop app

The Electron build bundles the server and frontend into a self-contained app. On first launch it shows a file picker; subsequent launches remember the last archive.

### macOS

Build on macOS — produces a `.dmg` installer and a `.zip` archive in `dist-electron/`.

```sh
pnpm build:desktop
```

- **Distribute**: share `Signal Archive-x.x.x.dmg` — users double-click to mount and drag to Applications.
- **Notarisation**: unsigned builds will trigger Gatekeeper on other Macs. To distribute publicly, set up an Apple Developer account and add the following to `package.json` under `build.mac`:

  ```json
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
  ```

  Then run `electron-builder --mac --publish always` with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` set in your environment.

### Windows

Run on a Windows machine (cross-compilation from macOS is unreliable for native modules like `better-sqlite3`).

```sh
pnpm build:desktop
```

Produces `Signal Archive Setup x.x.x.exe` (NSIS installer) in `dist-electron/`. Users run the installer; the app appears in Programs.

For code-signing, set `WIN_CSC_LINK` (path to `.pfx`) and `WIN_CSC_KEY_PASSWORD` before building.

### Linux

Build on Linux — produces an `.AppImage` in `dist-electron/`.

```sh
pnpm build:desktop
```

```sh
chmod +x "Signal Archive-x.x.x.AppImage"
./"Signal Archive-x.x.x.AppImage"
```

AppImages are self-contained and run on any modern x86-64 Linux distro without installation. For `.deb`/`.rpm` targets, change the `linux.target` array in `package.json`:

```json
"linux": { "target": ["AppImage", "deb", "rpm"] }
```

---

## Build outputs summary

| Platform | Command | Output in `dist-electron/` |
|---|---|---|
| macOS | `pnpm build:desktop` (on macOS) | `.dmg`, `.zip` |
| Windows | `pnpm build:desktop` (on Windows) | `Setup .exe` (NSIS) |
| Linux | `pnpm build:desktop` (on Linux) | `.AppImage` |
| Web | `pnpm build` + `node src/server/index.js` | served from `dist/` |
