# Linux Development with xtool

Build and deploy SignalArchive from a Linux machine using [xtool](https://github.com/saagarjha/xtool).

## Prerequisites

- Linux: Ubuntu 22.04/24.04 or Fedora (x86-64)
- A USB-connected iPhone for deployment
- An Apple Developer account (free tier works for personal device)
- Git LFS installed on your Linux machine: `sudo apt install git-lfs` / `sudo dnf install git-lfs`

## One-Time Setup

### 1. On your Mac — extract the iOS SDK

Run once (or after upgrading Xcode):

```bash
ios-app/linux-dev/extract-sdk.sh
git add ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz
git commit -m "chore: update iOS SDK tarball"
git push
```

### 2. On Linux — pull the SDK via LFS and run setup

```bash
git lfs install
git lfs pull
ios-app/linux-dev/setup-linux.sh
source ~/.profile
```

The script installs:
- Swift 6.1 to `/opt/swift`
- `xtool` binary to `~/.local/bin/xtool`
- iOS SDK to `~/.local/share/xtool/sdks/`

### 3. Authenticate with Apple

```bash
xtool auth login
```

You'll be prompted for your Apple ID and password. xtool handles device provisioning automatically on first `make install`.

## Daily Workflow

All commands run from `ios-app/linux-dev/`:

```bash
make build      # compile — shows Swift errors and warnings
make install    # sign and deploy to USB-connected iPhone
make clean      # wipe derived data (useful after dependency changes)
make resolve    # re-fetch GRDB.swift and other SPM packages
```

## Updating the SDK

When you upgrade Xcode on your Mac, regenerate the tarball:

```bash
ios-app/linux-dev/extract-sdk.sh
git add ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz
git commit -m "chore: update iOS SDK tarball to Xcode X.Y"
git push
```

On Linux:
```bash
git pull
git lfs pull
```

The xtool config (`~/.config/xtool/config`) already points to `~/.local/share/xtool/sdks/iPhoneOS*.sdk`; re-run `setup-linux.sh` if the SDK major version changes.

## Troubleshooting

**`xtool: command not found`**
Run `source ~/.profile` or open a new terminal. If still missing, check `~/.local/bin/xtool` exists.

**`Error: No SDK found`**
The setup script couldn't find the SDK. Re-run `setup-linux.sh` and confirm the tarball was pulled with `git lfs pull`.

**`Error: No devices found` on `make install`**
Check the device is unlocked, trusted on this computer, and connected via USB. Run `xtool devices` to list detected devices.

**Build errors about missing module `SwiftUI` or `GRDB`**
Run `make resolve` to re-fetch SPM packages, then `make build` again.

**Apple ID authentication fails**
Two-factor authentication prompts should appear in the terminal. If xtool hangs, try `xtool auth logout` then `xtool auth login` again.

## What Isn't Supported on Linux

- iOS Simulator (macOS-only)
- SwiftUI Previews (Xcode-only)
- Instruments / profiling
