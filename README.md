# Lit Review Agent v2

Local-first literature review assistant for PDF ingestion, structured parsing, article review generation, and multi-paper chat.

## Download (Windows & macOS)

Installers are built with Electron—no Node or git required.

Repo: [preethamam/Papers-Articles-Literature-Review-Agent](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent) · All assets: [Releases](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest)

### Quick pick — click your download

| I have… | Download |
|---------|----------|
| Mac with **Apple chip** (M1, M2, M3, M4) | [**macOS Apple Silicon (.dmg)**](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-mac-arm64.dmg) |
| Mac with **Intel** processor | [**macOS Intel (.dmg)**](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-mac-x64.dmg) |
| Windows PC (**64-bit**, most laptops/desktops) | [**Windows x64 (.exe)**](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-win-x64.exe) |
| Windows **ARM** PC (Surface Pro X, Snapdragon) | [**Windows ARM64 (.exe)**](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-win-arm64.exe) |

### Full download table

| Platform | Chip / device | Download | Install |
|----------|---------------|----------|---------|
| **macOS** | Apple Silicon | [mac-arm64.dmg](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-mac-arm64.dmg) | Open DMG → drag **Lit Review Agent** to **Applications** |
| **macOS** | Intel | [mac-x64.dmg](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-mac-x64.dmg) | Open DMG → drag **Lit Review Agent** to **Applications** |
| **Windows** | x64 | [win-x64.exe](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-win-x64.exe) | Run installer → Start Menu shortcut |
| **Windows** | ARM64 | [win-arm64.exe](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-win-arm64.exe) | Run installer → Start Menu shortcut |

**Not sure which Mac?** → **About This Mac** → **Chip** = [Apple Silicon download](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-mac-arm64.dmg) · **Processor** = [Intel download](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-mac-x64.dmg)

**Not sure which Windows?** → **Settings → System → About** → **64-bit (x64)** = [x64 download](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-win-x64.exe) · **ARM64** = [ARM64 download](https://github.com/preethamam/Papers-Articles-Literature-Review-Agent/releases/latest/download/Lit.Review.Agent-2.0.6-win-arm64.exe)

**First launch**

1. If prompted about **Java**, install [Adoptium JDK 11+](https://adoptium.net/) for the default PDF parser (OpenDataLoader), then **restart the app**. Or continue without Java and use GROBID.
2. Open **Settings** and set your **OpenRouter API key** (or edit the `.env` file in the app data folder—see [PACKAGING.md](PACKAGING.md)).

### macOS: “damaged and can’t be opened” (free fix — no Apple fee)

Releases are **unsigned** (Apple charges **$99/year** for signing). The app is **not** broken — macOS Gatekeeper blocks downloads from the web and often says **damaged** instead of **unidentified developer**.

**Do this once after installing** (copy-paste into **Terminal**):

```bash
xattr -cr "/Applications/Lit Review Agent.app"
```

If `xattr` prints **Operation not permitted** (common on recent macOS), copy the app without quarantine instead:

```bash
mkdir -p "$HOME/Applications"
ditto --noextattr --noqtn "/Applications/Lit Review Agent.app" "$HOME/Applications/Lit Review Agent.app"
open "$HOME/Applications/Lit Review Agent.app"
```

Then open **Lit Review Agent** from Applications (or `~/Applications` if you used `ditto`).

**Other options:**

1. **Right-click** the app in Applications → **Open** → **Open** (don’t double-click the first time).
2. **System Settings → Privacy & Security → Open Anyway** (appears after one blocked launch).
3. In the desktop app: **Settings → Quit application** (fully exits; the red window button only hides the window on macOS).

You only need to run `xattr` / `ditto` again if you **re-download** a new version from GitHub.

**Windows unsigned builds:** SmartScreen → **More info** → **Run anyway**.

To build installers yourself, see [PACKAGING.md](PACKAGING.md).

---

## Developer setup

### 1) Clone and install

```bash
git clone git@github.com:preethamam/Papers-Articles-Literature-Review-Agent.git
cd "Papers-Articles-Literature-Review-Agent"
bash install.sh
```

`install.sh` checks for **Java 11+** (required by the default PDF parser, OpenDataLoader). Install a JDK from [Adoptium](https://adoptium.net/) if needed.

### 2) Set environment variables

Create or edit `.env` in the project root:

```env
OPENROUTER_API_KEY=sk-or-v1-...
# Optional — only if you use GROBID as the parser:
GROBID_URL=http://localhost:8070
```

### 3) Default PDF parser: OpenDataLoader

The app defaults to **[OpenDataLoader PDF](https://github.com/opendataloader-project/opendataloader-pdf)** (`@opendataloader/pdf`): structured **JSON** + **Markdown** locally (no Docker required for basic mode).

- **Hybrid mode** (OCR, complex tables, formulas, image descriptions): install the Python extras and run the hybrid server, then enable it in **Settings → OpenDataLoader PDF**:

```bash
pip install "opendataloader-pdf[hybrid]"
opendataloader-pdf-hybrid --port 5002
```

You can also use **Settings → Start hybrid server** if `opendataloader-pdf-hybrid` is on your `PATH` (save toggles first).

### 4) Optional: GROBID (TEI XML)

If you switch the parser to **GROBID** in Settings, run GROBID with Docker:

```bash
docker run --rm -it -p 8070:8070 --name grobid lfoppiano/grobid:0.8.0
```

Detached:

```bash
docker run -d -p 8070:8070 --name grobid lfoppiano/grobid:0.8.0
```

### 5) Start the app

```bash
npm run dev
```

Then open:

- Frontend: `http://localhost:5174`
- Backend API: `http://localhost:3456`

**Electron dev window:**

```bash
npm run dev:electron
```

## One-Command Run (production style)

```bash
npm start
```

This serves the built frontend from the Express server.

## What `install.sh` does

- Installs dependencies for root, `app`, and `frontend`
- Prints a **Java** version hint (OpenDataLoader needs JDK 11+)
- Creates `.env` from `.env.example` if missing
- Builds the frontend into `app/public`

## Useful commands

```bash
npm run dev:setup     # once after npm install — rebuild SQLite for local Node dev
npm run dev           # backend + frontend (recommended for local development)
npm run dev:electron  # Electron shell + embedded server
npm run build         # compile frontend and output to app/public
npm run build:electron # bundle for desktop packaging
npm start             # run express server with built frontend
npm run dist:mac-arm64 # build macOS Apple Silicon .dmg (on macOS)
npm run dist:mac-x64   # build macOS Intel .dmg (on macOS)
npm run dist:win-x64   # build Windows x64 .exe (on Windows)
npm run dist:win-arm64 # build Windows ARM64 .exe (on Windows)
```

## GROBID notes

- Default URL when using GROBID: `http://localhost:8070`
- Manage from **Settings → GROBID**
- Stop detached container: `docker stop grobid`

## Troubleshooting

- **Java not found / OpenDataLoader fails**: install JDK 11+ and ensure `java -version` works in the same terminal you use for `npm run dev`.
- **Hybrid mode errors**: confirm `opendataloader-pdf-hybrid` is running on the port in **Hybrid URL** (default `http://localhost:5002`).
- **Docker command not found**: install Docker Desktop (only needed for GROBID).
- **Port 8070 already in use**: stop the existing service or change `GROBID_URL`.
- **OpenRouter errors**: verify `OPENROUTER_API_KEY` in `.env` and restart the app.
- **Desktop app won't open (macOS)**: right-click → Open for unsigned builds.
- **"Could not start the local server"**: use **Open log folder** in the error dialog; see [PACKAGING.md](PACKAGING.md) troubleshooting.

## Stack

- `frontend/`: React + Vite + Tailwind
- `app/`: Express + TypeScript + SQLite (`better-sqlite3`)
- `electron/`: desktop shell + installers
- Local DB: `~/.litreview/data.db`

## License

MIT - see `LICENSE`.
