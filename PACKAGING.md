# Packaging Lit Review Agent for end users

Desktop installers are built with **Electron** + **electron-builder**. The packaged app embeds the Node/Express backend and the built React UI—users do not need Node, npm, or git.

## Outputs

| Platform | Artifact | Location after build |
|----------|----------|----------------------|
| macOS | `.dmg` (universal arm64 + x64) | `dist-installers/` |
| Windows | NSIS `.exe` (x64 + arm64) | `dist-installers/` |

## Build locally

Prerequisites: **Node.js 20+**, npm, and platform tools for native modules.

```bash
# One-time setup
npm install
npm --prefix app install
npm --prefix frontend install

# Build installers (run on the target OS, or use CI)
npm run dist:mac    # macOS only
npm run dist:win    # Windows only
npm run dist:all    # both (requires macOS + Windows hosts, or CI)
```

`npm run build:electron` (called by `dist:*`) will:

1. Build the frontend into `app/public`
2. Generate `build/icon.png`
3. Bundle Electron main/preload (`dist-electron/`)
4. Rebuild `better-sqlite3` for Electron (`npm run rebuild:app-native`)
5. Run `electron-builder` using [electron/builder.yml](electron/builder.yml)

The packaged app runs `app/server.ts` via **tsx** (included in `app` dependencies)—no system Node required.

## Dev with Electron (no installer)

```bash
npm run dev:electron
```

Spawns the Express server and opens an Electron window at `http://127.0.0.1:<port>`.

## User data & configuration

- SQLite database: `~/.litreview/data.db` (unchanged)
- API keys / settings: `%APPDATA%/Lit Review Agent/.env` (Windows) or `~/Library/Application Support/Lit Review Agent/.env` (macOS), created from `.env.example` on first launch

## Java (OpenDataLoader)

The installer does **not** bundle a JRE. On first launch, if `java` is not on `PATH`, a native dialog offers a link to [Adoptium](https://adoptium.net/). Users can dismiss it and still use GROBID or hybrid parsing.

## GROBID

GROBID is not embedded. Users run it via Docker or point **Settings → GROBID URL** at a hosted instance.

## OCR sidecars (Dots OCR + Chandra OCR 2)

These parsers are **not** bundled in the installer. Users with a GPU run local sidecar services and point **Settings → OCR sidecars** at their URLs (defaults: Dots `http://127.0.0.1:8001`, Chandra `http://127.0.0.1:8002`).

Setup steps live in [scripts/ocr-sidecars/README.md](scripts/ocr-sidecars/README.md):

1. Install upstream stacks (dots.ocr / chandra-ocr) and start **vLLM**
2. Start the sidecar HTTP layer: `python scripts/ocr-sidecars/dots_server.py` and/or `chandra_server.py`
3. Select **Dots OCR** or **Chandra OCR 2** on the Upload page

Sidecars require Python 3.10+, FastAPI, and significant GPU VRAM for the underlying models.

## Code signing (optional)

Set these secrets in GitHub Actions (or locally) for signed installers:

| Secret | Purpose |
|--------|---------|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS Developer ID |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Notarization |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows Authenticode |

Without signing, users may need **right-click → Open** (macOS) or **More info → Run anyway** (Windows SmartScreen).

## CI releases

Pushing a tag `v*` triggers [.github/workflows/release.yml](.github/workflows/release.yml), which builds macOS and Windows installers and attaches them to a GitHub Release.

## Legacy Python GUI

The older PyQt app (`gui/`, `lit_review.spec`) is not used by these installers. Do not use PyInstaller for the current Node stack.
