import crypto from "node:crypto";
import type {
  AccountInsights,
  AnalyticsTopPostsInput,
  AuthFinishInput,
  AuthStartInput,
  CommentsListInput,
  CommentsReplyInput,
  InsightsAccountInput,
  InsightsMediaInput,
  MediaListInput,
  MediaInsights,
  Provider,
  ProviderContext,
  PublishCarouselInput,
  PublishPhotoInput,
  PublishVideoInput,
  TopPostItem,
  ToolError,
  ToolResult
} from "@instacli/ig-core";
import { ERROR_CODES, toolError } from "@instacli/ig-core";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";
const OAUTH_BASE = "https://www.facebook.com/v20.0/dialog/oauth";

type MetaEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type GraphMethod = "GET" | "POST";
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const INSIGHTS_RETRY_DELAY_MS = 500;
const PUBLISH_RETRY_DELAYS_MS = [15_000, 45_000, 120_000] as const;
const META_ACTION_BLOCK_SUBCODE = 2_207_051;
const META_ACTION_BLOCK_RETRY_AFTER_SECONDS = 60 * 60;

const ensureMetaEnv = (): MetaEnv | ToolError => {
  const clientId = process.env.IG_META_CLIENT_ID;
  const clientSecret = process.env.IG_META_CLIENT_SECRET;
  const redirectUri = process.env.IG_META_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return toolError(
      ERROR_CODES.CONFIG_ERROR,
      "Missing required Meta env vars: IG_META_CLIENT_ID, IG_META_CLIENT_SECRET, IG_META_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
};

const isToolError = (value: MetaEnv | ToolError): value is ToolError =>
  (value as ToolError).ok === false;

const randomString = (): string => crypto.randomBytes(32).toString("base64url");

const toCodeChallenge = (verifier: string): string => crypto.createHash("sha256").update(verifier).digest("base64url");

const toQuery = (params: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search.toString();
};

const parseTimeoutMs = (): number => {
  const raw = process.env.IG_META_FETCH_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
};

const fetchWithTimeout = async (input: URL | string, init?: RequestInit): Promise<Response> => {
  const timeoutMs = parseTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const sanitizePagingNextUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", "***");
    }
    if (url.searchParams.has("appsecret_proof")) {
      url.searchParams.set("appsecret_proof", "***");
    }
    return url.toString();
  } catch {
    return value.replace(/([?&](?:access_token|appsecret_proof)=)[^&]+/g, "$1***");
  }
};

const extractNextCursor = (paging: unknown): string | undefined => {
  if (!isRecord(paging)) {
    return undefined;
  }

  const cursors = paging.cursors;
  if (!isRecord(cursors)) {
    return undefined;
  }

  const after = cursors.after;
  return typeof after === "string" && after.length > 0 ? after : undefined;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const readMetricValue = (data: unknown, metric: string): number | null => {
  if (!Array.isArray(data)) {
    return null;
  }

  const metricEntry = data.find((entry) => isRecord(entry) && entry.name === metric);
  if (!isRecord(metricEntry)) {
    return null;
  }

  const values = metricEntry.values;
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const first = values[0];
  if (!isRecord(first)) {
    return null;
  }

  return toFiniteNumber(first.value) ?? null;
};

const extractGraphError = (error: ToolError): { status?: number; code?: number; subcode?: number; message?: string } => {
  const details = isRecord(error.error.details) ? error.error.details : undefined;
  const status = toFiniteNumber(details?.status);
  const body = isRecord(details?.body) ? details.body : undefined;
  const graphError = isRecord(body?.error) ? body.error : undefined;
  const code = toFiniteNumber(graphError?.code);
  const subcode = toFiniteNumber(graphError?.error_subcode);
  const message = typeof graphError?.message === "string" ? graphError.message : undefined;

  return {
    ...(typeof status === "number" ? { status } : {}),
    ...(typeof code === "number" ? { code } : {}),
    ...(typeof subcode === "number" ? { subcode } : {}),
    ...(typeof message === "string" ? { message } : {})
  };
};

const isRateLimitError = (error: ToolError): boolean => {
  if (error.error.code !== ERROR_CODES.PROVIDER_ERROR) {
    return false;
  }

  const graph = extractGraphError(error);
  if (graph.status === 429) {
    return true;
  }

  return graph.code === 4 || graph.code === 17 || graph.code === 32 || graph.code === 613;
};

const isMetaActionBlockedError = (error: ToolError): boolean => {
  if (error.error.code !== ERROR_CODES.PROVIDER_ERROR) {
    return false;
  }

  const graph = extractGraphError(error);
  const message = graph.message?.toLowerCase() ?? "";
  return (
    graph.code === 4 &&
    (graph.subcode === META_ACTION_BLOCK_SUBCODE ||
      message.includes("application request limit reached") ||
      message.includes("action is blocked"))
  );
};

const isMediaNotReadyForPublishingError = (error: ToolError): boolean => {
  if (error.error.code !== ERROR_CODES.PROVIDER_ERROR) {
    return false;
  }

  const message = extractGraphError(error).message?.toLowerCase() ?? "";
  return message.includes("media is not ready for publishing");
};

const toMetaActionBlockedError = (error: ToolError): ToolError => {
  const graph = extractGraphError(error);
  return toolError(
    ERROR_CODES.PROVIDER_ERROR,
    "Meta temporarily blocked publish actions for this app/account. Wait before retrying.",
    {
      ...((error.error.details as Record<string, unknown> | undefined) ?? {}),
      retry_after_seconds: META_ACTION_BLOCK_RETRY_AFTER_SECONDS,
      reason: "application request limit reached / action blocked",
      graph
    }
  );
};

const isMissingInsightsScopeError = (error: ToolError): boolean => {
  if (error.error.code !== ERROR_CODES.PROVIDER_ERROR) {
    return false;
  }

  const graph = extractGraphError(error);
  const message = graph.message?.toLowerCase() ?? "";
  if (message.includes("instagram_manage_insights")) {
    return true;
  }

  if (message.includes("insights") && message.includes("permission")) {
    return true;
  }

  return (graph.code === 10 || graph.code === 200 || graph.status === 403) && message.includes("permission");
};

const toMissingInsightsScopeError = (): ToolError =>
  toolError(
    ERROR_CODES.VALIDATION_ERROR,
    "Missing required scope instagram_manage_insights. Re-authorize your token with this permission to use insights.",
    { required_scope: "instagram_manage_insights" }
  );

const isUnsupportedMediaMetricError = (error: ToolError): boolean => {
  if (error.error.code !== ERROR_CODES.PROVIDER_ERROR) {
    return false;
  }

  const message = extractGraphError(error).message?.toLowerCase() ?? "";
  return (
    message.includes("not available for") ||
    message.includes("does not support") ||
    message.includes("no longer supported") ||
    message.includes("unsupported") ||
    message.includes("invalid metric")
  );
};

const graphRequest = async (
  accessToken: string,
  path: string,
  method: GraphMethod,
  params: Record<string, string | number | boolean | undefined>
): Promise<ToolResult<Record<string, unknown>>> => {
  const url = new URL(`${GRAPH_BASE}${path}`);

  if (method === "GET") {
    url.search = toQuery({ ...params, access_token: accessToken });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: method === "POST" ? toQuery({ ...params, access_token: accessToken }) : undefined
    });
  } catch (error) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta Graph API request failed", {
      status: 0,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  const parsed = (await parseJsonResponse(response)) as Record<string, unknown> | null;

  if (!response.ok) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta Graph API request failed", {
      status: response.status,
      body: parsed
    });
  }

  return {
    ok: true,
    action: "meta.graph.request",
    data: parsed ?? {}
  };
};

const graphInsightsRequest = async (
  accessToken: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>
): Promise<ToolResult<Record<string, unknown>>> => {
  let response = await graphRequest(accessToken, path, "GET", params);
  if (!response.ok && isRateLimitError(response)) {
    await sleep(INSIGHTS_RETRY_DELAY_MS);
    response = await graphRequest(accessToken, path, "GET", params);
  }

  if (!response.ok && isMissingInsightsScopeError(response)) {
    return toMissingInsightsScopeError();
  }

  return response;
};

const resolveMediaReference = (file: string): ToolResult<{ mediaUrl: string }> => {
  if (file.startsWith("https://")) {
    return {
      ok: true,
      action: "media.resolve",
      data: { mediaUrl: file }
    };
  }

  return toolError(
    ERROR_CODES.VALIDATION_ERROR,
    "Meta direct publish requires a publicly reachable HTTPS URL. Pass an https:// URL in --file."
  );
};

const normalizeCaption = (caption: string | undefined): string | undefined => {
  if (typeof caption !== "string") {
    return caption;
  }

  // Some pipelines pass escaped newlines ("\\n") as literal text.
  // Convert them to real newlines before publishing.
  return caption.replace(/\\n/g, "\n");
};

const getIgUserId = (context: ProviderContext): string | undefined =>
  context.store.getMetaByoConfig(context.accountName).igUserId;

const getAccessToken = async (context: ProviderContext): Promise<string | undefined> =>
  context.store.getSecret("meta-byo", "accessToken", context.accountName);

const requireAuth = async (context: ProviderContext): Promise<ToolResult<{ accessToken: string; igUserId: string }>> => {
  const accessToken = await getAccessToken(context);
  const igUserId = getIgUserId(context);

  if (!accessToken || !igUserId) {
    return toolError(ERROR_CODES.AUTH_REQUIRED, "Run ig auth login for provider meta-byo first.");
  }

  return {
    ok: true,
    action: "auth.require",
    data: { accessToken, igUserId }
  };
};

const createMediaContainer = async (
  accessToken: string,
  igUserId: string,
  payload: Record<string, string | number | boolean | undefined>
): Promise<ToolResult<{ creationId: string }>> => {
  const created = await graphRequest(accessToken, `/${igUserId}/media`, "POST", payload);
  if (!created.ok) {
    if (isMetaActionBlockedError(created)) {
      return toMetaActionBlockedError(created);
    }

    return created;
  }

  const creationId = created.data.id;
  if (typeof creationId !== "string") {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta did not return media container id", created.data);
  }

  return {
    ok: true,
    action: "meta.media.container.create",
    data: { creationId }
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForContainerReady = async (
  accessToken: string,
  creationId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<ToolResult<{ status: string }>> => {
  const maxAttempts = options?.maxAttempts ?? 24; // ~2 min with default interval
  const intervalMs = options?.intervalMs ?? 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const statusResult = await graphRequest(accessToken, `/${creationId}`, "GET", {
      fields: "status_code,status"
    });

    if (!statusResult.ok) {
      return statusResult;
    }

    const statusCode = statusResult.data.status_code;
    const status = typeof statusCode === "string" ? statusCode : "UNKNOWN";

    if (status === "FINISHED") {
      return {
        ok: true,
        action: "meta.media.container.status",
        data: { status }
      };
    }

    if (status === "ERROR") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta container failed processing", statusResult.data);
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  return toolError(ERROR_CODES.PROVIDER_ERROR, "Timed out waiting for Meta media container to finish", {
    creationId,
    maxAttempts,
    intervalMs
  });
};

const publishMediaContainer = async (
  accessToken: string,
  igUserId: string,
  creationId: string
): Promise<ToolResult<{ media_id: string; status: string }>> => {
  let lastError: ToolError | null = null;

  for (let attempt = 0; attempt <= PUBLISH_RETRY_DELAYS_MS.length; attempt += 1) {
    const published = await graphRequest(accessToken, `/${igUserId}/media_publish`, "POST", { creation_id: creationId });
    if (published.ok) {
      const mediaId = published.data.id;
      if (typeof mediaId !== "string") {
        return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta did not return published media id", published.data);
      }

      return {
        ok: true,
        action: "publish.media",
        data: { media_id: mediaId, status: "published" }
      };
    }

    if (isMetaActionBlockedError(published)) {
      return toMetaActionBlockedError(published);
    }

    lastError = published;

    const canRetry = attempt < PUBLISH_RETRY_DELAYS_MS.length;
    const retryable = isMediaNotReadyForPublishingError(published) || isRateLimitError(published);
    if (!canRetry || !retryable) {
      return published;
    }

    const delayMs = PUBLISH_RETRY_DELAYS_MS[attempt];
    if (typeof delayMs !== "number") {
      return published;
    }

    await sleep(delayMs);
  }

  return (
    lastError ??
    toolError(ERROR_CODES.PROVIDER_ERROR, "Failed to publish media after retries", {
      creationId
    })
  );
};

type MediaInsightMetricName = "impressions" | "reach" | "saved" | "shares";

const MEDIA_INSIGHT_METRICS: readonly MediaInsightMetricName[] = ["impressions", "reach", "saved", "shares"];

type MediaInsightsMetrics = {
  impressions: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
};

const emptyMediaInsightsMetrics = (): MediaInsightsMetrics => ({
  impressions: null,
  reach: null,
  saved: null,
  shares: null
});

const readMediaInsightsMetrics = (responseData: Record<string, unknown>): MediaInsightsMetrics => ({
  impressions: readMetricValue(responseData.data, "impressions"),
  reach: readMetricValue(responseData.data, "reach"),
  saved: readMetricValue(responseData.data, "saved"),
  shares: readMetricValue(responseData.data, "shares")
});

const fetchMediaInsightsMetrics = async (
  accessToken: string,
  mediaId: string
): Promise<ToolResult<MediaInsightsMetrics>> => {
  const bulk = await graphInsightsRequest(accessToken, `/${mediaId}/insights`, {
    metric: MEDIA_INSIGHT_METRICS.join(",")
  });

  if (bulk.ok) {
    return {
      ok: true,
      action: "insights.media.metrics",
      data: readMediaInsightsMetrics(bulk.data)
    };
  }

  if (isMissingInsightsScopeError(bulk)) {
    return toMissingInsightsScopeError();
  }

  if (!isUnsupportedMediaMetricError(bulk)) {
    return bulk;
  }

  const metrics = emptyMediaInsightsMetrics();
  for (const metric of MEDIA_INSIGHT_METRICS) {
    const single = await graphInsightsRequest(accessToken, `/${mediaId}/insights`, { metric });
    if (!single.ok) {
      if (isMissingInsightsScopeError(single)) {
        return toMissingInsightsScopeError();
      }

      metrics[metric] = null;
      continue;
    }

    metrics[metric] = readMetricValue(single.data.data, metric);
  }

  return {
    ok: true,
    action: "insights.media.metrics",
    data: metrics
  };
};

const accountInsightsPeriodToGraph: Record<InsightsAccountInput["period"], "day" | "week" | "days_28"> = {
  day: "day",
  week: "week",
  month: "days_28"
};

type AnalyticsMediaEntry = {
  id: string;
  media_type: string;
  permalink: string;
  caption?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
};

const toAnalyticsMediaEntry = (value: unknown): AnalyticsMediaEntry | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : undefined;
  const mediaType = typeof value.media_type === "string" ? value.media_type : undefined;
  const permalink = typeof value.permalink === "string" ? value.permalink : undefined;
  const timestamp = typeof value.timestamp === "string" ? value.timestamp : undefined;

  if (!id || !mediaType || !permalink || !timestamp) {
    return undefined;
  }

  return {
    id,
    media_type: mediaType,
    permalink,
    timestamp,
    ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
    like_count: toFiniteNumber(value.like_count) ?? 0,
    comments_count: toFiniteNumber(value.comments_count) ?? 0
  };
};

export const createMetaByoProvider = (context: ProviderContext): Provider => {
  const authStart = async (input?: AuthStartInput) => {
    const env = ensureMetaEnv();
    if (isToolError(env)) {
      return env;
    }

    const state = randomString();
    const codeVerifier = randomString();
    const codeChallenge = toCodeChallenge(codeVerifier);
    const redirectUri = input?.redirectUri ?? env.redirectUri;

    const query = toQuery({
      client_id: env.clientId,
      redirect_uri: redirectUri,
      scope:
        "instagram_basic,instagram_content_publish,pages_read_engagement,instagram_manage_comments,instagram_manage_insights",
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });

    context.store.setMetaByoConfig({
      pendingAuth: {
        state,
        codeVerifier,
        redirectUri,
        createdAt: new Date().toISOString()
      }
    }, context.accountName);

    return {
      ok: true,
      action: "auth.start",
      data: {
        loginUrl: `${OAUTH_BASE}?${query}`,
        state,
        redirectUri
      }
    } as const;
  };

  const authFinish = async (input: AuthFinishInput) => {
    const env = ensureMetaEnv();
    if (isToolError(env)) {
      return env;
    }

    const config = context.store.getMetaByoConfig(context.accountName);
    const pendingAuth = config.pendingAuth;

    if (!pendingAuth) {
      return toolError(ERROR_CODES.AUTH_REQUIRED, "No pending auth flow. Run ig auth login first.");
    }

    if (input.state !== pendingAuth.state) {
      return toolError(ERROR_CODES.VALIDATION_ERROR, "OAuth state mismatch.");
    }

    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.search = toQuery({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: pendingAuth.redirectUri,
      code: input.code,
      code_verifier: pendingAuth.codeVerifier
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetchWithTimeout(tokenUrl, { method: "GET" });
    } catch (error) {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta token exchange failed", {
        status: 0,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
    const tokenBody = (await parseJsonResponse(tokenRes)) as Record<string, unknown> | null;

    if (!tokenRes.ok) {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta token exchange failed", {
        status: tokenRes.status,
        body: tokenBody
      });
    }

    const accessToken = tokenBody?.access_token;
    if (typeof accessToken !== "string") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta token response missing access_token", tokenBody);
    }

    const meRes = await graphRequest(accessToken, "/me", "GET", { fields: "id" });
    if (!meRes.ok) {
      return meRes;
    }

    const meId = meRes.data.id;
    if (typeof meId !== "string") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta user response missing id", meRes.data);
    }

    await context.store.setSecret("meta-byo", "accessToken", accessToken, context.accountName);

    const refreshToken = tokenBody?.refresh_token;
    if (typeof refreshToken === "string") {
      await context.store.setSecret("meta-byo", "refreshToken", refreshToken, context.accountName);
    }

    const expiresIn = tokenBody?.expires_in;

    context.store.setMetaByoConfig({
      hasAccessToken: true,
      hasRefreshToken: typeof refreshToken === "string",
      expiresAt: typeof expiresIn === "number" ? Date.now() + expiresIn * 1000 : undefined,
      igUserId: meId,
      tokenType: typeof tokenBody?.token_type === "string" ? tokenBody.token_type : undefined,
      scope: Array.isArray(tokenBody?.scope) ? (tokenBody.scope.filter((x): x is string => typeof x === "string")) : undefined,
      pendingAuth: undefined
    }, context.accountName);

    return {
      ok: true,
      action: "auth.finish",
      data: {
        authenticated: true,
        provider: "meta-byo"
      }
    } as const;
  };

  const authStatus = async () => {
    const accessToken = await context.store.getSecret("meta-byo", "accessToken", context.accountName);
    return {
      ok: true,
      action: "auth.status",
      data: {
        authenticated: Boolean(accessToken),
        provider: "meta-byo"
      }
    } as const;
  };

  const authLogout = async () => {
    await context.store.deleteSecret("meta-byo", "accessToken", context.accountName);
    await context.store.deleteSecret("meta-byo", "refreshToken", context.accountName);
    context.store.clearMetaByoAccount(context.accountName);

    return {
      ok: true,
      action: "auth.logout",
      data: {
        loggedOut: true,
        provider: "meta-byo"
      }
    } as const;
  };

  const publishPhoto = async (input: PublishPhotoInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "publish.photo",
        data: { media_id: "dry-run-photo", status: "dry-run" }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const mediaRef = resolveMediaReference(input.file);
    if (!mediaRef.ok) {
      return mediaRef;
    }

    const container = await createMediaContainer(auth.data.accessToken, auth.data.igUserId, {
      image_url: mediaRef.data.mediaUrl,
      caption: normalizeCaption(input.caption)
    });
    if (!container.ok) {
      return container;
    }

    const published = await publishMediaContainer(auth.data.accessToken, auth.data.igUserId, container.data.creationId);
    if (!published.ok) {
      return published;
    }

    return {
      ok: true,
      action: "publish.photo",
      data: published.data
    } as const;
  };

  const publishVideo = async (input: PublishVideoInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "publish.video",
        data: { media_id: "dry-run-video", status: "dry-run" }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const mediaRef = resolveMediaReference(input.file);
    if (!mediaRef.ok) {
      return mediaRef;
    }

    const container = await createMediaContainer(auth.data.accessToken, auth.data.igUserId, {
      media_type: "REELS",
      video_url: mediaRef.data.mediaUrl,
      caption: normalizeCaption(input.caption)
    });
    if (!container.ok) {
      return container;
    }

    const ready = await waitForContainerReady(auth.data.accessToken, container.data.creationId);
    if (!ready.ok) {
      return ready;
    }

    const published = await publishMediaContainer(auth.data.accessToken, auth.data.igUserId, container.data.creationId);
    if (!published.ok) {
      return published;
    }

    return {
      ok: true,
      action: "publish.video",
      data: published.data
    } as const;
  };

  const publishCarousel = async (input: PublishCarouselInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "publish.carousel",
        data: { media_id: "dry-run-carousel", status: "dry-run" }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const childIds: string[] = [];
    for (const file of input.files) {
      const mediaRef = resolveMediaReference(file);
      if (!mediaRef.ok) {
        return mediaRef;
      }

      const child = await createMediaContainer(auth.data.accessToken, auth.data.igUserId, {
        image_url: mediaRef.data.mediaUrl,
        is_carousel_item: true
      });

      if (!child.ok) {
        return child;
      }

      const childReady = await waitForContainerReady(auth.data.accessToken, child.data.creationId);
      if (!childReady.ok) {
        return childReady;
      }

      childIds.push(child.data.creationId);
    }

    const parent = await createMediaContainer(auth.data.accessToken, auth.data.igUserId, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: normalizeCaption(input.caption)
    });

    if (!parent.ok) {
      return parent;
    }

    const parentReady = await waitForContainerReady(auth.data.accessToken, parent.data.creationId);
    if (!parentReady.ok) {
      return parentReady;
    }

    const published = await publishMediaContainer(auth.data.accessToken, auth.data.igUserId, parent.data.creationId);
    if (!published.ok) {
      return published;
    }

    return {
      ok: true,
      action: "publish.carousel",
      data: published.data
    } as const;
  };

  const mediaList = async (input: MediaListInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "media.list",
        data: { items: [], next: undefined }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const response = await graphRequest(auth.data.accessToken, `/${auth.data.igUserId}/media`, "GET", {
      fields: "id,caption,media_type,media_url,permalink,timestamp,comments_count,like_count",
      limit: input.limit
    });

    if (!response.ok) {
      return response;
    }

    const data = response.data.data;
    const paging = response.data.paging;
    const next = isRecord(paging) && typeof paging.next === "string" ? sanitizePagingNextUrl(paging.next) : undefined;
    const nextCursor = extractNextCursor(paging);

    return {
      ok: true,
      action: "media.list",
      data: {
        items: Array.isArray(data) ? data : [],
        next,
        next_cursor: nextCursor
      }
    } as const;
  };

  const insightsAccount = async (input: InsightsAccountInput): Promise<ToolResult<AccountInsights>> => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "insights.account",
        data: {
          period: input.period,
          followers_count: 0,
          media_count: 0,
          metrics: {
            reach: 0,
            impressions: 0,
            profile_views: 0,
            accounts_engaged: 0
          }
        }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const accountData = await graphRequest(auth.data.accessToken, `/${auth.data.igUserId}`, "GET", {
      fields: "followers_count,media_count"
    });
    if (!accountData.ok) {
      return accountData;
    }

    const graphPeriod = accountInsightsPeriodToGraph[input.period];

    const fetchAccountMetricValue = async (
      metric: "reach" | "profile_views" | "accounts_engaged" | "views"
    ): Promise<ToolResult<number | null>> => {
      const attempts: Array<Record<string, string>> =
        metric === "reach"
          ? [
              { period: graphPeriod },
              { metric_type: "total_value" },
              { period: "day" }
            ]
          : [
              { period: graphPeriod, metric_type: "total_value" },
              { metric_type: "total_value" },
              { period: graphPeriod }
            ];

      for (const params of attempts) {
        const metricResponse = await graphInsightsRequest(auth.data.accessToken, `/${auth.data.igUserId}/insights`, {
          metric,
          ...params
        });

        if (metricResponse.ok) {
          return {
            ok: true,
            action: "insights.account.metric",
            data: readMetricValue(metricResponse.data.data, metric)
          };
        }

        if (metricResponse.error.code === ERROR_CODES.VALIDATION_ERROR) {
          return metricResponse;
        }

        if (isMissingInsightsScopeError(metricResponse)) {
          return toMissingInsightsScopeError();
        }
      }

      return {
        ok: true,
        action: "insights.account.metric",
        data: null
      };
    };

    const reachMetric = await fetchAccountMetricValue("reach");
    if (!reachMetric.ok) {
      return reachMetric;
    }

    const profileViewsMetric = await fetchAccountMetricValue("profile_views");
    if (!profileViewsMetric.ok) {
      return profileViewsMetric;
    }

    const accountsEngagedMetric = await fetchAccountMetricValue("accounts_engaged");
    if (!accountsEngagedMetric.ok) {
      return accountsEngagedMetric;
    }

    const viewsMetric = await fetchAccountMetricValue("views");
    if (!viewsMetric.ok) {
      return viewsMetric;
    }

    return {
      ok: true,
      action: "insights.account",
      data: {
        period: input.period,
        followers_count: toFiniteNumber(accountData.data.followers_count) ?? 0,
        media_count: toFiniteNumber(accountData.data.media_count) ?? 0,
        metrics: {
          reach: reachMetric.data ?? 0,
          impressions: viewsMetric.data ?? 0,
          profile_views: profileViewsMetric.data ?? 0,
          accounts_engaged: accountsEngagedMetric.data ?? 0
        }
      }
    } as const;
  };

  const insightsMedia = async (input: InsightsMediaInput): Promise<ToolResult<MediaInsights>> => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "insights.media",
        data: {
          id: input.id,
          media_type: "IMAGE",
          permalink: "https://instagram.com/p/dry-run/",
          metrics: {
            reach: null,
            impressions: null,
            likes: 0,
            comments: 0,
            saved: null,
            shares: null
          }
        }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const mediaMetadata = await graphRequest(auth.data.accessToken, `/${input.id}`, "GET", {
      fields: "id,media_type,permalink,like_count,comments_count,timestamp"
    });
    if (!mediaMetadata.ok) {
      return mediaMetadata;
    }

    const mediaId = typeof mediaMetadata.data.id === "string" ? mediaMetadata.data.id : input.id;
    const mediaType = typeof mediaMetadata.data.media_type === "string" ? mediaMetadata.data.media_type : undefined;
    const permalink = typeof mediaMetadata.data.permalink === "string" ? mediaMetadata.data.permalink : undefined;
    if (!mediaType || !permalink) {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta media metadata response missing required fields", mediaMetadata.data);
    }

    const mediaInsights = await fetchMediaInsightsMetrics(auth.data.accessToken, mediaId);
    if (!mediaInsights.ok) {
      return mediaInsights;
    }

    return {
      ok: true,
      action: "insights.media",
      data: {
        id: mediaId,
        media_type: mediaType,
        permalink,
        metrics: {
          reach: mediaInsights.data.reach,
          impressions: mediaInsights.data.impressions,
          likes: toFiniteNumber(mediaMetadata.data.like_count) ?? 0,
          comments: toFiniteNumber(mediaMetadata.data.comments_count) ?? 0,
          saved: mediaInsights.data.saved,
          shares: mediaInsights.data.shares
        }
      }
    } as const;
  };

  const analyticsTopPosts = async (
    input: AnalyticsTopPostsInput
  ): Promise<ToolResult<{ days: number; limit: number; items: TopPostItem[] }>> => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "analytics.top-posts",
        data: {
          days: input.days,
          limit: input.limit,
          items: []
        }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const listFetchLimit = Math.min(100, Math.max(input.limit * 4, 25));
    const mediaResponse = await graphRequest(auth.data.accessToken, `/${auth.data.igUserId}/media`, "GET", {
      fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count",
      limit: listFetchLimit
    });
    if (!mediaResponse.ok) {
      return mediaResponse;
    }

    const cutoffMs = Date.now() - input.days * 24 * 60 * 60 * 1000;
    const rawEntries = Array.isArray(mediaResponse.data.data) ? mediaResponse.data.data : [];
    const entries = rawEntries
      .map((entry) => toAnalyticsMediaEntry(entry))
      .filter((entry): entry is AnalyticsMediaEntry => Boolean(entry))
      .filter((entry) => {
        const timestampMs = Date.parse(entry.timestamp);
        return Number.isFinite(timestampMs) && timestampMs >= cutoffMs;
      });

    const topPosts: TopPostItem[] = [];
    for (const entry of entries) {
      const mediaInsights = await fetchMediaInsightsMetrics(auth.data.accessToken, entry.id);
      if (!mediaInsights.ok) {
        return mediaInsights;
      }

      const engagementScore =
        entry.like_count +
        entry.comments_count * 2 +
        (mediaInsights.data.saved ?? 0) * 3 +
        (mediaInsights.data.shares ?? 0) * 3;

      topPosts.push({
        id: entry.id,
        media_type: entry.media_type,
        permalink: entry.permalink,
        timestamp: entry.timestamp,
        ...(typeof entry.caption === "string" ? { caption: entry.caption } : {}),
        metrics: {
          reach: mediaInsights.data.reach,
          impressions: mediaInsights.data.impressions,
          likes: entry.like_count,
          comments: entry.comments_count,
          saved: mediaInsights.data.saved,
          shares: mediaInsights.data.shares
        },
        engagement_score: engagementScore
      });
    }

    topPosts.sort((a, b) => {
      if (b.engagement_score !== a.engagement_score) {
        return b.engagement_score - a.engagement_score;
      }

      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    });

    return {
      ok: true,
      action: "analytics.top-posts",
      data: {
        days: input.days,
        limit: input.limit,
        items: topPosts.slice(0, input.limit)
      }
    } as const;
  };

  const commentsList = async (input: CommentsListInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "comments.list",
        data: { items: [] }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const response = await graphRequest(auth.data.accessToken, `/${input.mediaId}/comments`, "GET", {
      fields: "id,text,timestamp,username,like_count,replies{id,text,timestamp,username}",
      limit: 50
    });

    if (!response.ok) {
      return response;
    }

    return {
      ok: true,
      action: "comments.list",
      data: {
        items: Array.isArray(response.data.data) ? response.data.data : []
      }
    } as const;
  };

  const commentsReply = async (input: CommentsReplyInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "comments.reply",
        data: { reply_id: "dry-run-reply", status: "dry-run" }
      } as const;
    }

    const auth = await requireAuth(context);
    if (!auth.ok) {
      return auth;
    }

    const response = await graphRequest(auth.data.accessToken, `/${input.commentId}/replies`, "POST", {
      message: input.text
    });

    if (!response.ok) {
      return response;
    }

    const replyId = response.data.id;
    if (typeof replyId !== "string") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Meta did not return reply id", response.data);
    }

    return {
      ok: true,
      action: "comments.reply",
      data: {
        reply_id: replyId,
        status: "published"
      }
    } as const;
  };

  return {
    name: "meta-byo",
    auth: {
      start: authStart,
      finish: authFinish,
      status: authStatus,
      logout: authLogout
    },
    publish: {
      photo: publishPhoto,
      video: publishVideo,
      carousel: publishCarousel
    },
    media: {
      list: mediaList
    },
    comments: {
      list: commentsList,
      reply: commentsReply
    },
    insights: {
      account: insightsAccount,
      media: insightsMedia
    },
    analytics: {
      topPosts: analyticsTopPosts
    }
  };
};
