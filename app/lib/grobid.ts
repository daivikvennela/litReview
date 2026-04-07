const DEFAULT_GROBID_URL = "http://localhost:8070";

export function getGrobidUrl(override?: string | null): string {
  return override || process.env.GROBID_URL || DEFAULT_GROBID_URL;
}

export async function parsePdfToXml(
  pdfBuffer: Buffer,
  filename: string,
  baseUrl?: string | null
): Promise<string> {
  const url = getGrobidUrl(baseUrl);
  const form = new FormData();
  form.append("input", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), filename);
  form.append("consolidateHeader", "1");
  form.append("consolidateCitations", "0");
  const res = await fetch(`${url}/api/processFulltextDocument`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GROBID error (${res.status}): ${errText}`);
  }

  return res.text();
}

export async function checkGrobidAlive(baseUrl?: string | null): Promise<boolean> {
  try {
    const url = getGrobidUrl(baseUrl);
    const res = await fetch(`${url}/api/isalive`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
