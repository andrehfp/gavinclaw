import type { Logger } from "./provider.js";
import { termStyle } from "./terminal-style.js";

type LogLevel = "info" | "warn" | "error";

const levelLabel = (level: LogLevel): string => {
  const raw = termStyle.bold(`[${level.toUpperCase()}]`, "stderr");
  if (level === "warn") {
    return termStyle.yellow(raw, "stderr");
  }
  if (level === "error") {
    return termStyle.red(raw, "stderr");
  }
  return termStyle.cyan(raw, "stderr");
};

const writeLog = (level: LogLevel, message: string, meta?: unknown): void => {
  const prefix = levelLabel(level);
  if (meta === undefined) {
    console.error(`${prefix} ${message}`);
    return;
  }

  console.error(`${prefix} ${message}`, meta);
};

export const createLogger = (quiet: boolean): Logger => ({
  info: (message: string, meta?: unknown) => {
    if (quiet) {
      return;
    }
    writeLog("info", message, meta);
  },
  warn: (message: string, meta?: unknown) => {
    if (quiet) {
      return;
    }
    writeLog("warn", message, meta);
  },
  error: (message: string, meta?: unknown) => {
    if (quiet) {
      return;
    }
    writeLog("error", message, meta);
  }
});
