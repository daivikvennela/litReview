import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";
import { getDb } from "./db.js";
import chatRouter from "./routes/chat.js";
import parseRouter from "./routes/parse.js";
import articlesRouter from "./routes/articles.js";
import reviewsRouter from "./routes/reviews.js";
import settingsRouter from "./routes/settings.js";
import grobidRouter from "./routes/grobid.js";
import modelsRouter from "./routes/models.js";
import metaRouter from "./routes/meta.js";
import ollamaRouter from "./routes/ollama.js";
import opendataloaderRouter from "./routes/opendataloader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const app = express();
app.use(express.json({ limit: "50mb" }));

const publicDir = path.join(__dirname, "public");

app.use("/api/chat", chatRouter);
app.use("/api/parse", parseRouter);
app.use("/api/articles", articlesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/grobid", grobidRouter);
app.use("/api/models", modelsRouter);
app.use("/api/meta", metaRouter);
app.use("/api/ollama", ollamaRouter);
app.use("/api/opendataloader", opendataloaderRouter);

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = Number(process.env.PORT) || 3456;

function start() {
  getDb();
  const server = app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Lit Review Agent running at ${url}`);
    open(url).catch(() => {});
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${PORT} is already in use.\n`);
      console.error(`Free it:  kill -9 $(lsof -ti :${PORT})`);
      console.error(`Or pick a free port in repo .env:  PORT=37891`);
      console.error(`(If you use npm run dev, set the same PORT in .env so Vite proxies /api correctly.)\n`);
      process.exit(1);
    }
    throw err;
  });
}

start();
