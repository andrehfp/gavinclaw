import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { commentsReplySchema, oauthCallbackSchema, publishCarouselSchema, publishPhotoSchema, publishVideoSchema } from "../schemas/common.js";
import { buildOauthLoginUrl, exchangeOauthCode, readOauthConfig } from "../services/oauth-client.js";
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

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
  const rateLimiter = new FileRateLimiter({
    max: rateLimitMax,
    windowMs: rateLimitWindowMs,
    filePath: process.env.IG_CENTRAL_RATE_LIMIT_FILE
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

    if (!isOauthStateValid(parsed.data.state)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid or expired oauth state"
        }
      });
    }

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

    const exchanged = await exchangeOauthCode(oauthConfig.config, parsed.data.code);
    if (!exchanged.ok) {
      return reply.status(exchanged.status).send({
        ok: false,
        error: {
          code: exchanged.status === 401 ? "AUTH_REQUIRED" : "PROVIDER_ERROR",
          message: exchanged.message,
          details: exchanged.details
        }
      });
    }

    const session = tokenStore.createSession(exchanged.tenantId);

    return {
      ok: true,
      session_token: session.sessionToken,
      access_token: exchanged.accessToken,
      expires_at: session.expiresAt,
      access_token_expires_at: exchanged.accessTokenExpiresAt
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
