import { Router, Request, Response } from "express";
import { createOpenRouter } from "../lib/openrouter.js";
import { getSetting } from "../db.js";
import { buildArticleContextSystemBlock } from "../lib/chatArticleContext.js";
import {
  getIntroAbstractChatSystem,
  getLiteratureSynthesisSystem,
  getRelatedWorkCompileSystem,
  getSummarizeSetChatSystem,
} from "../lib/prompts.js";
import { validateCiteTargets } from "../lib/chatCiteGuard.js";
import { RELATED_WORK_RETRY_USER_MESSAGE, relatedWorkPassesRigor } from "../lib/relatedWorkQualityGate.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { message, model, files, system, mode } = req.body;
  const detailLevelRaw = Number(req.body.detailLevel);
  const detailLevel: 0 | 1 | 2 | 3 =
    detailLevelRaw >= 3 ? 3 : detailLevelRaw >= 2 ? 2 : detailLevelRaw === 1 ? 1 : 0;
  const articleIdsRaw = req.body.articleIds;
  const articleIds = Array.isArray(articleIdsRaw)
    ? articleIdsRaw.map((id: unknown) => String(id).trim()).filter(Boolean)
    : typeof articleIdsRaw === "string"
      ? articleIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (mode === "related_work_compile" && (articleIds.length < 2 || articleIds.length > 50)) {
    res.status(400).json({ error: "Related-work compilation requires selecting between 2 and 50 articles." });
    return;
  }

  const apiKey = getSetting("openrouter_api_key") || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(400).json({ error: "OpenRouter API key not set. Configure in Settings." });
    return;
  }

  const selectedModel = model || getSetting("default_model") || "openrouter/free";

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  if (files && Array.isArray(files) && files.length > 0) {
    for (const file of files) {
      if (file.type?.startsWith("image/")) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${file.type};base64,${file.data}` },
        });
      } else {
        contentParts.push({
          type: "text",
          text: `[File: ${file.name}]\n${file.text}`,
        });
      }
    }
  }
  contentParts.push({ type: "text", text: message });

  const docBlock = buildArticleContextSystemBlock(
    articleIds,
    mode === "related_work_compile" ? { mode: "related_work_compile" } : undefined,
  );
  const systemParts: string[] = [];
  if (mode === "lit_review_synthesis") {
    systemParts.push(getLiteratureSynthesisSystem(detailLevel));
  } else if (mode === "summarize_set") {
    systemParts.push(getSummarizeSetChatSystem(detailLevel));
  } else if (mode === "intro_abstract") {
    systemParts.push(getIntroAbstractChatSystem(detailLevel));
  } else if (mode === "related_work_compile") {
    systemParts.push(getRelatedWorkCompileSystem(detailLevel));
  }
  if (typeof system === "string" && system.trim()) systemParts.push(system.trim());
  if (docBlock) systemParts.push(docBlock);
  const combinedSystem = systemParts.length > 0 ? systemParts.join("\n\n---\n\n") : undefined;

  const messages: Array<{ role: string; content: string | typeof contentParts }> = [];
  if (combinedSystem) messages.push({ role: "system", content: combinedSystem });
  messages.push({ role: "user", content: contentParts });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const allowedCiteIds = new Set(articleIds);
  const bufferRelatedWorkFirstPass = mode === "related_work_compile" && articleIds.length >= 2;

  try {
    const openrouter = createOpenRouter(apiKey);
    const stream = await openrouter.chat.send({
      chatGenerationParams: {
        model: selectedModel,
        messages: messages as unknown as never[],
        stream: true,
      },
    });

    let fullText = "";
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        fullText += content;
        if (!bufferRelatedWorkFirstPass) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      if (chunk.usage) res.write(`data: ${JSON.stringify({ usage: chunk.usage })}\n\n`);
    }

    if (bufferRelatedWorkFirstPass) {
      if (relatedWorkPassesRigor(fullText, articleIds.length)) {
        res.write(`data: ${JSON.stringify({ content: fullText })}\n\n`);
      } else {
        res.write(
          `data: ${JSON.stringify({
            content:
              "\n\n---\n\n**Regenerating** (first draft below rigor checks: length, structure, or citations). One stricter pass…\n\n",
          })}\n\n`,
        );
        const retryMessages: Array<{ role: string; content: string | typeof contentParts }> = [
          ...messages,
          { role: "assistant", content: fullText },
          { role: "user", content: RELATED_WORK_RETRY_USER_MESSAGE },
        ];
        const stream2 = await openrouter.chat.send({
          chatGenerationParams: {
            model: selectedModel,
            messages: retryMessages as unknown as never[],
            stream: true,
          },
        });
        fullText = "";
        for await (const chunk of stream2) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
          if (chunk.usage) res.write(`data: ${JSON.stringify({ usage: chunk.usage })}\n\n`);
        }
      }
    }

    if (articleIds.length > 0 && fullText) {
      const citeCheck = validateCiteTargets(fullText, allowedCiteIds);
      if (!citeCheck.ok) {
        const base = `\n\n[Citation check] Unknown cite target(s): ${citeCheck.invalid.join(", ")}. Use only Internal IDs from the document blocks (copy the exact ID after "Internal ID:").`;
        const extra =
          mode === "related_work_compile"
            ? " For Related Works, every paper-specific claim should use `[n](cite:INTERNAL_ID)` with a valid ID from the context."
            : "";
        res.write(`data: ${JSON.stringify({ content: base + extra })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OpenRouter error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

export default router;
