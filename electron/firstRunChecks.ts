import { dialog, shell } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import log from "electron-log";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

const JAVA_SKIP_FLAG = "java_check_dismissed";
const ADOPTIUM_URL = "https://adoptium.net/";

export function getUserDataFlagPath(userData: string): string {
  return path.join(userData, JAVA_SKIP_FLAG);
}

async function javaAvailable(): Promise<boolean> {
  try {
    await execFileAsync("java", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Non-blocking: shows a native dialog once if Java is missing. */
export async function runJavaFirstLaunchCheck(userData: string): Promise<void> {
  const flagPath = getUserDataFlagPath(userData);
  if (fs.existsSync(flagPath)) return;

  const hasJava = await javaAvailable();
  if (hasJava) return;

  log.info("Java not found — showing first-launch dialog");

  const { response } = await dialog.showMessageBox({
    type: "warning",
    title: "Java recommended",
    message: "OpenDataLoader (default PDF parser) needs Java 11+",
    detail:
      "Install Adoptium Temurin JDK 11 or newer to enable local PDF parsing. " +
      "You can still use GROBID or the hybrid backend without Java.",
    buttons: ["Open Adoptium", "Continue without Java"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    await shell.openExternal(ADOPTIUM_URL);
  } else {
    try {
      fs.writeFileSync(flagPath, new Date().toISOString(), "utf8");
    } catch (err) {
      log.warn("Could not write java_check_dismissed flag", err);
    }
  }
}
