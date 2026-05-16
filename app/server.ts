import dotenv from "dotenv";
import express from "express";
import path from "path";
import { getAppDir } from "./lib/appPaths.js";
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

const APP_DIR = getAppDir();
const ROOT = path.join(APP_DIR, "..");
const envPath =
  process.env.LITREVIEW_ENV_PATH || path.join(ROOT, ".env");
dotenv.config({ path: envPath });

const app = express();
app.use(express.json({ limit: "50mb" }));

const publicDir = path.join(APP_DIR, "public");

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

const HOST = process.env.LITREVIEW_HOST || "127.0.0.1";
const headless = process.env.LITREVIEW_HEADLESS === "1";

function start() {
  getDb();
  const server = app.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`Lit Review Agent running at ${url}`);
    console.log("LITREVIEW_READY");
    if (!headless) {
      import("open")
        .then((m) => m.default(url))
        .catch(() => {});
    }
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
