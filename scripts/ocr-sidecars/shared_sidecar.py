"""Shared helpers for Lit Review Agent OCR sidecars."""

from __future__ import annotations

import json
import os
from typing import Any


def sidecar_port(env_key: str, default: int) -> int:
    raw = os.environ.get(env_key, str(default))
    try:
        return int(raw)
    except ValueError:
        return default


def layout_results_to_markdown(results: list[dict[str, Any]]) -> str:
    """Best-effort merge of dots.ocr layout pages into Markdown."""
    parts: list[str] = []
    for page in results:
        if isinstance(page, dict):
            md = page.get("markdown") or page.get("md")
            if isinstance(md, str) and md.strip():
                parts.append(md.strip())
                continue
            layout_path = page.get("layout_info_path")
            if isinstance(layout_path, str) and os.path.isfile(layout_path):
                try:
                    with open(layout_path, encoding="utf-8") as f:
                        layout = json.load(f)
                    text = extract_text_from_layout(layout)
                    if text.strip():
                        parts.append(text.strip())
                except (OSError, json.JSONDecodeError):
                    pass
    return "\n\n".join(parts)


def extract_text_from_layout(layout: Any) -> str:
    """Walk dots.ocr layout JSON and concatenate text blocks in reading order."""
    if isinstance(layout, str):
        return layout
    if isinstance(layout, list):
        return "\n\n".join(extract_text_from_layout(x) for x in layout if x)
    if not isinstance(layout, dict):
        return ""
    if "text" in layout and isinstance(layout["text"], str):
        return layout["text"]
    chunks: list[str] = []
    for key in ("content", "markdown", "md", "body"):
        val = layout.get(key)
        if isinstance(val, str) and val.strip():
            chunks.append(val.strip())
    for key in ("blocks", "elements", "lines", "children", "layout"):
        val = layout.get(key)
        if val is not None:
            sub = extract_text_from_layout(val)
            if sub.strip():
                chunks.append(sub.strip())
    return "\n\n".join(chunks)
