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
