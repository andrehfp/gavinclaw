import fs from "node:fs/promises";
import path from "node:path";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import readline from "node:readline/promises";
import { Command } from "commander";
import { z } from "zod";
import open from "open";
import {
  CliStore,
  createLogger,
  ERROR_CODES,
  formatResult,
  fromUnknownError,
  providerNameSchema,
  toolError,
  type GlobalFlags,
  type Provider,
  type ProviderName,
  type ToolResult
} from "@instacli/ig-core";
import { createMetaByoProvider } from "@instacli/provider-meta-byo";
import { createCentralProvider } from "@instacli/provider-central";
import { waitForOAuthCallback } from "./oauth.js";

type CommandOptions = {
  json?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
  provider?: string;
  account?: string;
};

type SetupMetaByoOptions = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  envFile?: string;
  openMeta?: boolean;
};

type SetupMetaTokenOptions = {
  discoverPages?: boolean;
  igAccountId?: string;
  pageId?: string;
  pageAccessToken?: string;
  igUsername?: string;
  userAccessToken?: string;
};

type OnboardingOptions = {
  provider?: string;
  openLinks?: boolean;
  start?: boolean;
};

type UploadFileOptions = {
  file: string;
  via?: string;
  litterboxExpiry?: string;
};

type UploadVia = "auto" | "passthrough" | "uguu" | "litterbox";

type AccountSelection = {
  accountName: string;
  source: "explicit" | "default";
};

const accountNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Use letters, numbers, ., _, -");

type UploadSource =
  | {
      kind: "https-url";
      original: string;
      normalized: string;
    }
  | {
      kind: "local-file";
      original: string;
      absolutePath: string;
      fileName: string;
      sizeBytes: number;
    };

const META_ONBOARDING_LINKS = [
  { label: "Meta App Dashboard", url: "https://developers.facebook.com/apps" },
  { label: "Graph API Explorer", url: "https://developers.facebook.com/tools/explorer/" },
  { label: "Instagram Graph API Docs", url: "https://developers.facebook.com/docs/instagram-platform" },
  { label: "Facebook Login Docs", url: "https://developers.facebook.com/docs/facebook-login" },
  { label: "Access Tokens Guide", url: "https://developers.facebook.com/docs/facebook-login/guides/access-tokens" }
] as const;

const META_ONBOARDING_CHECKLIST = [
  "Set account as Instagram Professional (Business/Creator)",
  "Connect Instagram account to a Facebook Page",
  "Generate a User Access Token in Graph API Explorer with required permissions",
  "Token-first path: run setup with discovered page_access_token + ig_account_id",
  "OAuth path (optional): configure redirect URI http://localhost:8788/callback and run ig setup meta-byo",
  "Verify with ig auth status --json --quiet"
] as const;

const META_REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement"
] as const;

const META_ONBOARDING_GUIDE_PATH = "docs/meta-onboarding-step-by-step.md";

const META_PAGE_CREATION_STEPS = [
  "1. Open Facebook and create a new Page (or pick an existing Page you manage).",
  "2. In Instagram app, make sure account type is Professional (Creator or Business).",
  "3. In Instagram settings, connect Instagram account to the Facebook Page.",
  "4. Confirm the Page is visible under your Facebook account's Pages list.",
  "5. Return to this wizard and continue with token generation/discovery."
] as const;

const UGUU_UPLOAD_URL = "https://uguu.se/upload.php";
const LITTERBOX_UPLOAD_URL = "https://litterbox.catbox.moe/resources/internals/api.php";
const DEFAULT_UPLOAD_TIMEOUT_MS = 20_000;
const uploadViaSchema = z.enum(["auto", "passthrough", "uguu", "litterbox"]);
const litterboxExpirySchema = z.enum(["1h", "12h", "24h", "72h"]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime"
};

const addToolingFlags = <T extends Command>(command: T): T =>
  command
    .option("--json", "Output strict JSON")
    .option("--quiet", "Disable human logs")
    .option("--dry-run", "Validate and show behavior without executing")
    .option("--account <account>", "Named account override");

const readFlags = (cmd: Command): GlobalFlags => {
  const options = cmd.optsWithGlobals<CommandOptions>();
  return {
    json: Boolean(options.json),
    quiet: Boolean(options.quiet),
    dryRun: Boolean(options.dryRun)
  };
};

const resolveProviderName = (store: CliStore, options: CommandOptions): ProviderName => {
  const configured = options.provider ?? store.getDefaultProvider() ?? "meta-byo";
  const parsed = providerNameSchema.safeParse(configured);
  if (!parsed.success) {
    throw new Error(`Invalid provider: ${configured}`);
  }

  return parsed.data;
};

const providerCache = new WeakMap<CliStore, Map<string, Provider>>();

const getProvider = (providerName: ProviderName, flags: GlobalFlags, store: CliStore, accountName?: string): Provider => {
  const cacheKey = `${providerName}:${accountName ?? "default"}:${flags.dryRun ? "dry" : "live"}:${flags.quiet ? "quiet" : "verbose"}`;
  const byStore = providerCache.get(store) ?? new Map<string, Provider>();
  providerCache.set(store, byStore);

  const cached = byStore.get(cacheKey);
  if (cached) {
    return cached;
  }

  const logger = createLogger(flags.quiet);
  const context = {
    store,
    logger,
    dryRun: flags.dryRun,
    accountName
  };

  const provider = providerName === "meta-byo" ? createMetaByoProvider(context) : createCentralProvider(context);
  byStore.set(cacheKey, provider);
  return provider;
};

const toMetaAccountErrorDetails = (store: CliStore): { default_account?: string; available_accounts: string[] } => {
  const accounts = Object.keys(store.getMetaByoAccounts());
  return {
    ...(store.getDefaultAccount("meta-byo") ? { default_account: store.getDefaultAccount("meta-byo") } : {}),
    available_accounts: accounts
  };
};

const normalizeConfirmUsername = (value: string): string =>
  value.trim().replace(/^@/, "").toLowerCase();

const resolveMetaAccount = (store: CliStore, requested?: string): ToolResult<AccountSelection> => {
  const parsedRequested = requested === undefined ? undefined : accountNameSchema.safeParse(requested);
  if (parsedRequested && !parsedRequested.success) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid --account value.", parsedRequested.error.flatten());
  }

  if (parsedRequested?.success) {
    if (!store.hasMetaByoAccount(parsedRequested.data)) {
      return toolError(
        ERROR_CODES.VALIDATION_ERROR,
        `Account '${parsedRequested.data}' does not exist.`,
        toMetaAccountErrorDetails(store)
      );
    }

    return {
      ok: true,
      action: "accounts.resolve",
      data: {
        accountName: parsedRequested.data,
        source: "explicit"
      }
    };
  }

  const defaultAccount = store.getDefaultAccount("meta-byo");
  if (!defaultAccount) {
    return toolError(
      ERROR_CODES.VALIDATION_ERROR,
      "No default account configured. Add one with 'instacli accounts add' or select with '--account <name>'.",
      toMetaAccountErrorDetails(store)
    );
  }

  return {
    ok: true,
    action: "accounts.resolve",
    data: {
      accountName: defaultAccount,
      source: "default"
    }
  };
};

const ensurePublishAccountGuardrails = async (
  store: CliStore,
  accountName: string,
  confirmAccount?: string
): Promise<ToolResult<{ account_name: string; ig_account_id: string; ig_username?: string }>> => {
  const profile = store.getMetaByoConfig(accountName);
  const igUserId = profile.igUserId;
  const igAccountId = profile.igAccountId ?? igUserId;

  if (!igAccountId) {
    return toolError(
      ERROR_CODES.VALIDATION_ERROR,
      `Account '${accountName}' is missing Instagram account metadata (ig_account_id).`,
      { account_name: accountName }
    );
  }

  if (profile.igUserId && profile.igAccountId && profile.igUserId !== profile.igAccountId) {
    return toolError(
      ERROR_CODES.VALIDATION_ERROR,
      `Account '${accountName}' has mismatched Instagram IDs in local config.`,
      {
        account_name: accountName,
        ig_user_id: profile.igUserId,
        ig_account_id: profile.igAccountId
      }
    );
  }

  if (confirmAccount !== undefined) {
    const normalizedConfirm = normalizeConfirmUsername(confirmAccount);
    if (normalizedConfirm.length === 0) {
      return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid --confirm-account value.");
    }

    const configuredUsername = normalizeConfirmUsername(profile.igUsername ?? "");
    if (configuredUsername.length === 0) {
      return toolError(
        ERROR_CODES.VALIDATION_ERROR,
        `Account '${accountName}' has no stored username. Set it with 'instacli accounts add --ig-username ...' before using --confirm-account.`,
        { account_name: accountName, confirm_account: confirmAccount }
      );
    }

    if (configuredUsername !== normalizedConfirm) {
      return toolError(
        ERROR_CODES.VALIDATION_ERROR,
        `Account confirmation failed for '${accountName}'.`,
        {
          account_name: accountName,
          configured_username: `@${configuredUsername}`,
          confirm_account: `@${normalizedConfirm}`
        }
      );
    }
  }

  return {
    ok: true,
    action: "publish.account.guardrails",
    data: {
      account_name: accountName,
      ig_account_id: igAccountId,
      ...(profile.igUsername ? { ig_username: profile.igUsername } : {})
    }
  };
};

const resolveProviderForCommand = (
  store: CliStore,
  flags: GlobalFlags,
  options: CommandOptions,
  needsMetaAccount: boolean
): ToolResult<{ providerName: ProviderName; provider: Provider; accountName?: string }> => {
  const providerName = resolveProviderName(store, options);
  let accountName: string | undefined;

  if (providerName === "meta-byo" && (needsMetaAccount || options.account !== undefined)) {
    const resolved = resolveMetaAccount(store, options.account);
    if (!resolved.ok) {
      return resolved;
    }
    accountName = resolved.data.accountName;
  }

  return {
    ok: true,
    action: "provider.resolve",
    data: {
      providerName,
      accountName,
      provider: getProvider(providerName, flags, store, accountName)
    }
  };
};

const emit = (result: ToolResult<unknown>, flags: Pick<GlobalFlags, "json" | "quiet">): void => {
  const output = formatResult(result, flags);
  if (output) {
    process.stdout.write(`${output}\n`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
};

const withResult = async (command: Command, fn: () => Promise<ToolResult<unknown>>): Promise<void> => {
  const flags = readFlags(command);

  try {
    const result = await fn();
    emit(result, flags);
  } catch (error) {
    emit(fromUnknownError(error), flags);
  }
};

const maskSecret = (value: string): string => {
  if (value.length <= 4) {
    return "****";
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const upsertEnvValues = (rawEnv: string, values: Record<string, string>): string => {
  const lines = rawEnv.length > 0 ? rawEnv.split(/\r?\n/) : [];

  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const nextLine = `${key}=${value}`;
    if (index >= 0) {
      lines[index] = nextLine;
    } else {
      lines.push(nextLine);
    }
  }

  const trimmed = lines.filter((line, index, all) => !(line === "" && index === all.length - 1));
  return `${trimmed.join("\n")}\n`;
};

const resolveSafeEnvFilePath = (cwd: string, envFileOption: string | undefined): ToolResult<{ envFile: string }> => {
  const candidate = (envFileOption ?? ".env").trim();
  if (candidate.length === 0 || candidate.includes("\0")) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid --env-file path.");
  }

  const resolved = path.resolve(cwd, candidate);
  const relative = path.relative(cwd, resolved);
  const isInsideCwd = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (!isInsideCwd) {
    return toolError(
      ERROR_CODES.VALIDATION_ERROR,
      "Unsafe --env-file path. Use a path inside the current working directory."
    );
  }

  return {
    ok: true,
    action: "setup.meta-byo.env-path",
    data: { envFile: resolved }
  };
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parseUploadTimeoutMs = (): number => {
  const raw = process.env.IG_UPLOAD_FETCH_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_UPLOAD_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_UPLOAD_TIMEOUT_MS;
};

const isUrlLikeInput = (value: string): boolean => /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);

const resolveUploadSource = async (file: string): Promise<ToolResult<UploadSource>> => {
  const trimmed = file.trim();
  if (trimmed.length === 0) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Upload requires a non-empty --file value.");
  }

  if (isUrlLikeInput(trimmed)) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid URL format in --file.");
    }

    if (parsedUrl.protocol !== "https:") {
      return toolError(ERROR_CODES.VALIDATION_ERROR, "Only https:// URLs are supported for direct publish/upload.", {
        provided_protocol: parsedUrl.protocol
      });
    }

    return {
      ok: true,
      action: "upload.resolve-source",
      data: {
        kind: "https-url",
        original: file,
        normalized: parsedUrl.toString()
      }
    };
  }

  const absolutePath = path.resolve(trimmed);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absolutePath);
  } catch (error) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Local file was not found.", {
      file: file,
      absolute_path: absolutePath,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  if (!stat.isFile()) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Local path must point to a file.", {
      file: file,
      absolute_path: absolutePath
    });
  }

  return {
    ok: true,
    action: "upload.resolve-source",
    data: {
      kind: "local-file",
      original: file,
      absolutePath,
      fileName: path.basename(absolutePath),
      sizeBytes: stat.size
    }
  };
};

const uploadCapabilities = (
  source: UploadSource
): { can_use_input_url: boolean; can_use_uguu: boolean; can_use_litterbox: boolean } => ({
  can_use_input_url: source.kind === "https-url",
  can_use_uguu: source.kind === "local-file",
  can_use_litterbox: source.kind === "local-file"
});

const inferMimeType = (fileName: string): string => MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";

const extractUguuUploadResult = (value: unknown): { publicUrl: string; deleteUrl?: string } | undefined => {
  if (!isObject(value)) {
    return undefined;
  }

  const files = value.files;
  if (Array.isArray(files) && files.length > 0) {
    const first = files[0];
    if (isObject(first) && typeof first.url === "string" && first.url.length > 0) {
      return {
        publicUrl: first.url,
        ...(typeof first.delete === "string" && first.delete.length > 0 ? { deleteUrl: first.delete } : {})
      };
    }
  }

  if (typeof value.url === "string" && value.url.length > 0) {
    return {
      publicUrl: value.url,
      ...(typeof value.delete === "string" && value.delete.length > 0 ? { deleteUrl: value.delete } : {})
    };
  }

  return undefined;
};

const uploadLocalFileToUguu = async (
  source: Extract<UploadSource, { kind: "local-file" }>
): Promise<ToolResult<{ public_url: string; delete_url?: string }>> => {
  let content: Buffer;
  try {
    content = await fs.readFile(source.absolutePath);
  } catch (error) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Failed to read local file for upload.", {
      file: source.original,
      absolute_path: source.absolutePath,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  const form = new FormData();
  form.append("files[]", new Blob([content], { type: inferMimeType(source.fileName) }), source.fileName);

  const timeoutMs = parseUploadTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(UGUU_UPLOAD_URL, {
      method: "POST",
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    return toolError(ERROR_CODES.NETWORK_ERROR, "Uguu upload request failed.", {
      reason: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Uguu upload failed.", {
      status: response.status,
      body
    });
  }

  const parsed = extractUguuUploadResult(body);
  if (!parsed) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Uguu upload succeeded but response did not include a URL.", {
      body
    });
  }

  return {
    ok: true,
    action: "upload.uguu",
    data: {
      public_url: parsed.publicUrl,
      ...(parsed.deleteUrl ? { delete_url: parsed.deleteUrl } : {})
    }
  };
};

const uploadLocalFileToLitterbox = async (
  source: Extract<UploadSource, { kind: "local-file" }>,
  expiry: z.infer<typeof litterboxExpirySchema>
): Promise<ToolResult<{ public_url: string; expires_in: z.infer<typeof litterboxExpirySchema> }>> => {
  let content: Buffer;
  try {
    content = await fs.readFile(source.absolutePath);
  } catch (error) {
    return toolError(ERROR_CODES.VALIDATION_ERROR, "Failed to read local file for upload.", {
      file: source.original,
      absolute_path: source.absolutePath,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  const form = new FormData();
  form.set("reqtype", "fileupload");
  form.set("time", expiry);
  form.append("fileToUpload", new Blob([content], { type: inferMimeType(source.fileName) }), source.fileName);

  const timeoutMs = parseUploadTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(LITTERBOX_UPLOAD_URL, {
      method: "POST",
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    return toolError(ERROR_CODES.NETWORK_ERROR, "Litterbox upload request failed.", {
      reason: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Litterbox upload failed.", {
      status: response.status,
      body: bodyText
    });
  }

  const trimmed = bodyText.trim();
  if (!trimmed.startsWith("https://")) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Litterbox upload succeeded but response did not include an HTTPS URL.", {
      body: bodyText
    });
  }

  return {
    ok: true,
    action: "upload.litterbox",
    data: {
      public_url: trimmed,
      expires_in: expiry
    }
  };
};

type DiscoveredMetaPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igAccountId?: string;
  igUsername?: string;
};

const graphGet = async (
  pathWithQuery: string,
  accessToken: string
): Promise<ToolResult<Record<string, unknown>>> => {
  const timeoutMsRaw = process.env.IG_SETUP_FETCH_TIMEOUT_MS;
  const timeoutMsParsed = timeoutMsRaw ? Number.parseInt(timeoutMsRaw, 10) : Number.NaN;
  const timeoutMs = Number.isInteger(timeoutMsParsed) && timeoutMsParsed > 0 ? timeoutMsParsed : 15_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const separator = pathWithQuery.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com/v20.0${pathWithQuery}${separator}access_token=${encodeURIComponent(accessToken)}`;
  let response: Response;

  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta Graph API request failed during setup discovery.", {
      status: 0,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  clearTimeout(timeout);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta Graph API request failed during setup discovery.", {
      status: response.status,
      body
    });
  }

  return {
    ok: true,
    action: "setup.meta.graph.get",
    data: body ?? {}
  };
};

const discoverMetaPages = async (userAccessToken: string): Promise<ToolResult<{ pages: DiscoveredMetaPage[] }>> => {
  const accounts = await graphGet("/me/accounts?fields=id,name,access_token", userAccessToken);
  if (!accounts.ok) {
    return accounts;
  }

  const rows = Array.isArray(accounts.data.data) ? accounts.data.data : [];
  const pages: DiscoveredMetaPage[] = [];

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }

    const pageId = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : undefined;
    const pageName =
      typeof (row as { name?: unknown }).name === "string" ? (row as { name: string }).name : "Unknown Page";
    const pageAccessToken =
      typeof (row as { access_token?: unknown }).access_token === "string"
        ? (row as { access_token: string }).access_token
        : undefined;

    if (!pageId || !pageAccessToken) {
      continue;
    }

    const pageInfo = await graphGet(`/${pageId}?fields=instagram_business_account{id,username}`, pageAccessToken);
    if (!pageInfo.ok) {
      pages.push({ pageId, pageName, pageAccessToken });
      continue;
    }

    const igNode = pageInfo.data.instagram_business_account;
    const igAccountId =
      typeof (igNode as { id?: unknown } | undefined)?.id === "string"
        ? ((igNode as { id: string }).id as string)
        : undefined;
    const igUsername =
      typeof (igNode as { username?: unknown } | undefined)?.username === "string"
        ? ((igNode as { username: string }).username as string)
        : undefined;

    pages.push({
      pageId,
      pageName,
      pageAccessToken,
      igAccountId,
      igUsername
    });
  }

  return {
    ok: true,
    action: "setup.meta.discover-pages",
    data: { pages }
  };
};

const summarizeDiscoveredPages = (
  pages: DiscoveredMetaPage[]
): Array<{ page_id: string; page_name: string; ig_account_id?: string; ig_username?: string }> =>
  pages.map((page) => ({
    page_id: page.pageId,
    page_name: page.pageName,
    ig_account_id: page.igAccountId,
    ig_username: page.igUsername
  }));

const buildMetaOnboardingData = (openedLinks: boolean, configured = false) => ({
  provider: "meta-byo",
  opened_links: openedLinks,
  links: META_ONBOARDING_LINKS,
  checklist: META_ONBOARDING_CHECKLIST,
  required_scopes: META_REQUIRED_SCOPES,
  next_steps: configured
    ? [
        "instacli auth status --json --quiet",
        "instacli media list --limit 5 --json --quiet",
        "instacli publish photo --file <PUBLIC_URL> --caption \"hello\" --json --quiet --dry-run"
      ]
    : [
        "instacli setup meta-token --discover-pages --user-access-token <YOUR_USER_ACCESS_TOKEN>",
        "instacli auth status --json --quiet",
        "instacli media list --limit 5 --json --quiet"
      ]
});

const noConnectedPageError = (discoveredPages: Array<{ page_id: string; page_name: string }>) =>
  toolError(
    ERROR_CODES.VALIDATION_ERROR,
    [
      "No Facebook page with instagram_business_account found.",
      "",
      "Fix now:",
      "1. Connect your Instagram account to a Facebook Page",
      "2. Ensure Instagram account is Professional (Business/Creator)",
      "3. Open Graph API Explorer: https://developers.facebook.com/tools/explorer/",
      "4. Generate a USER access token with scopes:",
      `   - ${META_REQUIRED_SCOPES.join(", ")}`,
      "5. Re-run:",
      "   instacli setup meta-token --discover-pages --user-access-token <YOUR_USER_ACCESS_TOKEN>"
    ].join("\n"),
    {
      links: META_ONBOARDING_LINKS,
      required_scopes: META_REQUIRED_SCOPES,
      discovered_pages: discoveredPages
    }
  );

const hasMetaTokenSetup = async (store: CliStore): Promise<boolean> => {
  const token = await store.getSecret("meta-byo", "accessToken");
  const config = store.getMetaByoConfig();
  const igId = config.igUserId ?? config.igAccountId;
  return Boolean(token && igId);
};

const promptYesNo = async (rl: readline.Interface, prompt: string, defaultYes = true): Promise<boolean> => {
  const answer = (await rl.question(prompt)).trim().toLowerCase();
  if (answer.length === 0) {
    return defaultYes;
  }

  return answer !== "n";
};

const promptRequired = async (rl: readline.Interface, prompt: string, retryMessage: string): Promise<string> => {
  while (true) {
    const value = (await rl.question(prompt)).trim();
    if (value.length > 0) {
      return value;
    }
    processStdout.write(`${retryMessage}\n`);
  }
};

const WIZARD_LINE = "=".repeat(58);
const WIZARD_SUBLINE = "-".repeat(58);

const writeWizardHeader = (title: string): void => {
  processStdout.write(`\n${WIZARD_LINE}\n`);
  processStdout.write(`${title}\n`);
  processStdout.write(`${WIZARD_LINE}\n`);
};

const writeWizardSection = (title: string): void => {
  processStdout.write(`\n${WIZARD_SUBLINE}\n`);
  processStdout.write(`${title}\n`);
  processStdout.write(`${WIZARD_SUBLINE}\n`);
};

const writeWizardPhase = (phase: 1 | 2 | 3, title: string): void => {
  processStdout.write(`\n${WIZARD_LINE}\n`);
  processStdout.write(`PHASE ${phase}/3 · ${title}\n`);
  processStdout.write(`${WIZARD_LINE}\n`);
};

const confirmStep = async (rl: readline.Interface, prompt: string, pendingHint: string): Promise<void> => {
  while (true) {
    const confirmed = await promptYesNo(rl, `${prompt} [Y/n]: `, true);
    if (confirmed) {
      return;
    }
    processStdout.write(`${pendingHint}\n`);
  }
};

const writeOnboardingProgress = (percent: number, step: string, eta: string): void => {
  const clamped = Math.max(0, Math.min(100, percent));
  const barWidth = 20;
  const filled = Math.round((clamped / 100) * barWidth);
  const bar = `${"#".repeat(filled)}${".".repeat(barWidth - filled)}`;
  processStdout.write(`\n[${bar}] ${String(clamped).padStart(3, " ")}%  ${step} (${eta})\n`);
};

const extractMetaGraphErrorCode = (details: unknown): number | undefined => {
  if (typeof details !== "object" || details === null) {
    return undefined;
  }

  const body = (details as { body?: unknown }).body;
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
};

const validateUserTokenScopes = async (
  userAccessToken: string
): Promise<ToolResult<{ granted_scopes: string[]; missing_scopes: string[] }>> => {
  const permissions = await graphGet("/me/permissions", userAccessToken);
  if (!permissions.ok) {
    return permissions;
  }

  const rows = Array.isArray(permissions.data.data) ? permissions.data.data : [];
  const granted = new Set<string>();

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }

    const permission =
      typeof (row as { permission?: unknown }).permission === "string"
        ? ((row as { permission: string }).permission as string)
        : undefined;
    const status =
      typeof (row as { status?: unknown }).status === "string"
        ? ((row as { status: string }).status as string)
        : undefined;

    if (permission && status === "granted") {
      granted.add(permission);
    }
  }

  const grantedScopes = META_REQUIRED_SCOPES.filter((scope) => granted.has(scope));
  const missingScopes = META_REQUIRED_SCOPES.filter((scope) => !granted.has(scope));

  return {
    ok: true,
    action: "setup.meta.validate-user-token-scopes",
    data: {
      granted_scopes: grantedScopes,
      missing_scopes: missingScopes
    }
  };
};

const runCreateFromScratchChecklist = async (
  rl: readline.Interface
): Promise<{ app_id_hint?: string; page_name_hint?: string }> => {
  writeOnboardingProgress(20, "Create-from-scratch checklist", "10-20 min");
  processStdout.write("Create-from-scratch mode selected.\n");

  writeWizardSection("Step 1/6 · Business Manager");
  processStdout.write("Open https://business.facebook.com/ and create/access your business account.\n");
  await confirmStep(
    rl,
    "Confirm completed: Business Manager account is ready",
    "Finish this in the browser, then confirm to continue."
  );

  writeWizardSection("Step 2/6 · Facebook Page");
  processStdout.write("Create a new Facebook Page or pick one you manage.\n");
  const pageNameHint = (await rl.question("Optional note: connected Page name (enter to skip): ")).trim();
  await confirmStep(rl, "Confirm completed: Facebook Page is ready", "Create/select the Page first, then confirm.");

  writeWizardSection("Step 3/6 · Instagram Professional Account");
  processStdout.write("In Instagram settings, switch to Professional (Creator or Business).\n");
  await confirmStep(
    rl,
    "Confirm completed: Instagram account is Professional",
    "Switch account type first, then confirm."
  );

  writeWizardSection("Step 4/6 · Connect Instagram To Facebook Page");
  processStdout.write("Connect your Instagram account to the Facebook Page.\n");
  await confirmStep(
    rl,
    "Confirm completed: Instagram is connected to the Page",
    "Complete the linkage in Instagram/Facebook first, then confirm."
  );

  writeWizardSection("Step 5/6 · Create Meta App");
  processStdout.write("Open https://developers.facebook.com/apps and create a Business app.\n");
  const appIdHint = (await rl.question("Optional note: Meta App ID (enter to skip): ")).trim();
  await confirmStep(
    rl,
    "Confirm completed: Meta app is created",
    "Create the app first, then confirm."
  );

  writeWizardSection("Step 6/6 · Required Graph API Permissions");
  META_REQUIRED_SCOPES.forEach((scope) => {
    processStdout.write(`- ${scope}\n`);
  });
  await confirmStep(
    rl,
    "Confirm completed: you can request all required permissions",
    "Check permission list above in Graph API Explorer, then confirm."
  );
  processStdout.write("Great. Next step is token generation and automatic discovery.\n");

  return {
    ...(appIdHint.length > 0 ? { app_id_hint: appIdHint } : {}),
    ...(pageNameHint.length > 0 ? { page_name_hint: pageNameHint } : {})
  };
};

const runGuidedMetaOnboarding = async (
  store: CliStore,
  flags: GlobalFlags,
  openLinks: boolean
): Promise<ToolResult<unknown>> => {
  if (openLinks && !flags.dryRun) {
    for (const link of META_ONBOARDING_LINKS) {
      await open(link.url);
    }
  }

  const rl = readline.createInterface({
    input: processStdin,
    output: processStdout
  });

  try {
    writeWizardHeader("INSTACLI SETUP WIZARD :: META BYO");
    writeWizardPhase(1, "PREPARE");
    writeWizardSection("Before You Begin");
    processStdout.write("Prerequisite: your Instagram account must be Professional (Creator or Business).\n");
    processStdout.write(`Detailed guide: ${META_ONBOARDING_GUIDE_PATH}\n`);
    processStdout.write("\nRequired permissions:\n");
    META_REQUIRED_SCOPES.forEach((scope) => {
      processStdout.write(`- ${scope}\n`);
    });
    writeWizardSection("Choose Setup Path");
    processStdout.write("1. I already have a Meta app\n");
    processStdout.write("2. Create from scratch\n");
    writeOnboardingProgress(10, "Choose setup path", "30 sec");
    const pathChoiceRaw = (await rl.question("Select 1 or 2 [2]: ")).trim();
    const onboardingPath = pathChoiceRaw === "1" ? "already-have-app" : "create-from-scratch";
    let onboardingHints: { app_id_hint?: string; page_name_hint?: string } = {};

    if (onboardingPath === "create-from-scratch") {
      const hints = await runCreateFromScratchChecklist(rl);
      onboardingHints = hints;
      processStdout.write(`Open now in terminal: cat ${META_ONBOARDING_GUIDE_PATH}\n`);
    } else {
      const hasPage = await promptYesNo(
        rl,
        "\nDo you already have a Facebook Page connected to this Instagram account? [Y/n]: ",
        true
      );
      if (!hasPage) {
        writeOnboardingProgress(45, "Connect Instagram to Facebook Page", "2-5 min");
        META_PAGE_CREATION_STEPS.forEach((step) => {
          processStdout.write(`${step}\n`);
        });
        const pageHint = (await rl.question("Optional note: connected Page name (enter to skip): ")).trim();
        if (pageHint.length > 0) {
          onboardingHints.page_name_hint = pageHint;
        }
        await confirmStep(
          rl,
          "Confirm completed: Instagram is connected to a Facebook Page",
          "Complete page linkage first, then confirm."
        );
      }
    }

    const explorerUrl = "https://developers.facebook.com/tools/explorer/";
    writeWizardPhase(2, "CONNECT");
    writeOnboardingProgress(70, "Generate and validate USER token", "2-5 min");
    writeWizardSection("Generate USER Access Token");
    processStdout.write(`Link: ${explorerUrl}\n`);
    processStdout.write("1. Select your Meta app.\n");
    processStdout.write("2. Add permissions:\n");
    META_REQUIRED_SCOPES.forEach((scope) => {
      processStdout.write(`   - ${scope}\n`);
    });
    processStdout.write("3. Choose User Token and click Generate Access Token.\n");
    processStdout.write("4. Complete login and paste the token here.\n");

    if (!openLinks && !flags.dryRun) {
      const openExplorerAnswer = (await rl.question("\nOpen Graph API Explorer now? [Y/n]: ")).trim().toLowerCase();
      if (openExplorerAnswer !== "n") {
        await open(explorerUrl);
        processStdout.write("Opened Graph API Explorer in your browser.\n");
      }
    }

    let tokenAnswer = "";
    let discoveredPagesAll: Array<{ page_id: string; page_name: string; ig_account_id?: string; ig_username?: string }> = [];
    let discoveredPageOptions: Array<{ page_id: string; page_name: string; ig_account_id?: string; ig_username?: string }> = [];
    let candidates: DiscoveredMetaPage[] = [];

    tokenLoop: while (true) {
      tokenAnswer = await promptRequired(
        rl,
        "\nPaste your USER access token (from Graph API Explorer): ",
        "User access token is required to continue onboarding."
      );

      processStdout.write("Validating scopes in token... ");
      const scopeValidation = await validateUserTokenScopes(tokenAnswer);
      if (!scopeValidation.ok) {
        processStdout.write("failed.\n");
        const metaErrorCode = extractMetaGraphErrorCode(scopeValidation.error.details);
        if (metaErrorCode === 190) {
          processStdout.write("Tip: error 190 means invalid/expired token. Generate a fresh USER token and retry.\n");
        }
        const retryToken = await promptYesNo(rl, "Do you want to paste another token now? [Y/n]: ", true);
        if (!retryToken) {
          return scopeValidation;
        }
        continue;
      }

      if (scopeValidation.data.missing_scopes.length > 0) {
        processStdout.write("missing scopes.\n");
        processStdout.write("Missing required permissions:\n");
        scopeValidation.data.missing_scopes.forEach((scope) => {
          processStdout.write(`- ${scope}\n`);
        });
        processStdout.write("You are close. Add missing scopes in Graph API Explorer and generate a new token.\n");
        const retryToken = await promptYesNo(rl, "Paste a new token with all required scopes? [Y/n]: ", true);
        if (!retryToken) {
          return toolError(ERROR_CODES.VALIDATION_ERROR, "User token missing required Meta permissions.", {
            required_scopes: META_REQUIRED_SCOPES,
            missing_scopes: scopeValidation.data.missing_scopes
          });
        }
        continue;
      }
      processStdout.write("ok.\n");
      processStdout.write("Token validated.\n");

      while (true) {
        writeOnboardingProgress(85, "Auto-discover Page + IG ID + Page Token", "5-20 sec");
        const discovered = await discoverMetaPages(tokenAnswer);
        if (!discovered.ok) {
          const metaErrorCode = extractMetaGraphErrorCode(discovered.error.details);
          if (metaErrorCode === 190) {
            processStdout.write("Meta returned error 190 during discovery. Token likely expired.\n");
            continue tokenLoop;
          }

          const retryDiscovery = await promptYesNo(rl, "Discovery failed. Retry now? [Y/n]: ", true);
          if (retryDiscovery) {
            continue;
          }
          return discovered;
        }

        candidates = discovered.data.pages.filter((page) => page.igAccountId);
        discoveredPageOptions = summarizeDiscoveredPages(candidates);
        discoveredPagesAll = summarizeDiscoveredPages(discovered.data.pages);

        if (candidates.length > 0) {
          break tokenLoop;
        }

        processStdout.write("\nNo Page with instagram_business_account found yet.\n");
        processStdout.write("This often takes 2-5 minutes after linking Instagram <-> Page.\n");
        META_PAGE_CREATION_STEPS.forEach((step) => {
          processStdout.write(`${step}\n`);
        });
        processStdout.write("Tip: if you see OAuth error 190 later, regenerate the USER token.\n");
        processStdout.write("Fix linkage and retry discovery.\n");
        const retryAfterFix = await promptYesNo(rl, "Retry discovery now? [Y/n]: ", true);
        if (!retryAfterFix) {
          return noConnectedPageError(
            discoveredPagesAll.map((page) => ({ page_id: page.page_id, page_name: page.page_name }))
          );
        }
      }
    }

    let selected: DiscoveredMetaPage | undefined;
    let selectionMode: "auto" | "interactive" = "auto";

    if (candidates.length === 1) {
      const onlyCandidate = candidates[0];
      if (onlyCandidate) {
        selected = onlyCandidate;
        processStdout.write(
          `\nFound one page with Instagram account: ${onlyCandidate.pageName} (page_id=${onlyCandidate.pageId}, ig_account_id=${onlyCandidate.igAccountId})\n`
        );
      }
    } else {
      selectionMode = "interactive";
      writeWizardSection("Choose Page To Use");
      candidates.forEach((candidate, index) => {
        processStdout.write(
          `${index + 1}. ${candidate.pageName} (page_id=${candidate.pageId}, ig_account_id=${candidate.igAccountId}, ig_username=${candidate.igUsername ?? "n/a"})\n`
        );
      });

      const pickAnswer = (await rl.question("Pick by number: ")).trim();
      const pickIndex = Number.parseInt(pickAnswer, 10);
      if (Number.isInteger(pickIndex) && pickIndex >= 1 && pickIndex <= candidates.length) {
        selected = candidates[pickIndex - 1];
      }
    }

    if (!selected || !selected.igAccountId) {
      return toolError(
        ERROR_CODES.VALIDATION_ERROR,
        "Could not determine selected page/account. Re-run onboarding and choose a valid option."
      );
    }

    writeWizardPhase(3, "VALIDATE");

    if (!flags.dryRun) {
      await store.setSecret("meta-byo", "accessToken", selected.pageAccessToken);
      store.setMetaByoConfig({
        hasAccessToken: true,
        igUserId: selected.igAccountId,
        igAccountId: selected.igAccountId,
        igUsername: selected.igUsername
      });
      store.setDefaultProvider("meta-byo");
    }

    let authStatusValidated = false;
    let mediaListValidated = false;
    if (!flags.dryRun) {
      writeOnboardingProgress(95, "Running real validation checks", "5-15 sec");
      const smokeProvider = getProvider("meta-byo", { ...flags, dryRun: false, quiet: true }, store);
      const authStatus = await smokeProvider.auth.status();
      authStatusValidated = authStatus.ok && authStatus.data.authenticated;
      const mediaList = await smokeProvider.media.list({ limit: 1 });
      mediaListValidated = mediaList.ok;
    }

    const connectionValidated = flags.dryRun ? false : authStatusValidated && mediaListValidated;
    const publishTestCommand = "instacli publish photo --file <PUBLIC_URL> --caption \"first test\" --json --quiet --dry-run";
    if (connectionValidated) {
      writeWizardSection("Validation Result");
      processStdout.write("Connection validated.\n");
      processStdout.write(`Account ready: @${selected.igUsername ?? "username"}\n`);
      processStdout.write(`First post test: ${publishTestCommand}\n`);
    }

    return {
      ok: true,
      action: "onboarding.meta-byo.completed",
      data: {
        configured: !flags.dryRun,
        provider: "meta-byo",
        selection: {
          mode: selectionMode,
          page_id: selected.pageId
        },
        onboarding_path: onboardingPath,
        onboarding_hints: onboardingHints,
        validation: {
          auth_status: authStatusValidated,
          media_list: mediaListValidated,
          connection_validated: connectionValidated
        },
        profile: {
          ig_account_id: selected.igAccountId,
          ig_username: selected.igUsername,
          page_access_token: maskSecret(selected.pageAccessToken)
        },
        discovered_pages: discoveredPageOptions,
        first_post_test_command: publishTestCommand,
        next_steps: [
          "instacli auth status --json --quiet",
          "instacli media list --limit 5 --json --quiet",
          publishTestCommand
        ]
      }
    } as const;
  } finally {
    rl.close();
  }
};



type ParsedMediaItem = {
  id: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
};

type ParsedCommentReply = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
};

type ParsedCommentItem = {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  replies: ParsedCommentReply[];
};

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const parseMediaItem = (value: unknown): ParsedMediaItem | undefined => {
  if (!isObject(value) || typeof value.id !== "string") {
    return undefined;
  }

  return {
    id: value.id,
    ...(typeof value.permalink === "string" ? { permalink: value.permalink } : {}),
    ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
    ...(typeof value.timestamp === "string" ? { timestamp: value.timestamp } : {})
  };
};

const parseCommentReply = (value: unknown): ParsedCommentReply | undefined => {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.text === "string" ? { text: value.text } : {}),
    ...(typeof value.username === "string" ? { username: value.username } : {}),
    ...(typeof value.timestamp === "string" ? { timestamp: value.timestamp } : {})
  };
};

const parseRepliesCollection = (value: unknown): ParsedCommentReply[] => {
  if (Array.isArray(value)) {
    return value.map((item) => parseCommentReply(item)).filter((item): item is ParsedCommentReply => Boolean(item));
  }

  if (isObject(value) && Array.isArray(value.data)) {
    return value.data
      .map((item) => parseCommentReply(item))
      .filter((item): item is ParsedCommentReply => Boolean(item));
  }

  return [];
};

const parseCommentItem = (value: unknown): ParsedCommentItem | undefined => {
  if (!isObject(value) || typeof value.id !== "string") {
    return undefined;
  }

  return {
    id: value.id,
    text: typeof value.text === "string" ? value.text : "",
    ...(typeof value.username === "string" ? { username: value.username } : {}),
    ...(typeof value.timestamp === "string" ? { timestamp: value.timestamp } : {}),
    replies: parseRepliesCollection(value.replies)
  };
};

const hasOwnerReply = (comment: ParsedCommentItem, ownerUsername?: string): boolean => {
  if (ownerUsername) {
    const normalizedOwner = ownerUsername.toLowerCase();
    return comment.replies.some((reply) => typeof reply.username === "string" && reply.username.toLowerCase() === normalizedOwner);
  }

  return comment.replies.length > 0;
};

const shortText = (value: string, max = 140): string => {
  const text = normalizeText(value);
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const buildReplySuggestions = (commentText: string, toneHint?: string): string[] => {
  const normalizedComment = normalizeText(commentText);
  const isQuestion = normalizedComment.includes("?");
  const hasThanks = /\b(thanks?|obrigad[oa]s?)\b/i.test(normalizedComment);
  const handle = toneHint ? `@${toneHint.replace(/^@+/, "")}` : undefined;

  const base = hasThanks
    ? [
        "you’re so welcome! really appreciate you taking the time to comment 💛",
        "love this feedback — thank you for being here!",
        "means a lot, thank you for the support ✨"
      ]
    : isQuestion
      ? [
          "great question! happy to share more details if helpful 🙌",
          "love that you asked — i can break this down for you.",
          "thanks for asking! i’ll share a clear answer right here 👇"
        ]
      : [
          "thank you so much! really glad this resonated with you 💛",
          "love this — appreciate you sharing that!",
          "so happy you liked it, thanks for the support ✨"
        ];

  return base
    .map((line, index) => {
      if (index === 0 && handle) {
        return shortText(`${line} (${handle})`);
      }

      return shortText(line);
    })
    .slice(0, 3);
};

const toNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const toSafeNumber = (value: unknown): number => toNumber(value) ?? 0;
const toTimestampMs = (value?: string): number => {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
};

const createProgram = (): Command => {
  const store = new CliStore();

  const program = new Command();
  program.name("instacli").description("Instagram agent CLI").showHelpAfterError();

  addToolingFlags(
    program
      .command("onboarding")
      .description("Show onboarding checklist and useful links")
      .option("--provider <provider>", "Onboarding provider (currently: meta-byo)", "meta-byo")
      .option("--open-links", "Open official onboarding links in your browser")
      .option("--no-start", "Only print onboarding checklist without interactive setup")
      .action(async (options: OnboardingOptions, command: Command) => {
        await withResult(command, async () => {
          const flags = readFlags(command);
          const provider = options.provider ?? "meta-byo";

          if (provider !== "meta-byo") {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Supported onboarding provider is currently meta-byo only.");
          }

          const shouldStart =
            options.start !== false && !flags.json && !flags.quiet && processStdin.isTTY && processStdout.isTTY;
          const shouldOpenLinks = Boolean(options.openLinks);

          if (shouldStart) {
            return runGuidedMetaOnboarding(store, flags, shouldOpenLinks);
          }

          if (shouldOpenLinks && !flags.dryRun) {
            for (const link of META_ONBOARDING_LINKS) {
              await open(link.url);
            }
          }

          return {
            ok: true,
            action: "onboarding.meta-byo",
            data: buildMetaOnboardingData(shouldOpenLinks && !flags.dryRun, await hasMetaTokenSetup(store))
          } as const;
        });
      })
  );

  const setup = program.command("setup").description("Guided setup helpers");

  addToolingFlags(
    setup
      .command("meta-token")
      .description("Configure Meta BYO using ig_account_id + page_access_token (no redirect URI)")
      .option("--discover-pages", "Discover Page + IG account options from a User Access Token")
      .option("--user-access-token <token>", "User Access Token used for page discovery")
      .option("--page-id <id>", "Select a specific Facebook Page ID when multiple candidates exist")
      .option("--ig-account-id <id>", "Instagram Business Account ID")
      .option("--page-access-token <token>", "Facebook Page Access Token")
      .option("--ig-username <username>", "Instagram username (optional)")
      .action(async (options: SetupMetaTokenOptions, command: Command) => {
        await withResult(command, async () => {
          const flags = readFlags(command);

          let igAccountId = options.igAccountId;
          let pageAccessToken = options.pageAccessToken;
          let igUsername = options.igUsername;
          let userAccessToken = options.userAccessToken;
          let discoveredPageOptions: Array<{ page_id: string; page_name: string; ig_account_id?: string; ig_username?: string }> = [];
          let selection: { mode: "manual" | "interactive" | "auto" | "page-id"; page_id?: string } = { mode: "manual" };

          const canPrompt = processStdin.isTTY && processStdout.isTTY && !flags.json && !flags.quiet;
          const needsTokenSetup = !igAccountId || !pageAccessToken;

          let shouldDiscover = Boolean(options.discoverPages);
          if (canPrompt && needsTokenSetup) {
            const rl = readline.createInterface({
              input: processStdin,
              output: processStdout
            });
            try {
              const discoverAnswer = (await rl.question("Auto-discover page/IG options from a User Access Token? [Y/n]: "))
                .trim()
                .toLowerCase();
              shouldDiscover = discoverAnswer !== "n";

              if (shouldDiscover && !userAccessToken) {
                const suggestedToken = await store.getSecret("meta-byo", "accessToken");
                const tokenAnswer = (
                  await rl.question(
                    suggestedToken
                      ? "User Access Token (leave empty to use saved token): "
                      : "User Access Token (--user-access-token): "
                  )
                ).trim();
                userAccessToken = tokenAnswer.length > 0 ? tokenAnswer : suggestedToken;
              }

              if (shouldDiscover && userAccessToken) {
                const discovered = await discoverMetaPages(userAccessToken);
                if (!discovered.ok) {
                  return discovered;
                }

                const candidates = discovered.data.pages.filter((page) => page.igAccountId);
                discoveredPageOptions = candidates.map((page) => ({
                  page_id: page.pageId,
                  page_name: page.pageName,
                  ig_account_id: page.igAccountId,
                  ig_username: page.igUsername
                }));
                const discoveredPagesAll = summarizeDiscoveredPages(discovered.data.pages);

                if (candidates.length === 0) {
                  return noConnectedPageError(
                    discoveredPagesAll.map((page) => ({ page_id: page.page_id, page_name: page.page_name }))
                  );
                }

                let selected = options.pageId ? candidates.find((page) => page.pageId === options.pageId) : undefined;
                if (!selected && candidates.length === 1) {
                  const onlyCandidate = candidates[0];
                  if (onlyCandidate) {
                    selected = onlyCandidate;
                    selection = { mode: "auto", page_id: onlyCandidate.pageId };
                  }
                }

                if (!selected && candidates.length > 1) {
                  processStdout.write("\nDiscovered pages with Instagram accounts:\n");
                  candidates.forEach((candidate, index) => {
                    processStdout.write(
                      `${index + 1}. ${candidate.pageName} (page_id=${candidate.pageId}, ig_account_id=${candidate.igAccountId}, ig_username=${candidate.igUsername ?? "n/a"})\n`
                    );
                  });

                  const pickAnswer = (await rl.question("Choose one by number: ")).trim();
                  const pickIndex = Number.parseInt(pickAnswer, 10);
                  if (Number.isInteger(pickIndex) && pickIndex >= 1 && pickIndex <= candidates.length) {
                    const pickedCandidate = candidates[pickIndex - 1];
                    if (pickedCandidate) {
                      selected = pickedCandidate;
                      selection = { mode: "interactive", page_id: pickedCandidate.pageId };
                    }
                  }
                }

                if (selected) {
                  igAccountId = igAccountId ?? selected.igAccountId;
                  pageAccessToken = pageAccessToken ?? selected.pageAccessToken;
                  igUsername = igUsername ?? selected.igUsername;
                  if (options.pageId && selection.mode === "manual") {
                    selection = { mode: "page-id", page_id: selected.pageId };
                  }
                }
              }

              if (!igAccountId) {
                const idAnswer = (await rl.question("Instagram Business Account ID (--ig-account-id): ")).trim();
                if (idAnswer.length > 0) {
                  igAccountId = idAnswer;
                }
              }

              if (!pageAccessToken) {
                const pageTokenAnswer = (await rl.question("Facebook Page Access Token (--page-access-token): ")).trim();
                if (pageTokenAnswer.length > 0) {
                  pageAccessToken = pageTokenAnswer;
                }
              }

              if (!igUsername) {
                const usernameAnswer = (await rl.question("Instagram username (optional): ")).trim();
                if (usernameAnswer.length > 0) {
                  igUsername = usernameAnswer;
                }
              }
            } finally {
              rl.close();
            }
          }

          if (!canPrompt && shouldDiscover && (!igAccountId || !pageAccessToken)) {
            if (!userAccessToken) {
              return toolError(
                ERROR_CODES.VALIDATION_ERROR,
                "Discovery requires --user-access-token (or run interactively to use saved token)."
              );
            }

            const discovered = await discoverMetaPages(userAccessToken);
            if (!discovered.ok) {
              return discovered;
            }

            const candidates = discovered.data.pages.filter((page) => page.igAccountId);
            discoveredPageOptions = summarizeDiscoveredPages(candidates);
            const discoveredPagesAll = summarizeDiscoveredPages(discovered.data.pages);

            if (candidates.length === 0) {
              return noConnectedPageError(
                discoveredPagesAll.map((page) => ({ page_id: page.page_id, page_name: page.page_name }))
              );
            }

            if (!options.pageId && candidates.length > 1 && !igAccountId && !pageAccessToken) {
              return toolError(
                ERROR_CODES.VALIDATION_ERROR,
                "Multiple pages discovered. Pass --page-id to choose one candidate.",
                {
                  pages: discoveredPageOptions,
                  suggested_commands: candidates.map(
                    (candidate) =>
                      `instacli setup meta-token --discover-pages --user-access-token <TOKEN> --page-id ${candidate.pageId} --json --quiet`
                  )
                }
              );
            }

            const selected = options.pageId ? candidates.find((page) => page.pageId === options.pageId) : candidates[0];
            if (!selected) {
              return toolError(ERROR_CODES.VALIDATION_ERROR, "Provided --page-id was not found in discovered pages.", {
                page_id: options.pageId,
                pages: discoveredPageOptions,
                available_page_ids: candidates.map((candidate) => candidate.pageId)
              });
            }

            igAccountId = igAccountId ?? selected.igAccountId;
            pageAccessToken = pageAccessToken ?? selected.pageAccessToken;
            igUsername = igUsername ?? selected.igUsername;
            selection = options.pageId ? { mode: "page-id", page_id: selected.pageId } : { mode: "auto", page_id: selected.pageId };
          }

          const parsed = z
            .object({
              igAccountId: z.string().trim().min(1),
              pageAccessToken: z.string().trim().min(1),
              igUsername: z.string().trim().min(1).optional()
            })
            .safeParse({
              igAccountId,
              pageAccessToken,
              igUsername
            });

          if (!parsed.success) {
            return toolError(
              ERROR_CODES.VALIDATION_ERROR,
              "Missing required fields. Pass --ig-account-id and --page-access-token (or run interactively).",
              parsed.error.flatten()
            );
          }

          if (!flags.dryRun) {
            await store.setSecret("meta-byo", "accessToken", parsed.data.pageAccessToken);
            store.setMetaByoConfig({
              hasAccessToken: true,
              igUserId: parsed.data.igAccountId,
              igAccountId: parsed.data.igAccountId,
              igUsername: parsed.data.igUsername
            });
            store.setDefaultProvider("meta-byo");
          }

          return {
            ok: true,
            action: "setup.meta-token",
            data: {
              wrote: !flags.dryRun,
              provider: "meta-byo",
              profile: {
                ig_account_id: parsed.data.igAccountId,
                ig_username: parsed.data.igUsername,
                page_access_token: maskSecret(parsed.data.pageAccessToken)
              },
              discovered_pages: discoveredPageOptions,
              selection,
              next_steps: [
                "instacli auth status --json --quiet",
                "instacli media list --json --quiet --dry-run"
              ]
            }
          } as const;
        });
      })
  );

  addToolingFlags(
    setup
      .command("meta-byo")
      .description("Configure Meta BYO credentials and write/update local .env")
      .option("--client-id <id>", "Meta App ID (IG_META_CLIENT_ID)")
      .option("--client-secret <secret>", "Meta App Secret (IG_META_CLIENT_SECRET)")
      .option("--redirect-uri <uri>", "OAuth redirect URI", "http://localhost:8788/callback")
      .option("--env-file <path>", "Path to env file", ".env")
      .option("--open-meta", "Open Meta dashboard pages in your browser")
      .action(async (options: SetupMetaByoOptions, command: Command) => {
        await withResult(command, async () => {
          const flags = readFlags(command);
          let clientId = options.clientId;
          let clientSecret = options.clientSecret;
          let redirectUri = options.redirectUri ?? "http://localhost:8788/callback";

          const canPrompt = processStdin.isTTY && processStdout.isTTY && !flags.json && !flags.quiet;
          if (canPrompt && (!clientId || !clientSecret || !redirectUri)) {
            const rl = readline.createInterface({
              input: processStdin,
              output: processStdout
            });
            try {
              const appIdAnswer = (await rl.question("Meta App ID (IG_META_CLIENT_ID): ")).trim();
              if (!clientId && appIdAnswer.length > 0) {
                clientId = appIdAnswer;
              }

              const appSecretAnswer = (await rl.question("Meta App Secret (IG_META_CLIENT_SECRET): ")).trim();
              if (!clientSecret && appSecretAnswer.length > 0) {
                clientSecret = appSecretAnswer;
              }

              const redirectAnswer = (
                await rl.question(`Redirect URI (IG_META_REDIRECT_URI) [${redirectUri}]: `)
              ).trim();
              if (redirectAnswer.length > 0) {
                redirectUri = redirectAnswer;
              }
            } finally {
              rl.close();
            }
          }

          const parsed = z
            .object({
              clientId: z.string().trim().min(1),
              clientSecret: z.string().trim().min(1),
              redirectUri: z.string().trim().url()
            })
            .safeParse({
              clientId,
              clientSecret,
              redirectUri
            });

          if (!parsed.success) {
            return toolError(
              ERROR_CODES.VALIDATION_ERROR,
              "Missing or invalid setup fields. Pass --client-id, --client-secret and --redirect-uri (or run interactively).",
              parsed.error.flatten()
            );
          }

          const envPath = resolveSafeEnvFilePath(process.cwd(), options.envFile);
          if (!envPath.ok) {
            return envPath;
          }
          const envFile = envPath.data.envFile;

          if (!flags.dryRun) {
            const currentEnv = await fs
              .readFile(envFile, "utf8")
              .catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? "" : Promise.reject(error)));

            const nextEnv = upsertEnvValues(currentEnv, {
              IG_META_CLIENT_ID: parsed.data.clientId,
              IG_META_CLIENT_SECRET: parsed.data.clientSecret,
              IG_META_REDIRECT_URI: parsed.data.redirectUri
            });

            await fs.writeFile(envFile, nextEnv, "utf8");
            store.setDefaultProvider("meta-byo");

            if (options.openMeta) {
              await open("https://developers.facebook.com/apps");
              await open("https://developers.facebook.com/apps/?show_reminder=0");
            }
          }

          return {
            ok: true,
            action: "setup.meta-byo",
            data: {
              env_file: envFile,
              wrote: !flags.dryRun,
              provider: "meta-byo",
              open_meta: Boolean(options.openMeta),
              env: {
                IG_META_CLIENT_ID: parsed.data.clientId,
                IG_META_CLIENT_SECRET: maskSecret(parsed.data.clientSecret),
                IG_META_REDIRECT_URI: parsed.data.redirectUri
              },
              next_steps: [
                "instacli auth login --provider meta-byo",
                "instacli auth status --json --quiet"
              ]
            }
          } as const;
        });
      })
  );

  const config = program.command("config").description("Configuration commands");

  addToolingFlags(
    config
      .command("set")
      .description("Set config values")
      .argument("key", "config key")
      .argument("value", "config value")
      .action(async (key: string, value: string, _options: CommandOptions, command: Command) => {
        await withResult(command, async () => {
          if (key !== "provider") {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Only provider can be set via instacli config set");
          }

          const parsed = providerNameSchema.safeParse(value);
          if (!parsed.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Provider must be meta-byo or central");
          }

          store.setDefaultProvider(parsed.data);
          return {
            ok: true,
            action: "config.set",
            data: {
              key,
              value: parsed.data
            }
          } as const;
        });
      })
  );

  const accounts = program.command("accounts").description("Named account management");

  addToolingFlags(
    accounts.command("list").description("List configured accounts").action(async (_options: CommandOptions, command: Command) => {
      await withResult(command, async () => {
        const accountEntries = Object.entries(store.getMetaByoAccounts());
        const defaultAccount = store.getDefaultAccount("meta-byo");

        const items = await Promise.all(
          accountEntries.map(async ([name, profile]) => {
            const accessToken = await store.getSecret("meta-byo", "accessToken", name);
            return {
              name,
              is_default: defaultAccount === name,
              has_access_token: Boolean(accessToken),
              ig_account_id: profile.igAccountId ?? profile.igUserId,
              ig_username: profile.igUsername
            };
          })
        );

        return {
          ok: true,
          action: "accounts.list",
          data: {
            default_account: defaultAccount,
            items
          }
        } as const;
      });
    })
  );

  addToolingFlags(
    accounts
      .command("show")
      .description("Show account metadata")
      .argument("[name]", "Account name")
      .action(async (name: string | undefined, _options: CommandOptions, command: Command) => {
        await withResult(command, async () => {
          const resolved = resolveMetaAccount(store, name);
          if (!resolved.ok) {
            return resolved;
          }

          const accountName = resolved.data.accountName;
          const profile = store.getMetaByoConfig(accountName);
          const accessToken = await store.getSecret("meta-byo", "accessToken", accountName);

          return {
            ok: true,
            action: "accounts.show",
            data: {
              account_name: accountName,
              is_default: store.getDefaultAccount("meta-byo") === accountName,
              has_access_token: Boolean(accessToken),
              profile: {
                ig_account_id: profile.igAccountId ?? profile.igUserId,
                ig_user_id: profile.igUserId,
                ig_username: profile.igUsername,
                has_access_token: profile.hasAccessToken ?? Boolean(accessToken),
                has_refresh_token: profile.hasRefreshToken ?? false
              }
            }
          } as const;
        });
      })
  );

  addToolingFlags(
    accounts
      .command("add")
      .description("Add/update a named account")
      .requiredOption("--name <name>", "Account name")
      .requiredOption("--ig-account-id <id>", "Instagram account id")
      .requiredOption("--page-access-token <token>", "Facebook Page Access Token")
      .option("--ig-username <username>", "Instagram username")
      .option("--use", "Set this account as default")
      .action(
        async (
          options: {
            name: string;
            igAccountId: string;
            pageAccessToken: string;
            igUsername?: string;
            use?: boolean;
          },
          command: Command
        ) => {
          await withResult(command, async () => {
            const parsed = z
              .object({
                name: accountNameSchema,
                igAccountId: z.string().trim().min(1),
                pageAccessToken: z.string().trim().min(1),
                igUsername: z.string().trim().min(1).optional(),
                use: z.boolean().optional()
              })
              .safeParse(options);
            if (!parsed.success) {
              return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid accounts add payload.", parsed.error.flatten());
            }

            const flags = readFlags(command);
            if (!flags.dryRun) {
              store.setMetaByoConfig(
                {
                  hasAccessToken: true,
                  igUserId: parsed.data.igAccountId,
                  igAccountId: parsed.data.igAccountId,
                  igUsername: parsed.data.igUsername
                },
                parsed.data.name
              );
              await store.setSecret("meta-byo", "accessToken", parsed.data.pageAccessToken, parsed.data.name);
              store.setDefaultProvider("meta-byo");

              if (parsed.data.use || !store.getDefaultAccount("meta-byo")) {
                store.setDefaultAccount(parsed.data.name, "meta-byo");
              }
            }

            return {
              ok: true,
              action: "accounts.add",
              data: {
                wrote: !flags.dryRun,
                account_name: parsed.data.name,
                set_as_default: Boolean(parsed.data.use),
                profile: {
                  ig_account_id: parsed.data.igAccountId,
                  ig_username: parsed.data.igUsername,
                  page_access_token: maskSecret(parsed.data.pageAccessToken)
                }
              }
            } as const;
          });
        }
      )
  );

  addToolingFlags(
    accounts
      .command("use")
      .description("Set default account")
      .argument("<name>", "Account name")
      .action(async (name: string, _options: CommandOptions, command: Command) => {
        await withResult(command, async () => {
          const parsedName = accountNameSchema.safeParse(name);
          if (!parsedName.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid account name.", parsedName.error.flatten());
          }

          if (!store.hasMetaByoAccount(parsedName.data)) {
            return toolError(
              ERROR_CODES.VALIDATION_ERROR,
              `Account '${parsedName.data}' does not exist.`,
              toMetaAccountErrorDetails(store)
            );
          }

          const flags = readFlags(command);
          if (!flags.dryRun) {
            store.setDefaultAccount(parsedName.data, "meta-byo");
          }

          return {
            ok: true,
            action: "accounts.use",
            data: {
              wrote: !flags.dryRun,
              default_account: parsedName.data
            }
          } as const;
        });
      })
  );

  const upload = program.command("upload").description("Upload/resolve media into a public HTTPS URL");

  addToolingFlags(
    upload
      .command("file")
      .description("Resolve local file path or HTTPS URL to a publishable public URL")
      .requiredOption("--file <file>", "Public HTTPS URL or local file path")
      .option("--via <via>", "Upload strategy: auto|passthrough|uguu|litterbox", "auto")
      .option("--litterbox-expiry <expiry>", "Litterbox lifetime: 1h|12h|24h|72h", "1h")
      .action(async (options: UploadFileOptions, command: Command) => {
        await withResult(command, async () => {
          const parsedInput = z.object({ file: z.string().trim().min(1) }).safeParse(options);
          if (!parsedInput.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid upload payload.", parsedInput.error.flatten());
          }

          const parsedVia = uploadViaSchema.safeParse((options.via ?? "auto").trim());
          if (!parsedVia.success) {
            return toolError(
              ERROR_CODES.VALIDATION_ERROR,
              "Invalid --via value. Use auto, passthrough, uguu or litterbox.",
              parsedVia.error.flatten()
            );
          }

          const parsedLitterboxExpiry = litterboxExpirySchema.safeParse((options.litterboxExpiry ?? "1h").trim());
          if (!parsedLitterboxExpiry.success) {
            return toolError(
              ERROR_CODES.VALIDATION_ERROR,
              "Invalid --litterbox-expiry value. Use 1h, 12h, 24h or 72h.",
              parsedLitterboxExpiry.error.flatten()
            );
          }

          const resolved = await resolveUploadSource(parsedInput.data.file);
          if (!resolved.ok) {
            return resolved;
          }

          const flags = readFlags(command);
          const source = resolved.data;
          const via = parsedVia.data;
          const capabilities = uploadCapabilities(source);
          const availableVia = source.kind === "https-url" ? (["passthrough"] as const) : (["uguu", "litterbox"] as const);

          if (source.kind === "https-url") {
            return {
              ok: true,
              action: "upload.file",
              data: {
                input: parsedInput.data.file,
                source_kind: source.kind,
                selected_via: via,
                effective_via: "passthrough",
                status: flags.dryRun ? "dry-run" : "ready",
                public_url: source.normalized,
                url: source.normalized,
                available_via: availableVia,
                capabilities
              }
            } as const;
          }

          if (via === "passthrough") {
            return toolError(
              ERROR_CODES.VALIDATION_ERROR,
              "Passthrough strategy requires an https:// URL in --file.",
              {
                source_kind: source.kind,
                available_via: availableVia,
                capabilities,
                suggested_commands: [
                  `instacli upload file --file ${source.original} --via uguu --json --quiet`,
                  `instacli upload file --file ${source.original} --via litterbox --json --quiet`
                ]
              }
            );
          }

          const effectiveVia: Exclude<UploadVia, "passthrough" | "auto"> = via === "auto" ? "uguu" : via;
          if (flags.dryRun) {
            return {
              ok: true,
              action: "upload.file",
              data: {
                input: parsedInput.data.file,
                source_kind: source.kind,
                selected_via: via,
                effective_via: effectiveVia,
                status: "dry-run",
                available_via: availableVia,
                capabilities,
                local_file: {
                  absolute_path: source.absolutePath,
                  file_name: source.fileName,
                  size_bytes: source.sizeBytes
                },
                ...(effectiveVia === "litterbox" ? { litterbox_expiry: parsedLitterboxExpiry.data } : {})
              }
            } as const;
          }

          const uploaded =
            effectiveVia === "litterbox"
              ? await uploadLocalFileToLitterbox(source, parsedLitterboxExpiry.data)
              : await uploadLocalFileToUguu(source);
          if (!uploaded.ok) {
            return uploaded;
          }

          return {
            ok: true,
            action: "upload.file",
            data: {
              input: parsedInput.data.file,
              source_kind: source.kind,
              selected_via: via,
              effective_via: effectiveVia,
              status: "uploaded",
              public_url: uploaded.data.public_url,
              url: uploaded.data.public_url,
              available_via: availableVia,
              capabilities,
              ...(effectiveVia === "litterbox" ? { litterbox_expiry: parsedLitterboxExpiry.data } : {}),
              ...("delete_url" in uploaded.data && typeof uploaded.data.delete_url === "string"
                ? { delete_url: uploaded.data.delete_url }
                : {})
            }
          } as const;
        });
      })
  );

  const auth = program.command("auth").description("Authentication commands");

  addToolingFlags(
    auth
      .command("login")
      .description("Authenticate with selected provider")
      .option("--provider <provider>", "Provider override: meta-byo|central")
      .action(async (_options: CommandOptions, command: Command) => {
        await withResult(command, async () => {
          const flags = readFlags(command);
          const options = command.optsWithGlobals<CommandOptions>();
          const providerName = resolveProviderName(store, options);
          const provider = getProvider(providerName, flags, store);

          const started = await provider.auth.start();
          if (!started.ok) {
            return started;
          }

          if (flags.dryRun) {
            return {
              ok: true,
              action: "auth.login",
              data: {
                provider: providerName,
                login_url: started.data.loginUrl,
                status: "dry-run"
              }
            } as const;
          }

          await open(started.data.loginUrl);

          const callback = await waitForOAuthCallback(started.data.redirectUri);
          if (!callback.ok) {
            return toolError(ERROR_CODES.PROVIDER_ERROR, callback.message, {
              redirectUri: started.data.redirectUri
            });
          }

          const finished = await provider.auth.finish({ code: callback.code, state: callback.state });
          if (!finished.ok) {
            return finished;
          }

          store.setDefaultProvider(providerName);
          return {
            ok: true,
            action: "auth.login",
            data: {
              provider: providerName,
              authenticated: true
            }
          } as const;
        });
      })
  );

  addToolingFlags(
    auth.command("status").description("Show auth status").option("--provider <provider>", "Provider override").action(
      async (_options: CommandOptions, command: Command) => {
        await withResult(command, async () => {
          const flags = readFlags(command);
          const providerName = resolveProviderName(store, command.optsWithGlobals<CommandOptions>());
          const provider = getProvider(providerName, flags, store);
          return provider.auth.status();
        });
      }
    )
  );

  addToolingFlags(
    auth.command("logout").description("Clear local auth").option("--provider <provider>", "Provider override").action(
      async (_options: CommandOptions, command: Command) => {
        await withResult(command, async () => {
          const flags = readFlags(command);
          const providerName = resolveProviderName(store, command.optsWithGlobals<CommandOptions>());
          const provider = getProvider(providerName, flags, store);
          return provider.auth.logout();
        });
      }
    )
  );

  const publish = program.command("publish").description("Publishing commands");

  addToolingFlags(
    publish
      .command("photo")
      .description("Publish a photo")
      .requiredOption("--file <file>", "Public URL or file path")
      .option("--caption <caption>", "Caption")
      .option("--provider <provider>", "Provider override")
      .option("--confirm-account <username>", "Hard-check expected @username before publish")
      .action(async (options: { file: string; caption?: string; confirmAccount?: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ file: z.string().trim().min(1), caption: z.string().optional() }).safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid publish photo payload", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), true);
          if (!resolved.ok) {
            return resolved;
          }

          if (resolved.data.providerName === "meta-byo" && resolved.data.accountName) {
            const guardrails = await ensurePublishAccountGuardrails(store, resolved.data.accountName, options.confirmAccount);
            if (!guardrails.ok) {
              return guardrails;
            }
          }

          return resolved.data.provider.publish.photo(payload.data);
        });
      })
  );

  addToolingFlags(
    publish
      .command("video")
      .description("Publish a video")
      .requiredOption("--file <file>", "Public URL or file path")
      .option("--caption <caption>", "Caption")
      .option("--provider <provider>", "Provider override")
      .option("--confirm-account <username>", "Hard-check expected @username before publish")
      .action(async (options: { file: string; caption?: string; confirmAccount?: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ file: z.string().trim().min(1), caption: z.string().optional() }).safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid publish video payload", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), true);
          if (!resolved.ok) {
            return resolved;
          }

          if (resolved.data.providerName === "meta-byo" && resolved.data.accountName) {
            const guardrails = await ensurePublishAccountGuardrails(store, resolved.data.accountName, options.confirmAccount);
            if (!guardrails.ok) {
              return guardrails;
            }
          }

          return resolved.data.provider.publish.video(payload.data);
        });
      })
  );

  addToolingFlags(
    publish
      .command("carousel")
      .description("Publish carousel")
      .requiredOption("--files <files...>", "Public URLs or file paths")
      .option("--caption <caption>", "Caption")
      .option("--provider <provider>", "Provider override")
      .option("--confirm-account <username>", "Hard-check expected @username before publish")
      .action(async (options: { files: string[]; caption?: string; confirmAccount?: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z
            .object({ files: z.array(z.string().trim().min(1)).min(2), caption: z.string().optional() })
            .safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid publish carousel payload", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), true);
          if (!resolved.ok) {
            return resolved;
          }

          if (resolved.data.providerName === "meta-byo" && resolved.data.accountName) {
            const guardrails = await ensurePublishAccountGuardrails(store, resolved.data.accountName, options.confirmAccount);
            if (!guardrails.ok) {
              return guardrails;
            }
          }

          return resolved.data.provider.publish.carousel(payload.data);
        });
      })
  );

  addToolingFlags(
    program
      .command("media")
      .description("Media management")
      .command("list")
      .description("List media")
      .option("--limit <limit>", "Maximum number of items", "10")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { limit: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ limit: z.coerce.number().int().min(1).max(100) }).safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid media list options", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          return resolved.data.provider.media.list({ limit: payload.data.limit });
        });
      })
  );

  const insights = program.command("insights").description("Insights commands");

  addToolingFlags(
    insights
      .command("account")
      .description("Fetch account insights (reach/impressions/profile views/engaged accounts)")
      .option("--period <period>", "Insights period: day|week|month", "day")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { period: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ period: z.enum(["day", "week", "month"]) }).safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid account insights options", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          return resolved.data.provider.insights.account(payload.data);
        });
      })
  );

  addToolingFlags(
    insights
      .command("media")
      .description("Fetch insights for a specific media id")
      .requiredOption("--id <id>", "Media id")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { id: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ id: z.string().trim().min(1) }).safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid media insights options", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          return resolved.data.provider.insights.media(payload.data);
        });
      })
  );

  const analytics = program.command("analytics").description("Analytics commands");

  addToolingFlags(
    analytics
      .command("top-posts")
      .description("Rank recent posts by engagement score")
      .option("--days <days>", "How many days back to analyze", "30")
      .option("--limit <limit>", "Maximum number of posts returned", "10")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { days: string; limit: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z
            .object({
              days: z.coerce.number().int().min(1).max(3650),
              limit: z.coerce.number().int().min(1).max(100)
            })
            .safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid top-posts options", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          return resolved.data.provider.analytics.topPosts(payload.data);
        });
      })
  );

  addToolingFlags(
    analytics
      .command("summary")
      .description("Summary for the last 7 or 30 days (totals, best/worst post, reply rate)")
      .option("--days <days>", "How many days back to analyze (7 or 30)", "7")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { days: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ days: z.coerce.number().int().refine((value) => value === 7 || value === 30) }).safeParse(options);
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid analytics summary options", {
              days: "Use --days 7 or --days 30"
            });
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          const provider = resolved.data.provider;

          const topPosts = await provider.analytics.topPosts({ days: payload.data.days, limit: 100 });
          if (!topPosts.ok) {
            return topPosts;
          }

          const ownerUsername =
            resolved.data.providerName === "meta-byo" ? store.getMetaByoConfig(resolved.data.accountName).igUsername : undefined;
          let repliedComments = 0;
          let totalComments = 0;

          for (const item of topPosts.data.items) {
            const comments = await provider.comments.list({ mediaId: item.id });
            if (!comments.ok) {
              return comments;
            }

            const parsedComments = comments.data.items
              .map((comment) => parseCommentItem(comment))
              .filter((comment): comment is ParsedCommentItem => Boolean(comment));

            totalComments += parsedComments.length;
            repliedComments += parsedComments.filter((comment) => hasOwnerReply(comment, ownerUsername)).length;
          }

          const totals = topPosts.data.items.reduce(
            (acc, item) => {
              acc.posts += 1;
              acc.likes += toSafeNumber(item.metrics.likes);
              acc.comments += toSafeNumber(item.metrics.comments);
              acc.saved += toSafeNumber(item.metrics.saved);
              acc.shares += toSafeNumber(item.metrics.shares);
              acc.reach += toSafeNumber(item.metrics.reach);
              acc.impressions += toSafeNumber(item.metrics.impressions);
              acc.engagement_score += toSafeNumber(item.engagement_score);
              return acc;
            },
            {
              posts: 0,
              likes: 0,
              comments: 0,
              saved: 0,
              shares: 0,
              reach: 0,
              impressions: 0,
              engagement_score: 0
            }
          );

          const orderedByScore = [...topPosts.data.items].sort((a, b) => {
            if (b.engagement_score !== a.engagement_score) {
              return b.engagement_score - a.engagement_score;
            }

            return toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
          });

          const formatPost = (post: (typeof orderedByScore)[number] | undefined) => {
            if (!post) {
              return null;
            }

            return {
              id: post.id,
              media_type: post.media_type,
              permalink: post.permalink,
              caption: post.caption,
              timestamp: post.timestamp,
              engagement_score: toSafeNumber(post.engagement_score),
              metrics: {
                likes: toSafeNumber(post.metrics.likes),
                comments: toSafeNumber(post.metrics.comments),
                saved: toSafeNumber(post.metrics.saved),
                shares: toSafeNumber(post.metrics.shares),
                reach: toSafeNumber(post.metrics.reach),
                impressions: toSafeNumber(post.metrics.impressions)
              }
            };
          };

          const replyRate = totalComments > 0 ? repliedComments / totalComments : 0;

          return {
            ok: true,
            action: "analytics.summary",
            data: {
              days: payload.data.days,
              totals,
              best_post: formatPost(orderedByScore[0]),
              worst_post: formatPost(orderedByScore[orderedByScore.length - 1]),
              reply_rate: Number(replyRate.toFixed(4)),
              reply_stats: {
                owner_username: ownerUsername,
                replied_comments: repliedComments,
                total_comments: totalComments
              }
            }
          } as const;
        });
      })
  );

  const comments = program.command("comments").description("Comments commands");

  addToolingFlags(
    comments
      .command("list")
      .description("List comments for media")
      .requiredOption("--media <id>", "Media id")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { media: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z.object({ mediaId: z.string().trim().min(1) }).safeParse({ mediaId: options.media });
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid comments list options", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          return resolved.data.provider.comments.list(payload.data);
        });
      })
  );

  addToolingFlags(
    comments
      .command("inbox")
      .description("List unresolved comments (no owner reply)")
      .option("--days <days>", "How many days back to scan", "7")
      .option("--limit <limit>", "Maximum unresolved comments returned", "20")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { days: string; limit: string }, command: Command) => {
        await withResult(command, async () => {
          const payload = z
            .object({
              days: z.coerce.number().int().min(1).max(3650),
              limit: z.coerce.number().int().min(1).max(200)
            })
            .safeParse(options);

          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid comments inbox options", payload.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          const provider = resolved.data.provider;

          const ownerUsername =
            resolved.data.providerName === "meta-byo" ? store.getMetaByoConfig(resolved.data.accountName).igUsername : undefined;
          const mediaLimit = Math.min(100, Math.max(payload.data.limit * 4, 25));
          const mediaList = await provider.media.list({ limit: mediaLimit });
          if (!mediaList.ok) {
            return mediaList;
          }

          const cutoffMs = Date.now() - payload.data.days * 24 * 60 * 60 * 1000;
          const mediaItems = mediaList.data.items
            .map((item) => parseMediaItem(item))
            .filter((item): item is ParsedMediaItem => Boolean(item))
            .filter((item) => {
              const ts = toTimestampMs(item.timestamp);
              return !Number.isFinite(ts) || ts >= cutoffMs;
            });

          const unresolved: Array<{
            media_id: string;
            media_permalink?: string;
            comment_id: string;
            text: string;
            username?: string;
            timestamp?: string;
            replies_count: number;
            has_owner_reply: boolean;
          }> = [];

          let totalCommentsScanned = 0;

          for (const media of mediaItems) {
            const commentsResult = await provider.comments.list({ mediaId: media.id });
            if (!commentsResult.ok) {
              return commentsResult;
            }

            const commentsForMedia = commentsResult.data.items
              .map((comment) => parseCommentItem(comment))
              .filter((comment): comment is ParsedCommentItem => Boolean(comment));
            totalCommentsScanned += commentsForMedia.length;

            for (const comment of commentsForMedia) {
              const ownerReplied = hasOwnerReply(comment, ownerUsername);
              if (ownerReplied) {
                continue;
              }

              unresolved.push({
                media_id: media.id,
                ...(media.permalink ? { media_permalink: media.permalink } : {}),
                comment_id: comment.id,
                text: shortText(comment.text, 240),
                ...(comment.username ? { username: comment.username } : {}),
                ...(comment.timestamp ? { timestamp: comment.timestamp } : {}),
                replies_count: comment.replies.length,
                has_owner_reply: false
              });
            }
          }

          unresolved.sort((a, b) => {
            const bTs = toTimestampMs(b.timestamp);
            const aTs = toTimestampMs(a.timestamp);
            return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
          });

          return {
            ok: true,
            action: "comments.inbox",
            data: {
              days: payload.data.days,
              limit: payload.data.limit,
              owner_username: ownerUsername,
              scanned: {
                media: mediaItems.length,
                comments: totalCommentsScanned
              },
              items: unresolved.slice(0, payload.data.limit)
            }
          } as const;
        });
      })
  );

  addToolingFlags(
    comments
      .command("reply")
      .description("Reply to a comment")
      .requiredOption("--comment <id>", "Comment id")
      .option("--text <text>", "Reply text or reference comment text when using --ai")
      .option("--ai", "Generate 3 short reply suggestions in account tone")
      .option("--publish", "When used with --ai + --text, publish the reply text")
      .option("--provider <provider>", "Provider override")
      .action(async (options: { comment: string; text?: string; ai?: boolean; publish?: boolean }, command: Command) => {
        await withResult(command, async () => {
          const parsed = z
            .object({
              commentId: z.string().trim().min(1),
              text: z.string().trim().optional(),
              ai: z.boolean().optional(),
              publish: z.boolean().optional()
            })
            .safeParse({
              commentId: options.comment,
              text: options.text,
              ai: options.ai,
              publish: options.publish
            });

          if (!parsed.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid comments reply options", parsed.error.flatten());
          }

          const flags = readFlags(command);
          const resolved = resolveProviderForCommand(store, flags, command.optsWithGlobals<CommandOptions>(), false);
          if (!resolved.ok) {
            return resolved;
          }
          const provider = resolved.data.provider;

          if (parsed.data.ai) {
            const accountHint =
              command.optsWithGlobals<CommandOptions>().account ??
              (resolved.data.providerName === "meta-byo" ? store.getMetaByoConfig(resolved.data.accountName).igUsername : undefined);
            const suggestions = buildReplySuggestions(parsed.data.text ?? "", accountHint);
            const shouldPublish = Boolean(parsed.data.publish && parsed.data.text && parsed.data.text.length > 0);

            if (!shouldPublish) {
              return {
                ok: true,
                action: "comments.reply.ai",
                data: {
                  comment_id: parsed.data.commentId,
                  suggestions,
                  published: false,
                  note: "Suggestions generated only. Use --publish with --text to post a reply."
                }
              } as const;
            }

            const publishPayload = z
              .object({ commentId: z.string().trim().min(1), text: z.string().trim().min(1) })
              .safeParse({ commentId: parsed.data.commentId, text: parsed.data.text });
            if (!publishPayload.success) {
              return toolError(ERROR_CODES.VALIDATION_ERROR, "Publishing requires non-empty --text.", publishPayload.error.flatten());
            }

            const published = await provider.comments.reply(publishPayload.data);
            if (!published.ok) {
              return published;
            }

            return {
              ok: true,
              action: "comments.reply.ai",
              data: {
                comment_id: parsed.data.commentId,
                suggestions,
                published: true,
                reply: published.data
              }
            } as const;
          }

          const payload = z
            .object({ commentId: z.string().trim().min(1), text: z.string().trim().min(1) })
            .safeParse({ commentId: parsed.data.commentId, text: parsed.data.text });
          if (!payload.success) {
            return toolError(ERROR_CODES.VALIDATION_ERROR, "Invalid comments reply options", payload.error.flatten());
          }

          return provider.comments.reply(payload.data);
        });
      })
  );

  program.action(async (_options: CommandOptions, command: Command) => {
    const isConfigured = await hasMetaTokenSetup(store);
    if (isConfigured) {
      command.outputHelp();
      return;
    }

    const flags = readFlags(command);
    if (flags.json || flags.quiet || !processStdin.isTTY || !processStdout.isTTY) {
      emit(
        {
          ok: true,
          action: "onboarding.meta-byo",
          data: buildMetaOnboardingData(false, false)
        },
        flags
      );
      return;
    }

    const result = await runGuidedMetaOnboarding(store, flags, false);
    emit(result, flags);
  });

  return program;
};

export const runCli = async (argv = process.argv): Promise<void> => {
  const program = createProgram();
  await program.parseAsync(argv);
};
