import { Router, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { checkGrobidAlive, getGrobidUrl } from "../lib/grobid.js";
import { getSetting } from "../db.js";

const execAsync = promisify(exec);
const router = Router();
const GROBID_IMAGE = "lfoppiano/grobid:0.8.1";
const GROBID_CONTAINER = "grobid";

async function waitForAlive(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const alive = await checkGrobidAlive(url);
    if (alive) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function dockerContainerExists(name: string): Promise<boolean> {
  const { stdout } = await execAsync(`docker ps -a --filter "name=^/${name}$" --format "{{.Names}}"`);
  return stdout.trim() === name;
}

async function dockerContainerRunning(name: string): Promise<boolean> {
  const { stdout } = await execAsync(`docker ps --filter "name=^/${name}$" --format "{{.Names}}"`);
  return stdout.trim() === name;
}

router.get("/status", async (req: Request, res: Response) => {
  const grobidUrl = getSetting("grobid_url");
  const mode = getSetting("grobid_mode") || "docker";
  const alive = await checkGrobidAlive(grobidUrl);
  res.json({ alive, mode });
});

router.post("/start", async (req: Request, res: Response) => {
  const mode = getSetting("grobid_mode") || "docker";
  const url = getGrobidUrl(getSetting("grobid_url"));

  if (mode !== "docker") {
    const alive = await checkGrobidAlive(getSetting("grobid_url"));
    res.json({
      ok: alive,
      mode,
      alive,
      message: alive
        ? `External GROBID reachable at ${url}.`
        : `External mode enabled. Set a reachable GROBID URL (current: ${url}).`,
    });
    return;
  }

  try {
    const alreadyRunning = await dockerContainerRunning(GROBID_CONTAINER);
    if (!alreadyRunning) {
      const exists = await dockerContainerExists(GROBID_CONTAINER);
      if (exists) {
        await execAsync(`docker start ${GROBID_CONTAINER}`);
      } else {
        await execAsync(`docker run -d --name ${GROBID_CONTAINER} -p 8070:8070 ${GROBID_IMAGE}`);
      }
    }

    const alive = await waitForAlive(url, 20000);
    res.json({
      ok: alive,
      mode: "docker",
      alive,
      message: alive
        ? `GROBID is ready at ${url}.`
        : `Docker container started but ${url}/api/isalive is not reachable yet.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to start GROBID";
    res.status(500).json({ error: msg });
  }
});

export default router;
