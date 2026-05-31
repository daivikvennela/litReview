#!/usr/bin/env python3
"""Chandra OCR 2 HTTP sidecar for Lit Review Agent (default port 8002)."""

from __future__ import annotations

import glob
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from shared_sidecar import sidecar_port

app = FastAPI(title="Chandra OCR 2 Sidecar", version="1.0.0")

CHANDRA_METHOD = os.environ.get("CHANDRA_METHOD", "vllm")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


def _read_markdown_from_output_dir(out_dir: str) -> str:
    md_files = sorted(glob.glob(os.path.join(out_dir, "**", "*.md"), recursive=True))
    if not md_files:
        md_files = sorted(glob.glob(os.path.join(out_dir, "*.md")))
    parts: list[str] = []
    for path in md_files:
        try:
            text = Path(path).read_text(encoding="utf-8").strip()
            if text:
                parts.append(text)
        except OSError:
            continue
    return "\n\n".join(parts)


@app.post("/parse")
async def parse(
    pdf: UploadFile = File(...),
    page_range: str | None = Form(default=None),
) -> dict[str, Any]:
    if not pdf.filename or not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Expected a .pdf file")

    data = await pdf.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF")

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, pdf.filename or "upload.pdf")
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        with open(pdf_path, "wb") as f:
            f.write(data)

        cmd = ["chandra", pdf_path, out_dir, "--method", CHANDRA_METHOD]
        if page_range:
            cmd.extend(["--page-range", page_range])

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=int(os.environ.get("CHANDRA_TIMEOUT_SEC", "600")),
                check=False,
            )
        except FileNotFoundError as err:
            raise HTTPException(
                status_code=503,
                detail="chandra CLI not found. pip install chandra-ocr && chandra_vllm (see scripts/ocr-sidecars/README.md)",
            ) from err
        except subprocess.TimeoutExpired as err:
            raise HTTPException(status_code=504, detail="chandra timed out") from err

        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "chandra failed").strip()[:2000]
            raise HTTPException(status_code=502, detail=detail)

        markdown = _read_markdown_from_output_dir(out_dir)
        if not markdown.strip():
            raise HTTPException(status_code=502, detail="chandra produced no markdown output")

        return {
            "markdown": markdown,
            "raw": {"stdout": proc.stdout[:4000] if proc.stdout else "", "page_range": page_range},
            "model": "chandra-ocr-2",
        }


if __name__ == "__main__":
    port = sidecar_port("CHANDRA_SIDECAR_PORT", 8002)
    uvicorn.run(app, host="127.0.0.1", port=port)
