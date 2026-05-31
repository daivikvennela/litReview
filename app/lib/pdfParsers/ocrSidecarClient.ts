export const DOTS_OCR_DEFAULT_URL = "http://127.0.0.1:8001";
export const CHANDRA_OCR2_DEFAULT_URL = "http://127.0.0.1:8002";
export const OCR_SIDECAR_DEFAULT_TIMEOUT_MS = 120_000;

export interface OcrSidecarParseResponse {
  markdown: string;
  raw?: unknown;
  model?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function checkOcrSidecarAlive(baseUrl: string): Promise<boolean> {
  try {
    const url = normalizeBaseUrl(baseUrl);
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function parsePdfViaSidecar(
  baseUrl: string,
  pdfBuffer: Buffer,
  filename: string,
  opts?: { pageRange?: string; timeoutMs?: number },
): Promise<OcrSidecarParseResponse> {
  const url = normalizeBaseUrl(baseUrl);
  const form = new FormData();
  form.append("pdf", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), filename);
  if (opts?.pageRange) {
    form.append("page_range", opts.pageRange);
  }

  const timeoutMs = opts?.timeoutMs ?? OCR_SIDECAR_DEFAULT_TIMEOUT_MS;
  const res = await fetch(`${url}/parse`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    let detail = await res.text();
    try {
      const parsed = JSON.parse(detail) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      /* use raw text */
    }
    throw new Error(`OCR sidecar error (${res.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as OcrSidecarParseResponse;
  if (!data.markdown || typeof data.markdown !== "string" || !data.markdown.trim()) {
    throw new Error("OCR sidecar returned empty markdown");
  }
  return data;
}
