import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  bootstrapExchangeSchema,
  commentsReplySchema,
  oauthCallbackQuerySchema,
  oauthCallbackSchema,
  publishCarouselSchema,
  publishPhotoSchema,
  publishVideoSchema
} from "../schemas/common.js";
import { buildOauthLoginUrl, exchangeOauthCode, readOauthConfig } from "../services/oauth-client.js";
import { OneTimeBootstrapStore } from "../services/bootstrap-store.js";
import { FileRateLimiter } from "../services/rate-limiter.js";
import { createSignedToken, verifySignedToken } from "../services/token-signing.js";
import type { TokenStore } from "../services/token-store.js";

const mediaListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

const commentsListQuerySchema = z.object({
  media: z.string().min(1)
});

type OauthStateClaims = {
  typ: "oauth-state";
  exp: number;
  iat: number;
  nonce: string;
};

type BootstrapProfile = {
  igAccountId: string;
  igUsername?: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  discoveredPages: Array<{
    page_id: string;
    page_name: string;
    ig_account_id?: string;
    ig_username?: string;
  }>;
};

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const parseJsonRecord = async (response: Response): Promise<Record<string, unknown> | undefined> => {
  try {
    const raw = (await response.json()) as unknown;
    return isRecord(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
};

const graphGet = async (
  path: string,
  accessToken: string
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; details?: unknown }> => {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", accessToken);

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      details: { reason: error instanceof Error ? error.message : String(error) }
    };
  }

  const parsed = await parseJsonRecord(response);
  if (!response.ok) {
    return { ok: false, status: response.status, details: { status: response.status, body: parsed } };
  }

  return { ok: true, data: parsed ?? {} };
};

const discoverBootstrapProfile = async (
  userAccessToken: string
): Promise<{ ok: true; profile: BootstrapProfile } | { ok: false; status: number; message: string; details?: unknown }> => {
  const accounts = await graphGet("/me/accounts?fields=id,name,access_token", userAccessToken);
  if (!accounts.ok) {
    return {
      ok: false,
      status: accounts.status,
      message: "Failed to list Facebook Pages for this login.",
      details: accounts.details
    };
  }

  const rows = Array.isArray(accounts.data.data) ? accounts.data.data : [];
  const discoveredPages: BootstrapProfile["discoveredPages"] = [];

  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }

    const pageId = getString(row.id);
    const pageName = getString(row.name) ?? "Untitled Page";
    const pageAccessToken = getString(row.access_token);
    if (!pageId || !pageAccessToken) {
      continue;
    }

    const pageInfo = await graphGet(`/${pageId}?fields=instagram_business_account{id,username}`, pageAccessToken);
    if (!pageInfo.ok) {
      discoveredPages.push({ page_id: pageId, page_name: pageName });
      continue;
    }

    const igNode = isRecord(pageInfo.data.instagram_business_account) ? pageInfo.data.instagram_business_account : undefined;
    const igAccountId = getString(igNode?.id);
    const igUsername = getString(igNode?.username);
    discoveredPages.push({
      page_id: pageId,
      page_name: pageName,
      ...(igAccountId ? { ig_account_id: igAccountId } : {}),
      ...(igUsername ? { ig_username: igUsername } : {})
    });

    if (igAccountId) {
      return {
        ok: true,
        profile: {
          igAccountId,
          igUsername,
          pageId,
          pageName,
          pageAccessToken,
          discoveredPages
        }
      };
    }
  }

  return {
    ok: false,
    status: 422,
    message: "No Facebook Page connected to an Instagram Professional account was found.",
    details: { discovered_pages: discoveredPages }
  };
};

const unauthorized = (reply: FastifyReply) =>
  reply.status(401).send({
    ok: false,
    error: {
      code: "AUTH_REQUIRED",
      message: "Missing or invalid session"
    }
  });

const getBearerToken = (request: FastifyRequest): string | undefined => {
  const auth = request.headers.authorization;
  if (!auth) {
    return undefined;
  }

  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
};

const requireSession = (request: FastifyRequest, reply: FastifyReply, tokenStore: TokenStore): { tenantId: string } | undefined => {
  const token = getBearerToken(request);
  if (!token) {
    request.log.warn(
      { event: "auth.session_missing", path: request.url, ip: request.ip },
      "Missing bearer token for protected route"
    );
    void unauthorized(reply);
    return undefined;
  }

  const session = tokenStore.getSession(token);
  if (!session) {
    request.log.warn(
      { event: "auth.session_invalid", path: request.url, ip: request.ip },
      "Invalid or expired bearer token for protected route"
    );
    void unauthorized(reply);
    return undefined;
  }

  return {
    tenantId: session.tenantId
  };
};

export const registerRoutes = (
  app: FastifyInstance,
  tokenStore: TokenStore,
  options: { signingSecret: string }
): void => {
  const signingSecret = options.signingSecret;
  const rateLimitMax = parsePositiveInt(process.env.IG_CENTRAL_RATE_LIMIT_MAX, 120);
  const rateLimitWindowMs = parsePositiveInt(process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS, 60_000);
  const oauthStateTtlMs = parsePositiveInt(process.env.IG_CENTRAL_OAUTH_STATE_TTL_MS, 10 * 60_000);
  const bootstrapTtlMs = parsePositiveInt(process.env.IG_CENTRAL_BOOTSTRAP_TTL_MS, 5 * 60_000);
  const bootstrapMaxCodes = parsePositiveInt(process.env.IG_CENTRAL_BOOTSTRAP_MAX_CODES, 10_000);
  const rateLimiter = new FileRateLimiter({
    max: rateLimitMax,
    windowMs: rateLimitWindowMs,
    filePath: process.env.IG_CENTRAL_RATE_LIMIT_FILE
  });
  const bootstrapStore = new OneTimeBootstrapStore({
    ttlMs: bootstrapTtlMs,
    maxEntries: bootstrapMaxCodes
  });

  const issueOauthState = (): string => {
    const now = Date.now();
    return createSignedToken<OauthStateClaims>(
      {
        typ: "oauth-state",
        iat: now,
        exp: now + oauthStateTtlMs,
        nonce: crypto.randomBytes(16).toString("base64url")
      },
      signingSecret
    );
  };

  const isOauthStateValid = (state: string): boolean => {
    const parsed = verifySignedToken<OauthStateClaims>(state, signingSecret);
    if (!parsed) {
      return false;
    }

    if (parsed.typ !== "oauth-state") {
      return false;
    }

    return Number.isFinite(parsed.exp) && parsed.exp > Date.now();
  };

  const handleOauthCodeExchange = async (
    payload: z.infer<typeof oauthCallbackSchema>
  ): Promise<
    | { ok: true; accessToken: string; accessTokenExpiresAt?: number; tenantId: string }
    | { ok: false; status: number; code: string; message: string; details?: unknown }
  > => {
    if (!isOauthStateValid(payload.state)) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid or expired oauth state"
      };
    }

    const oauthConfig = readOauthConfig();
    if (!oauthConfig.ok) {
      return {
        ok: false,
        status: 503,
        code: "CONFIG_ERROR",
        message: oauthConfig.message
      };
    }

    const exchanged = await exchangeOauthCode(oauthConfig.config, payload.code);
    if (!exchanged.ok) {
      return {
        ok: false,
        status: exchanged.status,
        code: exchanged.status === 401 ? "AUTH_REQUIRED" : "PROVIDER_ERROR",
        message: exchanged.message,
        details: exchanged.details
      };
    }

    return {
      ok: true,
      accessToken: exchanged.accessToken,
      accessTokenExpiresAt: exchanged.accessTokenExpiresAt,
      tenantId: exchanged.tenantId
    };
  };

  const issueBootstrapCode = async (
    accessToken: string,
    tenantId: string
  ): Promise<
    | { ok: true; bootstrapCode: string; expiresAt: number; profile: BootstrapProfile }
    | { ok: false; status: number; code: string; message: string; details?: unknown }
  > => {
    const discovered = await discoverBootstrapProfile(accessToken);
    if (!discovered.ok) {
      return {
        ok: false,
        status: discovered.status,
        code: "PROVIDER_ERROR",
        message: discovered.message,
        details: discovered.details
      };
    }

    const issued = bootstrapStore.issue({
      tenantId,
      igAccountId: discovered.profile.igAccountId,
      igUsername: discovered.profile.igUsername,
      pageId: discovered.profile.pageId,
      pageName: discovered.profile.pageName,
      pageAccessToken: discovered.profile.pageAccessToken
    });

    return {
      ok: true,
      bootstrapCode: issued.bootstrapCode,
      expiresAt: issued.expiresAt,
      profile: discovered.profile
    };
  };

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/health")) {
      return;
    }

    const token = getBearerToken(request);
    const key = token
      ? `token:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 24)}`
      : `ip:${request.ip || "unknown"}`;
    let rateLimit: Awaited<ReturnType<FileRateLimiter["check"]>>;
    try {
      rateLimit = await rateLimiter.check(key);
    } catch (error) {
      request.log.error(
        {
          event: "rate_limit.check_failed",
          path: request.url,
          ip: request.ip,
          reason: error instanceof Error ? error.message : String(error)
        },
        "Rate limit check failed"
      );
      return reply.status(503).send({
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message: "Rate limiter is temporarily unavailable"
        }
      });
    }

    if (!rateLimit.allowed) {
      const retryAfterSec = rateLimit.retryAfterSeconds ?? 1;
      return reply.status(429).send({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please retry later.",
          details: { retry_after_seconds: retryAfterSec }
        }
      });
    }
  });

  app.get("/health", async () => ({ ok: true, status: "up" }));

  app.post("/oauth/start", async (_request, reply) => {
    const oauthConfig = readOauthConfig();
    if (!oauthConfig.ok) {
      return reply.status(503).send({
        ok: false,
        error: {
          code: "CONFIG_ERROR",
          message: oauthConfig.message
        }
      });
    }

    const state = issueOauthState();
    return {
      ok: true,
      login_url: buildOauthLoginUrl(oauthConfig.config, state),
      state,
      redirect_uri: oauthConfig.config.redirectUri
    };
  });

  app.post("/oauth/callback", async (request, reply) => {
    const parsed = oauthCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid oauth callback payload",
          details: parsed.error.flatten()
        }
      });
    }

    const exchanged = await handleOauthCodeExchange(parsed.data);
    if (!exchanged.ok) {
      return reply.status(exchanged.status).send({
        ok: false,
        error: {
          code: exchanged.code,
          message: exchanged.message,
          ...(exchanged.details ? { details: exchanged.details } : {})
        }
      });
    }

    const session = tokenStore.createSession(exchanged.tenantId);
    const bootstrap = await issueBootstrapCode(exchanged.accessToken, exchanged.tenantId);

    return {
      ok: true,
      session_token: session.sessionToken,
      access_token: exchanged.accessToken,
      expires_at: session.expiresAt,
      access_token_expires_at: exchanged.accessTokenExpiresAt,
      ...(bootstrap.ok
        ? {
            bootstrap_code: bootstrap.bootstrapCode,
            bootstrap_expires_at: bootstrap.expiresAt,
            bootstrap_profile: {
              ig_account_id: bootstrap.profile.igAccountId,
              ig_username: bootstrap.profile.igUsername,
              page_id: bootstrap.profile.pageId,
              page_name: bootstrap.profile.pageName
            }
          }
        : {})
    };
  });

  app.get("/oauth/callback", async (request, reply) => {
    const parsed = oauthCallbackQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.type("text/plain; charset=utf-8").status(400).send("Invalid OAuth callback query.");
    }

    const query = parsed.data;
    const oauthError = query.error_description ?? query.error;
    if (oauthError) {
      return reply.type("text/plain; charset=utf-8").status(400).send(`Facebook login failed: ${oauthError}`);
    }

    if (!query.code || !query.state) {
      return reply.type("text/plain; charset=utf-8").status(400).send("Missing OAuth code/state.");
    }

    const exchanged = await handleOauthCodeExchange({ code: query.code, state: query.state });
    if (!exchanged.ok) {
      return reply.type("text/plain; charset=utf-8").status(exchanged.status).send(`Login failed: ${exchanged.message}`);
    }

    const bootstrap = await issueBootstrapCode(exchanged.accessToken, exchanged.tenantId);
    if (!bootstrap.ok) {
      return reply
        .type("text/plain; charset=utf-8")
        .status(bootstrap.status)
        .send(`Login ok, but setup failed: ${bootstrap.message}. Check Instagram/Page linkage and try again.`);
    }

    const expiresAtIso = new Date(bootstrap.expiresAt).toISOString();
    return reply
      .type("text/plain; charset=utf-8")
      .status(200)
      .send(
        [
          "Login completed.",
          "",
          `Bootstrap code: ${bootstrap.bootstrapCode}`,
          `Expires at: ${expiresAtIso}`,
          "",
          "Run this in your agent terminal:",
          `instacli setup central-bootstrap --code ${bootstrap.bootstrapCode} --json --quiet`
        ].join("\n")
      );
  });

  app.post("/bootstrap/exchange", async (request, reply) => {
    const parsed = bootstrapExchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid bootstrap exchange payload",
          details: parsed.error.flatten()
        }
      });
    }

    const bootstrap = bootstrapStore.consume(parsed.data.bootstrap_code);
    if (!bootstrap) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "Invalid, expired, or already used bootstrap code"
        }
      });
    }

    const session = tokenStore.createSession(bootstrap.tenantId);
    return {
      ok: true,
      provider: "meta-byo",
      ig_account_id: bootstrap.igAccountId,
      ig_username: bootstrap.igUsername,
      page_id: bootstrap.pageId,
      page_name: bootstrap.pageName,
      page_access_token: bootstrap.pageAccessToken,
      session_token: session.sessionToken,
      expires_at: session.expiresAt
    };
  });

  app.get("/session", async (request, reply) => {
    const session = requireSession(request, reply, tokenStore);
    if (!session) {
      return;
    }

    return {
      ok: true,
      tenant: session.tenantId,
      active: true
    };
  });

  app.post("/publish/photo", async (request, reply) => {
    if (!requireSession(request, reply, tokenStore)) {
      return;
    }

    const parsed = publishPhotoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid photo payload",
          details: parsed.error.flatten()
        }
      });
    }

    return {
      ok: true,
      media_id: `photo_${Date.now()}`,
      status: "queued"
    };
  });

  app.post("/publish/video", async (request, reply) => {
    if (!requireSession(request, reply, tokenStore)) {
      return;
    }

    const parsed = publishVideoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid video payload",
          details: parsed.error.flatten()
        }
      });
    }

    return {
      ok: true,
      media_id: `video_${Date.now()}`,
      status: "queued"
    };
  });

  app.post("/publish/carousel", async (request, reply) => {
    if (!requireSession(request, reply, tokenStore)) {
      return;
    }

    const parsed = publishCarouselSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid carousel payload",
          details: parsed.error.flatten()
        }
      });
    }

    return {
      ok: true,
      media_id: `carousel_${Date.now()}`,
      status: "queued"
    };
  });

  app.get("/media/list", async (request, reply) => {
    if (!requireSession(request, reply, tokenStore)) {
      return;
    }

    const parsed = mediaListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid limit",
          details: parsed.error.flatten()
        }
      });
    }

    return {
      ok: true,
      items: Array.from({ length: parsed.data.limit }, (_, index) => ({
        id: `media_${index + 1}`,
        caption: `Mock media ${index + 1}`
      }))
    };
  });

  app.get("/comments/list", async (request, reply) => {
    if (!requireSession(request, reply, tokenStore)) {
      return;
    }

    const parsed = commentsListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "media query param is required",
          details: parsed.error.flatten()
        }
      });
    }

    return {
      ok: true,
      items: [
        {
          id: `comment_${parsed.data.media}_1`,
          text: "Mock comment"
        }
      ]
    };
  });

  app.post("/comments/reply", async (request, reply) => {
    if (!requireSession(request, reply, tokenStore)) {
      return;
    }

    const parsed = commentsReplySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid comments reply payload",
          details: parsed.error.flatten()
        }
      });
    }

    return {
      ok: true,
      reply_id: `reply_${Date.now()}`,
      status: "published"
    };
  });
};
