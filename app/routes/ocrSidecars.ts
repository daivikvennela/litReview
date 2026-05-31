import { Router, Request, Response } from "express";
import { getSetting } from "../db.js";
import { checkOcrSidecarAlive, CHANDRA_OCR2_DEFAULT_URL, DOTS_OCR_DEFAULT_URL } from "../lib/pdfParsers/ocrSidecarClient.js";

const router = Router();

router.get("/dots/status", async (_req: Request, res: Response) => {
  const url = getSetting("dots_ocr_url") ?? DOTS_OCR_DEFAULT_URL;
  const alive = await checkOcrSidecarAlive(url);
  res.json({ alive, url });
});

router.get("/chandra/status", async (_req: Request, res: Response) => {
  const url = getSetting("chandra_ocr2_url") ?? CHANDRA_OCR2_DEFAULT_URL;
  const alive = await checkOcrSidecarAlive(url);
  res.json({ alive, url });
});

export default router;
