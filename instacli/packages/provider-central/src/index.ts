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

const DEFAULT_CENTRAL_API_URL = "http://127.0.0.1:8787";
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const LOCALHOST_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

type HttpMethod = "GET" | "POST";

type RequestOptions = {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  sessionToken?: string;
};

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

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

const parseTimeoutMs = (): number => {
  const raw = process.env.IG_CENTRAL_FETCH_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
};

const resolveBaseUrl = (): URL | ToolError => {
  const raw = process.env.IG_CENTRAL_API_URL ?? DEFAULT_CENTRAL_API_URL;
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return toolError(ERROR_CODES.CONFIG_ERROR, "Invalid IG_CENTRAL_API_URL. Provide a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return toolError(ERROR_CODES.CONFIG_ERROR, "IG_CENTRAL_API_URL must use http:// or https://.");
  }

  const isLocalhost = LOCALHOST_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !isLocalhost) {
    return toolError(ERROR_CODES.CONFIG_ERROR, "IG_CENTRAL_API_URL must use https:// for non-localhost hosts.", {
      url: raw
    });
  }

  return url;
};

const isToolError = (value: URL | ToolError): value is ToolError => (value as ToolError).ok === false;

const fetchWithTimeout = async (input: URL, init: RequestInit): Promise<Response> => {
  const timeoutMs = parseTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const toHttpError = (status: number, body: unknown): ToolError => {
  if (status === 401) {
    return toolError(ERROR_CODES.AUTH_REQUIRED, "Central API session is invalid or missing", body);
  }

  return toolError(ERROR_CODES.PROVIDER_ERROR, "Central API request failed", { status, body });
};

const callCentral = async (options: RequestOptions): Promise<ToolResult<Record<string, unknown>>> => {
  const baseUrl = resolveBaseUrl();
  if (isToolError(baseUrl)) {
    return baseUrl;
  }

  const url = new URL(options.path, baseUrl);
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...(options.sessionToken ? { Authorization: `Bearer ${options.sessionToken}` } : {})
      },
      body: options.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined
    });
  } catch (error) {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Central API request failed", {
      status: 0,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  const body = (await parseJson(response)) as Record<string, unknown> | null;

  if (!response.ok) {
    return toHttpError(response.status, body);
  }

  return {
    ok: true,
    action: "central.request",
    data: body ?? {}
  };
};

const getSessionToken = async (context: ProviderContext): Promise<string | undefined> =>
  context.store.getSecret("central", "sessionToken");

const requireSession = async (context: ProviderContext): Promise<ToolResult<{ sessionToken: string }>> => {
  const sessionToken = await getSessionToken(context);
  if (!sessionToken) {
    return toolError(ERROR_CODES.AUTH_REQUIRED, "Run ig auth login --provider central first.");
  }

  return {
    ok: true,
    action: "session.require",
    data: { sessionToken }
  };
};

const mapPublishResponse = (
  action: "publish.photo" | "publish.video" | "publish.carousel",
  response: Record<string, unknown>
): ToolResult<{ media_id: string; status: string }> => {
  const mediaId = response.media_id;
  const status = response.status;

  if (typeof mediaId !== "string" || typeof status !== "string") {
    return toolError(ERROR_CODES.PROVIDER_ERROR, "Central API response missing publish fields", response);
  }

  return {
    ok: true,
    action,
    data: {
      media_id: mediaId,
      status
    }
  };
};

export const createCentralProvider = (context: ProviderContext): Provider => {
  const authStart = async (_input?: AuthStartInput) => {
    const baseUrl = resolveBaseUrl();
    if (isToolError(baseUrl)) {
      return baseUrl;
    }

    if (context.dryRun) {
      return {
        ok: true,
        action: "auth.start",
        data: {
          loginUrl: new URL("/oauth/start", baseUrl).toString(),
          state: "dry-run-state",
          redirectUri: "http://127.0.0.1/callback"
        }
      } as const;
    }

    const response = await callCentral({ method: "POST", path: "/oauth/start" });
    if (!response.ok) {
      return response;
    }

    const loginUrl = response.data.login_url;
    const state = response.data.state;
    const redirectUri = response.data.redirect_uri;

    if (typeof loginUrl !== "string" || typeof state !== "string" || typeof redirectUri !== "string") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Central API /oauth/start returned invalid payload", response.data);
    }

    context.store.setCentralConfig({});

    return {
      ok: true,
      action: "auth.start",
      data: {
        loginUrl,
        state,
        redirectUri
      }
    } as const;
  };

  const authFinish = async (input: AuthFinishInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "auth.finish",
        data: {
          authenticated: true,
          provider: "central"
        }
      } as const;
    }

    const response = await callCentral({ method: "POST", path: "/oauth/callback", body: input });
    if (!response.ok) {
      return response;
    }

    const sessionToken = response.data.session_token;
    const accessToken = response.data.access_token;
    const expiresAt = response.data.expires_at;

    if (typeof sessionToken !== "string") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Central API /oauth/callback missing session_token", response.data);
    }

    await context.store.setSecret("central", "sessionToken", sessionToken);
    if (typeof accessToken === "string") {
      await context.store.setSecret("central", "accessToken", accessToken);
    }

    context.store.setCentralConfig({
      hasSessionToken: true,
      hasAccessToken: typeof accessToken === "string",
      expiresAt: typeof expiresAt === "number" ? expiresAt : undefined
    });

    return {
      ok: true,
      action: "auth.finish",
      data: {
        authenticated: true,
        provider: "central"
      }
    } as const;
  };

  const authStatus = async () => {
    const sessionToken = await getSessionToken(context);

    if (!sessionToken) {
      return {
        ok: true,
        action: "auth.status",
        data: {
          authenticated: false,
          provider: "central"
        }
      } as const;
    }

    if (context.dryRun) {
      return {
        ok: true,
        action: "auth.status",
        data: {
          authenticated: true,
          provider: "central"
        }
      } as const;
    }

    const response = await callCentral({ method: "GET", path: "/session", sessionToken });

    if (!response.ok) {
      if (!response.ok && response.error.code === ERROR_CODES.AUTH_REQUIRED) {
        return {
          ok: true,
          action: "auth.status",
          data: {
            authenticated: false,
            provider: "central"
          }
        } as const;
      }

      return response;
    }

    return {
      ok: true,
      action: "auth.status",
      data: {
        authenticated: true,
        provider: "central"
      }
    } as const;
  };

  const authLogout = async () => {
    await context.store.deleteSecret("central", "sessionToken");
    await context.store.deleteSecret("central", "accessToken");
    context.store.clearProvider("central");

    return {
      ok: true,
      action: "auth.logout",
      data: {
        loggedOut: true,
        provider: "central"
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

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const response = await callCentral({
      method: "POST",
      path: "/publish/photo",
      body: input,
      sessionToken: session.data.sessionToken
    });
    if (!response.ok) {
      return response;
    }

    return mapPublishResponse("publish.photo", response.data);
  };

  const publishVideo = async (input: PublishVideoInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "publish.video",
        data: { media_id: "dry-run-video", status: "dry-run" }
      } as const;
    }

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const response = await callCentral({
      method: "POST",
      path: "/publish/video",
      body: input,
      sessionToken: session.data.sessionToken
    });
    if (!response.ok) {
      return response;
    }

    return mapPublishResponse("publish.video", response.data);
  };

  const publishCarousel = async (input: PublishCarouselInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "publish.carousel",
        data: { media_id: "dry-run-carousel", status: "dry-run" }
      } as const;
    }

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const response = await callCentral({
      method: "POST",
      path: "/publish/carousel",
      body: input,
      sessionToken: session.data.sessionToken
    });
    if (!response.ok) {
      return response;
    }

    return mapPublishResponse("publish.carousel", response.data);
  };

  const mediaList = async (input: MediaListInput) => {
    if (context.dryRun) {
      return {
        ok: true,
        action: "media.list",
        data: { items: [] }
      } as const;
    }

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const path = `/media/list${typeof input.limit === "number" ? `?limit=${input.limit}` : ""}`;
    const response = await callCentral({ method: "GET", path, sessionToken: session.data.sessionToken });
    if (!response.ok) {
      return response;
    }

    return {
      ok: true,
      action: "media.list",
      data: {
        items: Array.isArray(response.data.items) ? response.data.items : [],
        next: typeof response.data.next === "string" ? response.data.next : undefined
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

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const path = `/comments/list?media=${encodeURIComponent(input.mediaId)}`;
    const response = await callCentral({ method: "GET", path, sessionToken: session.data.sessionToken });
    if (!response.ok) {
      return response;
    }

    return {
      ok: true,
      action: "comments.list",
      data: {
        items: Array.isArray(response.data.items) ? response.data.items : []
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

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const response = await callCentral({
      method: "POST",
      path: "/comments/reply",
      body: {
        comment: input.commentId,
        text: input.text
      },
      sessionToken: session.data.sessionToken
    });
    if (!response.ok) {
      return response;
    }

    const replyId = response.data.reply_id;
    const status = response.data.status;

    if (typeof replyId !== "string" || typeof status !== "string") {
      return toolError(ERROR_CODES.PROVIDER_ERROR, "Central API response missing reply fields", response.data);
    }

    return {
      ok: true,
      action: "comments.reply",
      data: {
        reply_id: replyId,
        status
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

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const path = `/insights/account?period=${encodeURIComponent(input.period)}`;
    const response = await callCentral({ method: "GET", path, sessionToken: session.data.sessionToken });
    if (!response.ok) {
      return response;
    }

    const metrics = isRecord(response.data.metrics) ? response.data.metrics : {};

    return {
      ok: true,
      action: "insights.account",
      data: {
        period: input.period,
        followers_count: toFiniteNumber(response.data.followers_count) ?? 0,
        media_count: toFiniteNumber(response.data.media_count) ?? 0,
        metrics: {
          reach: toFiniteNumber(metrics.reach) ?? 0,
          impressions: toFiniteNumber(metrics.impressions) ?? 0,
          profile_views: toFiniteNumber(metrics.profile_views) ?? 0,
          accounts_engaged: toFiniteNumber(metrics.accounts_engaged) ?? 0
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

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const path = `/insights/media?id=${encodeURIComponent(input.id)}`;
    const response = await callCentral({ method: "GET", path, sessionToken: session.data.sessionToken });
    if (!response.ok) {
      return response;
    }

    const metrics = isRecord(response.data.metrics) ? response.data.metrics : {};
    const mediaType = typeof response.data.media_type === "string" ? response.data.media_type : "UNKNOWN";
    const permalink = typeof response.data.permalink === "string" ? response.data.permalink : "";

    return {
      ok: true,
      action: "insights.media",
      data: {
        id: typeof response.data.id === "string" ? response.data.id : input.id,
        media_type: mediaType,
        permalink,
        metrics: {
          reach: toFiniteNumber(metrics.reach) ?? null,
          impressions: toFiniteNumber(metrics.impressions) ?? null,
          likes: toFiniteNumber(metrics.likes) ?? 0,
          comments: toFiniteNumber(metrics.comments) ?? 0,
          saved: toFiniteNumber(metrics.saved) ?? null,
          shares: toFiniteNumber(metrics.shares) ?? null
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

    const session = await requireSession(context);
    if (!session.ok) {
      return session;
    }

    const path = `/analytics/top-posts?days=${input.days}&limit=${input.limit}`;
    const response = await callCentral({ method: "GET", path, sessionToken: session.data.sessionToken });
    if (!response.ok) {
      return response;
    }

    const itemsRaw = Array.isArray(response.data.items) ? response.data.items : [];
    const items: TopPostItem[] = itemsRaw
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map((item) => {
        const metrics = isRecord(item.metrics) ? item.metrics : {};
        return {
          id: typeof item.id === "string" ? item.id : "",
          media_type: typeof item.media_type === "string" ? item.media_type : "UNKNOWN",
          permalink: typeof item.permalink === "string" ? item.permalink : "",
          timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
          ...(typeof item.caption === "string" ? { caption: item.caption } : {}),
          metrics: {
            reach: toFiniteNumber(metrics.reach) ?? null,
            impressions: toFiniteNumber(metrics.impressions) ?? null,
            likes: toFiniteNumber(metrics.likes) ?? 0,
            comments: toFiniteNumber(metrics.comments) ?? 0,
            saved: toFiniteNumber(metrics.saved) ?? null,
            shares: toFiniteNumber(metrics.shares) ?? null
          },
          engagement_score: toFiniteNumber(item.engagement_score) ?? 0
        };
      })
      .filter((item) => item.id.length > 0);

    return {
      ok: true,
      action: "analytics.top-posts",
      data: {
        days: input.days,
        limit: input.limit,
        items
      }
    } as const;
  };

  return {
    name: "central",
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
