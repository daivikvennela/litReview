import { Router, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { parsePdfToXml } from "../lib/grobid.js";
import { getSetting } from "../db.js";
import { upsertArticle } from "../db.js";
import { buildArticleRecordFromTei } from "../lib/teiMetadata.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const router = Router();

router.post("/", upload.single("pdf"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No PDF file uploaded" });
    return;
  }

  const grobidUrl = getSetting("grobid_url");
  try {
    const xml = await parsePdfToXml(req.file.buffer, req.file.originalname, grobidUrl);
    const id = createHash("md5").update(req.file.buffer).digest("hex");
    const parsedAt = new Date().toISOString();

    upsertArticle(buildArticleRecordFromTei(xml, { id, pdf_path: req.file.originalname, parsed_at: parsedAt }));

    res.setHeader("Content-Type", "application/xml");
    res.send(xml);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    res.status(502).json({ error: message });
  }
});

export default router;
