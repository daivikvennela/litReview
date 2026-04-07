import { Router, Request, Response } from "express";
import { getSetting, setSetting } from "../db.js";

const router = Router();

const SETTING_KEYS = [
  "openrouter_api_key",
  "grobid_url",
  "grobid_mode",
  "default_model",
  "default_model_task1",
  "default_model_task2",
  "default_model_task3",
] as const;

router.get("/", (_req: Request, res: Response) => {
  const settings: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    const value = getSetting(key);
    if (value !== null) {
      if (key === "openrouter_api_key" && value.length > 4) {
        settings[key] = value.slice(0, 4) + "****";
      } else {
        settings[key] = value;
      }
    }
  }
  res.json(settings);
});

router.put("/", (req: Request, res: Response) => {
  const body = req.body as Record<string, string>;
  for (const key of SETTING_KEYS) {
    if (body[key] !== undefined) {
      setSetting(key, String(body[key]));
    }
  }
  res.json({ ok: true });
});

export default router;
