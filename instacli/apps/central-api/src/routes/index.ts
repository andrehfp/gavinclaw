import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { commentsReplySchema, oauthCallbackSchema, publishCarouselSchema, publishPhotoSchema, publishVideoSchema } from "../schemas/common.js";
import type { TokenStore } from "../services/token-store.js";

const mediaListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

const commentsListQuerySchema = z.object({
  media: z.string().min(1)
});

type RateLimitBucket = {
  count: number;
  resetAt: number;
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

export const registerRoutes = (app: FastifyInstance, tokenStore: TokenStore): void => {
  const rateLimitMax = parsePositiveInt(process.env.IG_CENTRAL_RATE_LIMIT_MAX, 120);
  const rateLimitWindowMs = parsePositiveInt(process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS, 60_000);
  const oauthStateTtlMs = parsePositiveInt(process.env.IG_CENTRAL_OAUTH_STATE_TTL_MS, 10 * 60_000);
  const oauthStateMax = parsePositiveInt(process.env.IG_CENTRAL_OAUTH_STATE_MAX, 10_000);
  const buckets = new Map<string, RateLimitBucket>();
  const oauthStates = new Map<string, number>();
  let lastCleanupAt = 0;

  const issueOauthState = (): string => {
    while (oauthStates.size >= oauthStateMax) {
      const oldestState = oauthStates.keys().next().value;
      if (!oldestState) {
        break;
      }
      oauthStates.delete(oldestState);
    }

    const state = crypto.randomUUID();
    oauthStates.set(state, Date.now() + oauthStateTtlMs);
    return state;
  };

  const consumeOauthState = (state: string): boolean => {
    const expiresAt = oauthStates.get(state);
    oauthStates.delete(state);
    return typeof expiresAt === "number" && expiresAt > Date.now();
  };

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/health")) {
      return;
    }

    const now = Date.now();
    if (now - lastCleanupAt >= rateLimitWindowMs) {
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(key);
        }
      }
      for (const [state, expiresAt] of oauthStates.entries()) {
        if (expiresAt <= now) {
          oauthStates.delete(state);
        }
      }
      lastCleanupAt = now;
    }

    const token = getBearerToken(request);
    const key = token
      ? `token:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 24)}`
      : `ip:${request.ip || "unknown"}`;
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > rateLimitMax) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
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

  app.post("/oauth/start", async () => {
    const state = issueOauthState();
    return {
      ok: true,
      login_url: `https://example-central-auth.local/authorize?state=${encodeURIComponent(state)}`,
      state,
      redirect_uri: process.env.IG_CENTRAL_REDIRECT_URI ?? "http://127.0.0.1:8787/callback"
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

    if (!consumeOauthState(parsed.data.state)) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid or expired oauth state"
        }
      });
    }

    const session = tokenStore.createSession("tenant-default");

    return {
      ok: true,
      session_token: session.sessionToken,
      access_token: `access-${parsed.data.code.slice(0, 8)}`,
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
