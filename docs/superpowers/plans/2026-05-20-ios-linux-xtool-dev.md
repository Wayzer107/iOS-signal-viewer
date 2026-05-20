# iOS Linux xtool Dev Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `linux-dev/` folder to `ios-app/` that lets a Linux developer edit Swift, build, and deploy the SignalArchive app using xtool — without needing macOS.

**Architecture:** A Mac-side extraction script packages the iOS SDK from the local Xcode install into a tarball tracked by Git LFS. A Linux-side setup script installs Swift 6.1, builds xtool from source, unpacks the SDK, and writes xtool config. A Makefile provides `build / install / clean / resolve` targets for the daily workflow.

**Tech Stack:** xtool (saagarjha/xtool), Swift 6.1 (swift.org Linux toolchain), Git LFS, Bash, Make

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `ios-app/linux-dev/extract-sdk.sh` | Mac-side: package iOS SDK from Xcode into tarball |
| Create | `ios-app/linux-dev/setup-linux.sh` | Linux-side: install Swift, build xtool, unpack SDK, write config |
| Create | `ios-app/linux-dev/Makefile` | Daily build workflow wrapping xtool |
| Create | `ios-app/linux-dev/LINUX_DEV.md` | Setup guide and daily workflow docs |
| Generate | `ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz` | iOS SDK tarball (committed via Git LFS, not hand-written) |
| Modify | `ios-app/.gitignore` | Add safety exclusion for non-LFS tarballs |
| Modify | `.gitattributes` (repo root) | LFS tracking rule for the SDK tarball |

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout -b feature/linux-xtool-dev
```

Expected: `Switched to a new branch 'feature/linux-xtool-dev'`

---

## Task 2: Install git-lfs and configure LFS tracking

**Files:**
- Modify: `.gitattributes` (created by `git lfs track`)

- [ ] **Step 1: Install git-lfs via Homebrew (Mac)**

```bash
brew install git-lfs
```

Expected: git-lfs installed and available as `git lfs`.

- [ ] **Step 2: Initialise LFS for this repository**

```bash
git lfs install
```

Expected: `Updated Git hooks. Git LFS initialized.`

- [ ] **Step 3: Track the SDK tarball path via LFS**

```bash
git lfs track "ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz"
```

Expected: `Tracking "ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz"`

This creates or updates `.gitattributes` at the repo root with:
```
ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz filter=lfs diff=lfs merge=lfs -text
```

- [ ] **Step 4: Commit the .gitattributes change**

```bash
git add .gitattributes
git commit -m "chore: configure git-lfs tracking for iOS SDK tarball"
```

---

## Task 3: Write `extract-sdk.sh` (Mac-side)

**Files:**
- Create: `ios-app/linux-dev/extract-sdk.sh`

- [ ] **Step 1: Create the script**

```bash
mkdir -p ios-app/linux-dev
```

Create `ios-app/linux-dev/extract-sdk.sh` with this exact content:

```bash
#!/usr/bin/env bash
# Packages the iOS SDK from the active Xcode install into a tarball for Linux xtool use.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$SCRIPT_DIR/SignalArchive-ios-sdk.tar.gz"

DEVELOPER_DIR="$(xcode-select -p)"
SDK_SEARCH="$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs"

if [[ ! -d "$SDK_SEARCH" ]]; then
    echo "Error: iOS SDK directory not found at $SDK_SEARCH" >&2
    echo "Make sure Xcode is installed and xcode-select points to it." >&2
    exit 1
fi

SDK_DIR=$(find "$SDK_SEARCH" -maxdepth 1 -name "iPhoneOS*.sdk" -type d | sort -V | tail -1)

if [[ -z "$SDK_DIR" ]]; then
    echo "Error: No iPhoneOS*.sdk found in $SDK_SEARCH" >&2
    exit 1
fi

SDK_VERSION=$(basename "$SDK_DIR" | sed 's/iPhoneOS\(.*\)\.sdk/\1/')
SDK_MAJOR=$(echo "$SDK_VERSION" | cut -d. -f1)
if [[ "$SDK_MAJOR" -lt 17 ]]; then
    echo "Error: iOS SDK version $SDK_VERSION is below the required minimum 17.0" >&2
    exit 1
fi

SDK_PARENT="$(dirname "$SDK_DIR")"
SDK_NAME="$(basename "$SDK_DIR")"

echo "Packaging iOS $SDK_VERSION SDK..."
echo "  Source: $SDK_DIR"
echo "  Output: $OUTPUT"

tar -czf "$OUTPUT" -C "$SDK_PARENT" "$SDK_NAME"

XCODE_VERSION=$(/usr/bin/xcodebuild -version | head -1)
SIZE=$(du -sh "$OUTPUT" | cut -f1)

echo ""
echo "Done."
echo "  Xcode:  $XCODE_VERSION"
echo "  SDK:    $SDK_DIR"
echo "  Size:   $SIZE"
echo ""
echo "Next steps:"
echo "  git add ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz"
echo "  git commit -m 'feat: add iOS SDK tarball for Linux xtool dev'"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x ios-app/linux-dev/extract-sdk.sh
```

- [ ] **Step 3: Commit the script**

```bash
git add ios-app/linux-dev/extract-sdk.sh
git commit -m "feat: add Mac-side iOS SDK extraction script"
```

---

## Task 4: Run `extract-sdk.sh` and commit the SDK tarball

**Files:**
- Generate: `ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz`

- [ ] **Step 1: Run the extraction script**

```bash
ios-app/linux-dev/extract-sdk.sh
```

Expected output (exact versions will differ):
```
Packaging iOS 26.2 SDK...
  Source: /Applications/Xcode.app/.../iPhoneOS26.2.sdk
  Output: .../ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz

Done.
  Xcode:  Xcode 26.3
  SDK:    /Applications/Xcode.app/.../iPhoneOS26.2.sdk
  Size:   ~500M
```

- [ ] **Step 2: Verify git sees the tarball as an LFS pointer (not raw binary)**

```bash
git lfs status
```

Expected: `ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz` listed as a new LFS file.

If it shows as a regular file rather than LFS, the `.gitattributes` tracking rule didn't apply. Fix by running `git rm --cached ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz` then re-staging.

- [ ] **Step 3: Commit the tarball via LFS**

```bash
git add ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz
git commit -m "feat: add iOS 26.2 SDK tarball for Linux xtool dev (git-lfs)"
```

---

## Task 5: Write `setup-linux.sh` (Linux-side)

**Files:**
- Create: `ios-app/linux-dev/setup-linux.sh`

- [ ] **Step 1: Create the script**

Create `ios-app/linux-dev/setup-linux.sh` with this exact content:

```bash
#!/usr/bin/env bash
# One-time Linux setup: installs Swift 6.1, builds xtool, unpacks iOS SDK.
set -euo pipefail

SWIFT_VERSION="6.1"
XTOOL_REPO="https://github.com/saagarjha/xtool"
XTOOL_BIN="$HOME/.local/bin"
SDK_DEST="$HOME/.local/share/xtool/sdks"
XTOOL_CONFIG_DIR="$HOME/.config/xtool"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_TARBALL="$SCRIPT_DIR/SignalArchive-ios-sdk.tar.gz"

# ── Detect distro ────────────────────────────────────────────────────────────
if [[ ! -f /etc/os-release ]]; then
    echo "Error: Cannot detect Linux distribution (/etc/os-release not found)" >&2
    exit 1
fi
. /etc/os-release
DISTRO="${ID:-unknown}"
VERSION="${VERSION_ID:-unknown}"

echo "Detected: $DISTRO $VERSION"

# ── Install Swift ─────────────────────────────────────────────────────────────
install_swift_ubuntu() {
    local ver="$1"
    case "$ver" in
        22.04) local tag="ubuntu2204" ;;
        24.04) local tag="ubuntu2404" ;;
        *)
            echo "Error: Unsupported Ubuntu version: $ver (supported: 22.04, 24.04)" >&2
            exit 1
            ;;
    esac

    local release="swift-${SWIFT_VERSION}-RELEASE"
    local tarball="/tmp/${release}-${tag}.tar.gz"
    local url="https://download.swift.org/swift-${SWIFT_VERSION}-release/${tag}/${release}/${release}-${tag}.tar.gz"

    echo "Downloading Swift $SWIFT_VERSION for Ubuntu $ver..."
    curl -fL "$url" -o "$tarball"

    echo "Installing Swift to /opt/swift..."
    sudo mkdir -p /opt/swift
    sudo tar -xzf "$tarball" -C /opt/swift --strip-components=1
    rm "$tarball"

    local profile_line='export PATH="/opt/swift/usr/bin:$PATH"'
    grep -qF "$profile_line" "$HOME/.profile" 2>/dev/null || echo "$profile_line" >> "$HOME/.profile"
    export PATH="/opt/swift/usr/bin:$PATH"
}

install_swift_fedora() {
    # Use the Fedora 39 build — closest available for recent Fedora versions
    local release="swift-${SWIFT_VERSION}-RELEASE"
    local tarball="/tmp/${release}-fedora39.tar.gz"
    local url="https://download.swift.org/swift-${SWIFT_VERSION}-release/fedora39/${release}/${release}-fedora39.tar.gz"

    echo "Downloading Swift $SWIFT_VERSION for Fedora..."
    curl -fL "$url" -o "$tarball"

    echo "Installing Swift to /opt/swift..."
    sudo mkdir -p /opt/swift
    sudo tar -xzf "$tarball" -C /opt/swift --strip-components=1
    rm "$tarball"

    local profile_line='export PATH="/opt/swift/usr/bin:$PATH"'
    grep -qF "$profile_line" "$HOME/.profile" 2>/dev/null || echo "$profile_line" >> "$HOME/.profile"
    export PATH="/opt/swift/usr/bin:$PATH"
}

case "$DISTRO" in
    ubuntu) install_swift_ubuntu "$VERSION" ;;
    fedora) install_swift_fedora ;;
    *)
        echo "Error: Unsupported distro '$DISTRO'. Supported: ubuntu (22.04/24.04), fedora." >&2
        exit 1
        ;;
esac

echo "Swift version: $(swift --version 2>&1 | head -1)"

# ── Build xtool ───────────────────────────────────────────────────────────────
echo ""
echo "Building xtool from source (this takes a few minutes)..."
XTOOL_SRC="$(mktemp -d)/xtool"
git clone --depth=1 "$XTOOL_REPO" "$XTOOL_SRC"
(cd "$XTOOL_SRC" && swift build -c release 2>&1)

mkdir -p "$XTOOL_BIN"
cp "$XTOOL_SRC/.build/release/xtool" "$XTOOL_BIN/xtool"
rm -rf "$(dirname "$XTOOL_SRC")"

local_bin_line='export PATH="$HOME/.local/bin:$PATH"'
grep -qF "$local_bin_line" "$HOME/.profile" 2>/dev/null || echo "$local_bin_line" >> "$HOME/.profile"
export PATH="$HOME/.local/bin:$PATH"

echo "xtool installed to $XTOOL_BIN/xtool"

# ── Unpack iOS SDK ────────────────────────────────────────────────────────────
echo ""
if [[ ! -f "$SDK_TARBALL" ]]; then
    echo "Error: SDK tarball not found at $SDK_TARBALL" >&2
    echo "On your Mac: run ios-app/linux-dev/extract-sdk.sh, commit via LFS, then git lfs pull here." >&2
    exit 1
fi

echo "Unpacking iOS SDK to $SDK_DEST..."
mkdir -p "$SDK_DEST"
tar -xzf "$SDK_TARBALL" -C "$SDK_DEST"

SDK_DIR=$(find "$SDK_DEST" -maxdepth 1 -name "iPhoneOS*.sdk" -type d | head -1)
if [[ -z "$SDK_DIR" ]]; then
    echo "Error: No iPhoneOS*.sdk found after unpacking tarball" >&2
    exit 1
fi
echo "SDK unpacked: $SDK_DIR"

# ── Write xtool config ────────────────────────────────────────────────────────
mkdir -p "$XTOOL_CONFIG_DIR"
cat > "$XTOOL_CONFIG_DIR/config" <<EOF
sdk = $SDK_DIR
EOF
echo "xtool config written to $XTOOL_CONFIG_DIR/config"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo " Setup complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo " Run this to apply PATH changes in your current shell:"
echo "   source ~/.profile"
echo ""
echo " Then authenticate with your Apple ID for code signing:"
echo "   xtool auth login"
echo ""
echo " Daily workflow (from ios-app/linux-dev/):"
echo "   make build    – compile the app"
echo "   make install  – deploy to USB-connected device"
echo "═══════════════════════════════════════════════════"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x ios-app/linux-dev/setup-linux.sh
```

- [ ] **Step 3: Commit the script**

```bash
git add ios-app/linux-dev/setup-linux.sh
git commit -m "feat: add Linux-side xtool setup script"
```

---

## Task 6: Write `Makefile`

**Files:**
- Create: `ios-app/linux-dev/Makefile`

- [ ] **Step 1: Create the Makefile**

Create `ios-app/linux-dev/Makefile` with this exact content:

```makefile
PROJECT := ../SignalArchive.xcodeproj
SCHEME  := SignalArchive

.PHONY: build install clean resolve

build:
	xtool build --project $(PROJECT) --scheme $(SCHEME)

install:
	xtool install --project $(PROJECT) --scheme $(SCHEME)

clean:
	xtool clean --project $(PROJECT) --scheme $(SCHEME)

resolve:
	xtool resolve --project $(PROJECT) --scheme $(SCHEME)
```

> **Note:** The indentation in a Makefile must be a real tab character, not spaces. Verify your editor doesn't convert them.

- [ ] **Step 2: Commit the Makefile**

```bash
git add ios-app/linux-dev/Makefile
git commit -m "feat: add Makefile for Linux xtool build workflow"
```

---

## Task 7: Update `ios-app/.gitignore`

**Files:**
- Modify: `ios-app/.gitignore`

- [ ] **Step 1: Add the safety exclusion**

Append to `ios-app/.gitignore`:

```
# Linux dev — SDK tarballs are managed via Git LFS; exclude any local extras
linux-dev/*.tar.gz
```

- [ ] **Step 2: Commit**

```bash
git add ios-app/.gitignore
git commit -m "chore: gitignore linux-dev tarballs outside LFS"
```

---

## Task 8: Write `LINUX_DEV.md`

**Files:**
- Create: `ios-app/linux-dev/LINUX_DEV.md`

- [ ] **Step 1: Create the documentation**

Create `ios-app/linux-dev/LINUX_DEV.md` with this exact content:

```markdown
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
```

- [ ] **Step 2: Commit the documentation**

```bash
git add ios-app/linux-dev/LINUX_DEV.md
git commit -m "docs: add Linux development guide for xtool workflow"
```

---

## Task 9: Final verification and PR

- [ ] **Step 1: Confirm all files are present**

```bash
ls -lh ios-app/linux-dev/
```

Expected:
```
-rw-r--r--  LINUX_DEV.md
-rw-r--r--  Makefile
-rwxr-xr-x  extract-sdk.sh
-rw-r--r--  SignalArchive-ios-sdk.tar.gz   (LFS pointer, not raw binary)
-rwxr-xr-x  setup-linux.sh
```

- [ ] **Step 2: Confirm the tarball is an LFS pointer (not raw binary)**

```bash
git lfs ls-files
```

Expected: `ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz` listed.

```bash
cat ios-app/linux-dev/SignalArchive-ios-sdk.tar.gz
```

Expected output (LFS pointer, not binary):
```
version https://git-lfs.github.com/spec/v1
oid sha256:<hash>
size <bytes>
```

- [ ] **Step 3: Confirm git log looks clean**

```bash
git log --oneline feature/linux-xtool-dev ^main
```

Expected: 6–7 commits covering each task above, no accidental large binary commits.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/linux-xtool-dev
```
