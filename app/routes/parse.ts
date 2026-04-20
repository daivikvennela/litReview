import { Router, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { upsertArticle, folderFromPdfPath, insertParseOutput } from "../db.js";
import { parsePdfWithEngine, coerceEngine } from "../lib/pdfParsers/index.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const router = Router();

router.post("/", upload.single("pdf"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No PDF file uploaded" });
    return;
  }

  const engine = coerceEngine(req.body?.parser_engine);
  const model = typeof req.body?.parser_model === "string" && req.body.parser_model.trim().length > 0
    ? req.body.parser_model.trim()
    : undefined;

  try {
    const parsed = await parsePdfWithEngine(req.file.buffer, req.file.originalname, { engine, model });
    const id = createHash("md5").update(req.file.buffer).digest("hex");
    const parsedAt = new Date().toISOString();
    const folder = folderFromPdfPath(req.file.originalname);

    upsertArticle({
      id,
      title: parsed.articleFields.title,
      authors: parsed.articleFields.authors,
      abstract: parsed.articleFields.abstract,
      pdf_path: req.file.originalname,
      xml: parsed.teiXml,
      parsed_at: parsedAt,
      model_used: parsed.model,
      year: parsed.articleFields.year,
      venue_type: parsed.articleFields.venue_type,
      venue_name: parsed.articleFields.venue_name,
      links_json: parsed.articleFields.links_json,
      folder,
    });

    insertParseOutput({
      article_id: id,
      parser_engine: parsed.engine,
      parser_model: parsed.model,
      output_format: parsed.format,
      payload_json: parsed.rawPayload,
      normalized_text: parsed.normalizedText,
      is_primary: true,
    });

    if (parsed.format === "tei_xml" && parsed.teiXml) {
      res.setHeader("Content-Type", "application/xml");
      res.send(parsed.teiXml);
    } else {
      res.json({
        article_id: id,
        engine: parsed.engine,
        model: parsed.model,
        format: parsed.format,
        rawPayload: parsed.rawPayload,
        articleFields: parsed.articleFields,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    res.status(502).json({ error: message });
  }
});

export default router;
