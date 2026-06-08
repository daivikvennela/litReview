#!/usr/bin/env bash
# Build signed+notarized DMG when Apple secrets exist; otherwise unsigned (free).
set -euo pipefail

ARCH="${1:?usage: build-mac-release.sh arm64|x64}"

if [[ -n "${CSC_LINK:-}" && -n "${CSC_KEY_PASSWORD:-}" && -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  echo "Apple signing secrets found — building signed + notarized DMG (${ARCH})"
  unset CSC_IDENTITY_AUTO_DISCOVERY
  if [[ "$ARCH" == "arm64" ]]; then
    npm run dist:mac-arm64:signed
  else
    npm run dist:mac-x64:signed
  fi
  bash scripts/verify-mac-signing.sh
else
  echo "No Apple signing secrets — building unsigned DMG (${ARCH})"
  echo "macOS users: see README 'damaged and can't be opened' (xattr -cr workaround)"
  # GHA sets CSC_* to empty strings when secrets are absent; electron-builder then
  # still attempts signing unless auto-discovery is disabled (see v2.0.3 CI).
  unset CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  if [[ "$ARCH" == "arm64" ]]; then
    npm run dist:mac-arm64
  else
    npm run dist:mac-x64
  fi
fi
