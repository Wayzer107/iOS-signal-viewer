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
