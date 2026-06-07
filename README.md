# Lit Review Agent v2

Local-first literature review assistant for PDF ingestion, structured parsing, article review generation, and multi-paper chat.

## Download (Windows & macOS)

Installers are built with Electron—no Node or git required. Get the latest release from **[GitHub Releases](https://github.com/daivikvennela/litReview/releases)** and pick the file that matches your CPU.

| Platform | Chip / device | Download this file | How to install |
|----------|---------------|-------------------|----------------|
| **macOS** | Apple Silicon (M1, M2, M3, M4) | `Lit Review Agent-*-mac-arm64.dmg` | Open the DMG → drag **Lit Review Agent** to **Applications** |
| **macOS** | Intel (pre-2020 Macs) | `Lit Review Agent-*-mac-x64.dmg` | Open the DMG → drag **Lit Review Agent** to **Applications** |
| **Windows** | x64 (most PCs & laptops) | `Lit Review Agent-*-win-x64.exe` | Run the installer → launch from the Start Menu shortcut |
| **Windows** | ARM64 (Surface Pro X, Snapdragon PCs) | `Lit Review Agent-*-win-arm64.exe` | Run the installer → launch from the Start Menu shortcut |

**Not sure which Mac you have?** Apple menu → **About This Mac** → look for **Chip** (Apple M…) vs **Processor** (Intel).

**Not sure which Windows build?** **Settings → System → About** → **System type** shows **64-bit (x64)** or **ARM64**.

**First launch**

1. If prompted about **Java**, install [Adoptium JDK 11+](https://adoptium.net/) for the default PDF parser (OpenDataLoader), then **restart the app**. Or continue without Java and use GROBID.
2. Open **Settings** and set your **OpenRouter API key** (or edit the `.env` file in the app data folder—see [PACKAGING.md](PACKAGING.md)).

**Unsigned builds:** macOS → right-click the app → **Open**. Windows → SmartScreen → **More info** → **Run anyway**.

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
