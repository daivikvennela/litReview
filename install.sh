#!/usr/bin/env bash
# Lit Review Agent v2 installer (Node + Express + React)
# Usage: bash install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "============================================================"
echo "  Lit Review Agent v2 - Installer"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required (20+ recommended)."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is required."
  exit 1
fi

echo "Using Node: $(node -v)"
echo "Using npm:  $(npm -v)"

if command -v java >/dev/null 2>&1; then
  JAVA_VER_LINE="$(java -version 2>&1 | head -1 || true)"
  echo "Using Java: $JAVA_VER_LINE"
  if java -version 2>&1 | grep -qE 'version "1\.(8|9)\.'; then
    echo "WARNING: Java 8/9 detected. OpenDataLoader (default PDF parser) needs JDK 11+."
    echo "         Install from https://adoptium.net/ and ensure \`java -version\` shows 11 or higher."
  fi
else
  echo "WARNING: Java not found. OpenDataLoader (default PDF parser) requires JDK 11+."
  echo "         Install from https://adoptium.net/ and re-open your terminal."
fi

echo ""
echo "-> Installing root dependencies..."
cd "$REPO_DIR"
npm install

echo "-> Installing app dependencies..."
npm --prefix app install

echo "-> Installing frontend dependencies..."
npm --prefix frontend install

if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo "-> Created .env from .env.example"
else
  echo "-> .env already exists"
fi

echo ""
read -r -p "Enter OPENROUTER_API_KEY now? [y/N]: " SET_KEY
if [[ "${SET_KEY:-}" =~ ^[Yy]$ ]]; then
  read -r -s -p "OPENROUTER_API_KEY: " OPENROUTER_KEY
  echo ""
  if [ -n "${OPENROUTER_KEY:-}" ]; then
    # Replace existing key line if present; otherwise append once.
    if grep -q "^OPENROUTER_API_KEY=" "$REPO_DIR/.env"; then
      sed -i.bak "s|^OPENROUTER_API_KEY=.*$|OPENROUTER_API_KEY=$OPENROUTER_KEY|" "$REPO_DIR/.env"
    else
      printf "\nOPENROUTER_API_KEY=%s\n" "$OPENROUTER_KEY" >> "$REPO_DIR/.env"
    fi
    rm -f "$REPO_DIR/.env.bak"
    echo "-> Saved OPENROUTER_API_KEY in .env"
  else
    echo "-> Empty key entered, skipping."
  fi
fi

read -r -p "Set GROBID_URL now? [y/N]: " SET_GROBID
if [[ "${SET_GROBID:-}" =~ ^[Yy]$ ]]; then
  read -r -p "GROBID_URL (e.g. http://localhost:8070): " GROBID_VALUE
  if [ -n "${GROBID_VALUE:-}" ]; then
    if grep -q "^GROBID_URL=" "$REPO_DIR/.env"; then
      sed -i.bak "s|^GROBID_URL=.*$|GROBID_URL=$GROBID_VALUE|" "$REPO_DIR/.env"
    else
      printf "\nGROBID_URL=%s\n" "$GROBID_VALUE" >> "$REPO_DIR/.env"
    fi
    rm -f "$REPO_DIR/.env.bak"
    echo "-> Saved GROBID_URL in .env"
  else
    echo "-> Empty URL entered, skipping."
  fi
fi

echo "-> Generating app icon..."
node scripts/generate-icon.mjs

echo "-> Building frontend into app/public..."
npm run build

echo ""
echo "============================================================"
echo "  Installation complete"
echo "============================================================"
echo "Next:"
echo "  1) If needed, edit .env for OPENROUTER_API_KEY / GROBID_URL"
echo "  2) Run app: npm start"
echo "  3) For dev mode: npm run dev"
echo ""
echo "OpenDataLoader (default PDF parser) optional hybrid (OCR / tables):"
echo "  pip install \"opendataloader-pdf[hybrid]\" && opendataloader-pdf-hybrid --port 5002"
echo ""
