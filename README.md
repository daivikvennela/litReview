# Lit Review Agent v2

Local-first literature review assistant for PDF ingestion, TEI parsing, article review generation, and multi-paper chat.

## Quick Start (Copy/Paste)

### 1) Clone and install

```bash
git clone git@github.com:preethamam/Papers-Articles-Literature-Review-Agent.git
cd "Papers-Articles-Literature-Review-Agent"
bash install.sh
```

### 2) Set environment variables

Create or edit `.env` in the project root:

```env
OPENROUTER_API_KEY=sk-or-v1-...
GROBID_URL=http://localhost:8070
```

### 3) Start GROBID with Docker

Make sure Docker Desktop is running, then:

```bash
docker run --rm -it -p 8070:8070 --name grobid lfoppiano/grobid:0.8.0
```

If you prefer detached mode:

```bash
docker run -d -p 8070:8070 --name grobid lfoppiano/grobid:0.8.0
```

### 4) Start the app

```bash
npm run dev
```

Then open:

- Frontend: `http://localhost:5174`
- Backend API: `http://localhost:3456`

## One-Command Run (production style)

```bash
npm start
```

This serves the built frontend from the Express server.

## What `install.sh` does

- Installs dependencies for root, `app`, and `frontend`
- Creates `.env` from `.env.example` if missing
- Builds the frontend into `app/public`

## Useful commands

```bash
npm run dev       # backend + frontend (recommended for local development)
npm run build     # compile frontend and output to app/public
npm start         # run express server with built frontend
```

## GROBID notes

- Default URL expected by the app: `http://localhost:8070`
- You can also manage GROBID from the app UI: `Settings -> GROBID`
- To stop detached container:

```bash
docker stop grobid
```

## Troubleshooting

- **Docker command not found**: install Docker Desktop and restart terminal.
- **Port 8070 already in use**: stop the existing service or map another port and update `GROBID_URL`.
- **OpenRouter errors**: verify `OPENROUTER_API_KEY` in `.env` and restart app.

## Stack

- `frontend/`: React + Vite + Tailwind
- `app/`: Express + TypeScript + SQLite (`better-sqlite3`)
- Local DB: `~/.litreview/data.db`

## License

MIT - see `LICENSE`.
