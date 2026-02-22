import type { GlobalFlags, ToolResult } from "./types.js";
import { termStyle } from "./terminal-style.js";

type OnboardingData = {
  provider: string;
  links: Array<{ label: string; url: string }>;
  checklist: string[];
  next_steps: string[];
  required_scopes?: string[];
  opened_links?: boolean;
};

type OnboardingCompletedData = {
  configured?: boolean;
  provider?: string;
  onboarding_path?: string;
  first_post_test_command?: string;
  validation?: {
    auth_status?: boolean;
    media_list?: boolean;
    connection_validated?: boolean;
  };
  profile?: {
    ig_account_id?: string;
    ig_username?: string;
  };
  next_steps?: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isOnboardingData = (value: unknown): value is OnboardingData => {
  if (!isObject(value)) {
    return false;
  }

  const links = value.links;
  const checklist = value.checklist;
  const nextSteps = value.next_steps;

  if (!Array.isArray(links) || !Array.isArray(checklist) || !Array.isArray(nextSteps)) {
    return false;
  }

  const validLinks = links.every((link) => isObject(link) && typeof link.label === "string" && typeof link.url === "string");
  const validChecklist = checklist.every((item) => typeof item === "string");
  const validNextSteps = nextSteps.every((item) => typeof item === "string");
  const validProvider = typeof value.provider === "string";

  return validLinks && validChecklist && validNextSteps && validProvider;
};

const isOnboardingCompletedData = (value: unknown): value is OnboardingCompletedData => {
  if (!isObject(value)) {
    return false;
  }

  const nextSteps = value.next_steps;
  if (!Array.isArray(nextSteps) || !nextSteps.every((item) => typeof item === "string")) {
    return false;
  }

  if (value.provider !== undefined && typeof value.provider !== "string") {
    return false;
  }

  if (value.configured !== undefined && typeof value.configured !== "boolean") {
    return false;
  }

  if (value.profile !== undefined && !isObject(value.profile)) {
    return false;
  }

  if (value.validation !== undefined && !isObject(value.validation)) {
    return false;
  }

  if (value.first_post_test_command !== undefined && typeof value.first_post_test_command !== "string") {
    return false;
  }

  return true;
};

type BadgeTone = "success" | "info" | "warn" | "error";

const BOX_WIDTH = 88;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

const colorTone = (value: string, tone: BadgeTone): string => {
  if (tone === "success") {
    return termStyle.green(value);
  }
  if (tone === "warn") {
    return termStyle.yellow(value);
  }
  if (tone === "error") {
    return termStyle.red(value);
  }
  return termStyle.cyan(value);
};

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

const stripAnsi = (value: string): string => value.replace(ANSI_PATTERN, "");

const visibleLength = (value: string): number => stripAnsi(value).length;

const padRight = (value: string, width: number): string => {
  const len = visibleLength(value);
  if (len >= width) {
    return value;
  }

  return `${value}${" ".repeat(width - len)}`;
};

const wrapLine = (line: string, width: number): string[] => {
  if (line.length === 0) {
    return [""];
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(indent.length);
  const max = Math.max(10, width - indent.length);
  const words = content.split(/\s+/).filter((word) => word.length > 0);

  if (words.length === 0) {
    return [indent];
  }

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = (): void => {
    if (current.length > 0) {
      chunks.push(`${indent}${current}`);
      current = "";
    }
  };

  for (const word of words) {
    if (word.length > max) {
      pushCurrent();
      for (let cursor = 0; cursor < word.length; cursor += max) {
        chunks.push(`${indent}${word.slice(cursor, cursor + max)}`);
      }
      continue;
    }

    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > max) {
      pushCurrent();
      current = word;
      continue;
    }

    current = next;
  }

  pushCurrent();
  return chunks;
};

const renderBox = (title: string, lines: string[], tone: BadgeTone): string => {
  const innerWidth = BOX_WIDTH - 4;
  const borderTop = `+${"=".repeat(BOX_WIDTH - 2)}+`;
  const borderMid = `+${"-".repeat(BOX_WIDTH - 2)}+`;
  const boxLines: string[] = [];

  boxLines.push(colorTone(borderTop, tone));
  boxLines.push(colorTone(`| ${padRight(termStyle.bold(title), innerWidth)} |`, tone));
  boxLines.push(colorTone(borderMid, tone));

  lines.forEach((line) => {
    const wrapped = wrapLine(line, innerWidth);
    wrapped.forEach((chunk) => {
      boxLines.push(`| ${padRight(chunk, innerWidth)} |`);
    });
  });

  boxLines.push(colorTone(borderTop, tone));
  return boxLines.join("\n");
};

const prettyOnboarding = (data: OnboardingData): string => {
  const sectionDivider = termStyle.dim("-".repeat(62));
  const titleLine = colorTone(termStyle.bold("INSTACLI ONBOARDING"), "info");
  const phaseTitles = ["PHASE 1/3 · PREPARE", "PHASE 2/3 · CONNECT", "PHASE 3/3 · VALIDATE"];
  const chunkSize = Math.max(1, Math.ceil(data.checklist.length / phaseTitles.length));
  const lines: string[] = [];
  lines.push(titleLine);
  lines.push(sectionDivider);
  lines.push("");
  lines.push(termStyle.bold("Meta BYO Onboarding"));
  lines.push(termStyle.dim("Set up credentials, then validate auth and media access."));
  lines.push("");
  lines.push(colorTone("[PHASE 1/3 · PREPARE]", "info"));
  lines.push(termStyle.bold("Resources:"));
  data.links.forEach((link, index) => {
    lines.push(`  ${index + 1}. ${link.label}: ${link.url}`);
  });
  lines.push("");
  if (Array.isArray(data.required_scopes) && data.required_scopes.length > 0) {
    lines.push(termStyle.bold("Required permissions:"));
    data.required_scopes.forEach((scope) => {
      lines.push(`  - ${termStyle.bold(scope)}`);
    });
    lines.push("");
  }

  lines.push(sectionDivider);
  lines.push("");
  lines.push(termStyle.bold("Step-by-step:"));
  phaseTitles.forEach((phaseTitle, phaseIndex) => {
    const start = phaseIndex * chunkSize;
    const end = start + chunkSize;
    const phaseItems = data.checklist.slice(start, end);
    if (phaseItems.length === 0) {
      return;
    }

    lines.push(`  ${colorTone(`[${phaseTitle}]`, "info")}`);
    phaseItems.forEach((item, index) => {
      lines.push(`    ${start + index + 1}. [ ] ${item}`);
    });
  });
  lines.push("");
  lines.push(sectionDivider);
  lines.push("");
  lines.push(colorTone("[PHASE 3/3 · VALIDATE]", "success"));
  lines.push(termStyle.bold("Run now:"));
  data.next_steps.forEach((command, index) => {
    lines.push(`  ${index + 1}. ${termStyle.bold(`$ ${command}`)}`);
  });

  if (data.opened_links) {
    lines.push("");
    lines.push(colorTone("Opened links in your browser.", "success"));
  }

  return lines.join("\n");
};

const prettyOnboardingCompleted = (data: OnboardingCompletedData): string => {
  const provider = data.provider ?? "meta-byo";
  const lines: string[] = [
    colorTone(termStyle.bold("CONFIRMED"), "success"),
    termStyle.bold(`Setup completed (${provider})`)
  ];

  if (data.configured === false) {
    lines.push(termStyle.dim("Dry-run mode: no credentials were saved."));
  } else {
    lines.push(termStyle.dim("Credentials saved. You can start using the CLI."));
  }

  if (Array.isArray(data.next_steps) && data.next_steps.length > 0) {
    lines.push("");
    lines.push(termStyle.bold("Next command:"));
    lines.push(`  ${termStyle.bold(`$ ${data.next_steps[0]}`)}`);
  }

  return lines.join("\n");
};

const prettySuccess = <T>(result: Extract<ToolResult<T>, { ok: true }>): string => {
  if (result.action === "onboarding.meta-byo" && isOnboardingData(result.data)) {
    return prettyOnboarding(result.data);
  }
  if (result.action === "onboarding.meta-byo.completed" && isOnboardingCompletedData(result.data)) {
    return prettyOnboardingCompleted(result.data);
  }

  const lines = [`${result.action} succeeded`, "", termStyle.bold("Result:"), ...formatJson(result.data).split("\n")];
  return renderBox("SUCCESS", lines, "success");
};

const prettyError = (result: Extract<ToolResult<unknown>, { ok: false }>): string => {
  const lines = [result.error.message];

  if (result.error.details !== undefined) {
    lines.push("");
    lines.push(termStyle.bold("Details:"));
    if (typeof result.error.details === "string") {
      lines.push(result.error.details);
    } else {
      lines.push(...formatJson(result.error.details).split("\n"));
    }
  }

  return renderBox(`ERROR ${result.error.code}`, lines, "error");
};

export const formatResult = <T>(result: ToolResult<T>, flags: Pick<GlobalFlags, "json" | "quiet">): string | null => {
  if (flags.quiet && !flags.json) {
    return null;
  }

  if (flags.json) {
    return JSON.stringify(result);
  }

  if (result.ok) {
    return prettySuccess(result);
  }

  return prettyError(result);
};
