#!/usr/bin/env python3
"""Dots OCR HTTP sidecar for Lit Review Agent (default port 8001)."""

from __future__ import annotations

import os
import tempfile
from typing import Any

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from shared_sidecar import layout_results_to_markdown, sidecar_port

app = FastAPI(title="Dots OCR Sidecar", version="1.0.0")

DOTS_VLLM_HOST = os.environ.get("DOTS_VLLM_HOST", "127.0.0.1")
DOTS_VLLM_PORT = int(os.environ.get("DOTS_VLLM_PORT", "8000"))


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/parse")
async def parse(
    pdf: UploadFile = File(...),
    page_range: str | None = Form(default=None),
) -> dict[str, Any]:
    if not pdf.filename or not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Expected a .pdf file")

    try:
        from dots_ocr.parser import DotsOCRParser
    except ImportError as err:
        raise HTTPException(
            status_code=503,
            detail="dots.ocr not installed. Clone https://github.com/rednote-hilab/dots.ocr and pip install -e .",
        ) from err

    data = await pdf.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF")

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, pdf.filename or "upload.pdf")
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        with open(pdf_path, "wb") as f:
            f.write(data)

        parser = DotsOCRParser(
            ip=DOTS_VLLM_HOST,
            port=DOTS_VLLM_PORT,
            dpi=int(os.environ.get("DOTS_DPI", "200")),
        )
        try:
            results = parser.parse_pdf(
                input_path=pdf_path,
                filename=os.path.splitext(os.path.basename(pdf_path))[0],
                save_dir=out_dir,
            )
        except Exception as err:
            raise HTTPException(status_code=502, detail=f"dots.ocr parse failed: {err}") from err

        serializable = [r if isinstance(r, dict) else {"result": str(r)} for r in (results or [])]
        markdown = layout_results_to_markdown(serializable)
        if not markdown.strip():
            raise HTTPException(status_code=502, detail="dots.ocr returned no markdown text")

        return {
            "markdown": markdown,
            "raw": {"pages": serializable, "page_range": page_range},
            "model": "dots.ocr",
        }


if __name__ == "__main__":
    port = sidecar_port("DOTS_SIDECAR_PORT", 8001)
    uvicorn.run(app, host="127.0.0.1", port=port)
