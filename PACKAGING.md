# Packaging Lit Review Agent for end users

Desktop installers are built with **Electron** + **electron-builder**. The packaged app embeds the Node/Express backend and the built React UI—users do not need Node, npm, or git.

## Outputs

| Platform | Chip | Artifact filename | Location after build |
|----------|------|-------------------|----------------------|
| macOS | Apple Silicon (M1+) | `Lit Review Agent-*-mac-arm64.dmg` | `dist-installers/` |
| macOS | Intel | `Lit Review Agent-*-mac-x64.dmg` | `dist-installers/` |
| Windows | x64 | `Lit Review Agent-*-win-x64.exe` | `dist-installers/` |
| Windows | ARM64 (WoA) | `Lit Review Agent-*-win-arm64.exe` | `dist-installers/` |

Pick the installer that matches your CPU. Intel Macs need the **x64** DMG; Apple Silicon needs **arm64**.

## Build locally

Prerequisites: **Node.js 20+**, npm, and platform tools for native modules.

```bash
# One-time setup
npm install
npm --prefix app install
npm --prefix frontend install

# Build installers (run on the target OS, or use CI)
npm run dist:mac-arm64   # macOS Apple Silicon
npm run dist:mac-x64     # macOS Intel (cross-builds x64 native modules on Apple Silicon)
npm run dist:win-x64     # Windows x64
npm run dist:win-arm64   # Windows ARM64
npm run dist:mac         # both macOS DMGs (arm64 + x64)
npm run dist:win         # both Windows installers (x64 + arm64)
npm run dist:all         # mac + win (requires macOS + Windows hosts, or CI)
```

`npm run build:electron` (called by `dist:*`) will:

1. Build the frontend into `app/public`
2. Generate `build/icon.png`
3. Bundle Electron main/preload (`dist-electron/`)
4. Bundle Express server (`app/server.bundle.cjs`)
5. Rebuild `better-sqlite3` for Electron (`npm run rebuild:app-native`; set `TARGET_ARCH=x64` or `arm64` when cross-building)
6. Run `electron-builder` using [electron/builder.yml](electron/builder.yml)

The packaged app runs `app/server.bundle.cjs` when present, otherwise `app/server.ts` via **tsx**.

## Dev with Electron (no installer)

```bash
npm run dev:electron
```

Spawns the Express server and opens an Electron window at `http://127.0.0.1:<port>`.

## User data & configuration

- SQLite database: `~/.litreview/data.db` (unchanged)
- API keys / settings: `%APPDATA%/Lit Review Agent/.env` (Windows) or `~/Library/Application Support/Lit Review Agent/.env` (macOS), created from `.env.example` on first launch
- Application logs: `%APPDATA%/Lit Review Agent/logs/` (Windows) or `~/Library/Logs/Lit Review Agent/` (macOS)

## Java (OpenDataLoader)

The installer does **not** bundle a JRE. On first launch, if `java` is not on `PATH`, a native dialog offers an arch-aware link to [Adoptium Temurin JDK 17](https://adoptium.net/). Users can dismiss it and still use GROBID or hybrid parsing. After installing Java, **fully quit and restart** the app so `PATH` updates on Windows.

The NSIS installer does **not** auto-launch the app when setup finishes (`runAfterFinish: false`); use the Start Menu shortcut.

## GROBID

GROBID is not embedded. Users run it via Docker or point **Settings → GROBID URL** at a hosted instance.

## OCR sidecars (Dots OCR + Chandra OCR 2)

These parsers are **not** bundled in the installer. Users with a GPU run local sidecar services and point **Settings → OCR sidecars** at their URLs (defaults: Dots `http://127.0.0.1:8001`, Chandra `http://127.0.0.1:8002`).

Setup steps live in [scripts/ocr-sidecars/README.md](scripts/ocr-sidecars/README.md):

1. Install upstream stacks (dots.ocr / chandra-ocr) and start **vLLM**
2. Start the sidecar HTTP layer: `python scripts/ocr-sidecars/dots_server.py` and/or `chandra_server.py`
3. Select **Dots OCR** or **Chandra OCR 2** on the Upload page

Sidecars require Python 3.10+, FastAPI, and significant GPU VRAM for the underlying models.

## Troubleshooting desktop startup

If the app shows **"Could not start the local server"** or **"Server did not become ready"**:

1. Click **Open log folder** in the error dialog (or open the log paths above manually).
2. Look for `[server]` lines and whether `LITREVIEW_READY` appears.
3. If the server exited immediately, check for `better_sqlite3` / ABI errors — the dialog includes exit code and recent stderr.
4. On Windows, install to a path **with spaces** (e.g. `C:\Program Files\Lit Review Agent`) to verify path handling.
5. Optional failure injection: rename `resources\app\node_modules\better-sqlite3\build\Release\better_sqlite3.node` inside the install dir — expect an explicit native-module error, not a generic timeout.

**Reproduction checklist (support / QA):**

- [ ] Fresh NSIS install → launch from shortcut (not during Temurin install)
- [ ] electron-log shows `Starting server` with port and entry path
- [ ] Health ready within 60s on first launch
- [ ] Broken `.node` → exit code in dialog

## Manual QA matrix (release sign-off)

| Case | Steps | Pass |
|------|-------|------|
| Win x64 clean | NSIS → shortcut launch | UI opens within 60s; no generic-only error |
| Win x64 + Temurin parallel | Install Java during first run | App still opens; after restart Settings shows Java OK |
| Win path with spaces | Custom dir under Program Files | Server starts |
| mac arm64 | arm64 DMG drag to Applications | Same |
| mac x64 Intel | x64 DMG only | App opens native (no Rosetta) |
| Failure injection | Break sqlite `.node` | Explicit native error with exit code |
| Dev regression | `npm run dev:electron` | Unchanged |

## Code signing & notarization (macOS — optional, $99/year Apple fee)

**Default:** unsigned DMGs (free). Users run `xattr -cr "/Applications/Lit Review Agent.app"` once — see README.

**Optional paid path:** [docs/MACOS_SIGNING.md](docs/MACOS_SIGNING.md). If these GitHub secrets are set, CI signs + notarizes automatically:

| Secret | Purpose |
|--------|---------|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Developer ID Application certificate (`.p12`, base64) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization |

Optional Windows Authenticode: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

Unsigned local builds: `npm run dist:mac-arm64` (no secrets).  
Signed release builds (CI): `npm run dist:mac-arm64:signed` with env vars set.

Without signing, macOS users often see **“Lit Review Agent is damaged and can’t be opened”** — the app is fine; Gatekeeper quarantined the download. Fixes:

1. Right-click the app → **Open** → **Open**
2. Terminal: `xattr -cr "/Applications/Lit Review Agent.app"`
3. **System Settings → Privacy & Security → Open Anyway**

Windows users: SmartScreen → **More info → Run anyway**.

Production releases should use the signing secrets below so users do not need these steps.

## CI releases

Pushing a tag `v*` triggers [.github/workflows/release.yml](.github/workflows/release.yml), which builds four installers (mac arm64, mac x64, win x64, win arm64) and attaches them to a GitHub Release. Native rebuild failures fail the CI job.

## Legacy Python GUI

The older PyQt app (`gui/`, `lit_review.spec`) is not used by these installers. Do not use PyInstaller for the current Node stack.
