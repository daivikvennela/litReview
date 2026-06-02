import { dialog, shell } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import log from "electron-log";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

const JAVA_SKIP_FLAG = "java_check_dismissed";

/** Arch-aware Temurin download landing (JDK 17 LTS). */
export function adoptiumUrlForPlatform(): string {
  const platform =
    process.platform === "darwin"
      ? "mac"
      : process.platform === "win32"
        ? "windows"
        : "linux";
  const arch =
    process.arch === "arm64" || os.arch() === "arm64" ? "aarch64" : "x64";
  return `https://adoptium.net/temurin/releases?os=${platform}&arch=${arch}&package=jdk&version=17`;
}

export function getUserDataFlagPath(userData: string): string {
  return path.join(userData, JAVA_SKIP_FLAG);
}

function writeDismissFlag(flagPath: string): void {
  try {
    fs.writeFileSync(flagPath, new Date().toISOString(), "utf8");
  } catch (err) {
    log.warn("Could not write java_check_dismissed flag", err);
  }
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
      "The core app works without Java. Install Adoptium Temurin JDK 11+ for local PDF parsing, " +
      "or continue and use GROBID / hybrid backends. After installing Java, restart the app.",
    buttons: ["Open Adoptium", "Continue without Java"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    const url = adoptiumUrlForPlatform();
    await shell.openExternal(url);
    writeDismissFlag(flagPath);
    await dialog.showMessageBox({
      type: "info",
      title: "Java install",
      message: "Install Java, then restart Lit Review Agent",
      detail:
        "OpenDataLoader PDF parsing will work after Temurin is installed and you fully quit and reopen this app. " +
        "You can use the app now without Java (GROBID and other parsers).",
      buttons: ["OK"],
    });
  } else {
    writeDismissFlag(flagPath);
  }
}
