# OCR sidecars (Dots OCR + Chandra OCR 2)

Lit Review Agent talks to these **local HTTP services** when you select **Dots OCR** or **Chandra OCR 2** as the PDF parser. They are **not** bundled in the desktop installer — run them on a machine with a GPU and Python 3.10+.

## Shared API contract

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Returns `{ "ok": true }` |
| `/parse` | POST | `multipart/form-data` with field `pdf`; optional `page_range` (e.g. `1-5`) |

Success response:

```json
{
  "markdown": "# Title\n\n...",
  "raw": {},
  "model": "dots.ocr"
}
```

Configure URLs in the app under **Settings → OCR sidecars** (defaults: Dots `http://127.0.0.1:8001`, Chandra `http://127.0.0.1:8002`).

## Quick start (sidecar HTTP layer only)

```bash
cd scripts/ocr-sidecars
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Dots OCR

1. Install [dots.ocr](https://github.com/rednote-hilab/dots.ocr) and start its **vLLM** backend (default `127.0.0.1:8000`).
2. Start the sidecar:

```bash
export DOTS_VLLM_HOST=127.0.0.1
export DOTS_VLLM_PORT=8000
python dots_server.py
# listens on http://127.0.0.1:8001
```

3. Verify: `curl http://127.0.0.1:8001/health`

## Chandra OCR 2

1. Install [chandra-ocr](https://github.com/datalab-to/chandra): `pip install chandra-ocr`
2. Start vLLM: `chandra_vllm` (OpenAI-compatible server, default `http://localhost:8000/v1`)
3. Start the sidecar:

```bash
export CHANDRA_METHOD=vllm
python chandra_server.py
# listens on http://127.0.0.1:8002
```

4. Verify: `curl http://127.0.0.1:8002/health`

## Environment variables

| Variable | Default | Sidecar |
|----------|---------|---------|
| `DOTS_SIDECAR_PORT` | `8001` | Dots HTTP port |
| `DOTS_VLLM_HOST` | `127.0.0.1` | Upstream vLLM for dots.ocr |
| `DOTS_VLLM_PORT` | `8000` | Upstream vLLM port |
| `CHANDRA_SIDECAR_PORT` | `8002` | Chandra HTTP port |
| `CHANDRA_METHOD` | `vllm` | Passed to `chandra` CLI |
| `CHANDRA_TIMEOUT_SEC` | `600` | Max seconds per PDF |

## Start order

1. vLLM model server (dots and/or chandra)
2. OCR sidecar(s) on ports 8001 / 8002
3. Lit Review Agent (`npm run dev` or desktop app)
4. **Upload** → select **Dots OCR** or **Chandra OCR 2**
