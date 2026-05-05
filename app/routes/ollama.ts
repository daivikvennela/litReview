import { Router, Request, Response } from "express";
import { getSetting } from "../db.js";
import { OLLAMA_DEFAULT_URL, checkOllamaAlive } from "../lib/pdfParsers/ollamaVlmParser.js";

const router = Router();

router.get("/status", async (_req: Request, res: Response) => {
  const url = getSetting("ollama_url") || process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL;
  const alive = await checkOllamaAlive(url);
  res.json({ alive, url });
});

router.get("/tags", async (_req: Request, res: Response) => {
  const base = (getSetting("ollama_url") || process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
  try {
    const upstream = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3500) });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Ollama ${upstream.status}` });
      return;
    }
    const json = (await upstream.json()) as { models?: Array<{ name?: string }> };
    const names = (json.models ?? []).map((m) => m.name).filter((s): s is string => typeof s === "string");
    res.json({ models: names });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Could not reach Ollama at ${base}: ${msg}` });
  }
});

export default router;
