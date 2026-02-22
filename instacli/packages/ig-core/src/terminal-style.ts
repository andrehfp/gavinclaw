type TerminalStream = "stdout" | "stderr";

const ANSI_RESET = "\u001b[0m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_DIM = "\u001b[2m";
const ANSI_RED = "\u001b[31m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_CYAN = "\u001b[36m";

const supportsColor = (stream: TerminalStream): boolean => {
  if (typeof process === "undefined") {
    return false;
  }

  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  if (process.env.FORCE_COLOR === "0") {
    return false;
  }

  if (process.env.FORCE_COLOR !== undefined) {
    return true;
  }

  const target = stream === "stdout" ? process.stdout : process.stderr;
  return Boolean(target?.isTTY);
};

const paint = (value: string, code: string, stream: TerminalStream): string => {
  if (!supportsColor(stream)) {
    return value;
  }

  return `${code}${value}${ANSI_RESET}`;
};

export const termStyle = {
  bold: (value: string, stream: TerminalStream = "stdout"): string => paint(value, ANSI_BOLD, stream),
  dim: (value: string, stream: TerminalStream = "stdout"): string => paint(value, ANSI_DIM, stream),
  red: (value: string, stream: TerminalStream = "stdout"): string => paint(value, ANSI_RED, stream),
  green: (value: string, stream: TerminalStream = "stdout"): string => paint(value, ANSI_GREEN, stream),
  yellow: (value: string, stream: TerminalStream = "stdout"): string => paint(value, ANSI_YELLOW, stream),
  cyan: (value: string, stream: TerminalStream = "stdout"): string => paint(value, ANSI_CYAN, stream)
};
