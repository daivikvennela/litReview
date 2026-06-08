#!/usr/bin/env bash
# Verify macOS app bundle and DMG are signed + notarization stapled (CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

shopt -s nullglob
dmgs=(dist-installers/*-mac-*.dmg)
if ((${#dmgs[@]} == 0)); then
  echo "verify-mac-signing: no mac DMG in dist-installers/"
  exit 1
fi

DMG="${dmgs[0]}"
MOUNT="/tmp/litreview-sign-verify"
mkdir -p "$MOUNT"
hdiutil attach "$DMG" -nobrowse -mountpoint "$MOUNT" -quiet
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true' EXIT

APP="$MOUNT/Lit Review Agent.app"
if [[ ! -d "$APP" ]]; then
  echo "verify-mac-signing: Lit Review Agent.app not found in DMG"
  exit 1
fi

echo "verify-mac-signing: codesign $APP"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "verify-mac-signing: stapler validate $DMG"
xcrun stapler validate "$DMG"

echo "verify-mac-signing: OK"
