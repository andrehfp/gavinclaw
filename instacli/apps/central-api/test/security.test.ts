import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server.js";
import { SignedTokenStore } from "../src/services/token-store.js";

const ORIGINAL_ENV = {
  IG_CENTRAL_RATE_LIMIT_MAX: process.env.IG_CENTRAL_RATE_LIMIT_MAX,
  IG_CENTRAL_RATE_LIMIT_WINDOW_MS: process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS,
  IG_CENTRAL_RATE_LIMIT_FILE: process.env.IG_CENTRAL_RATE_LIMIT_FILE,
  IG_CENTRAL_SIGNING_SECRET: process.env.IG_CENTRAL_SIGNING_SECRET,
  IG_CENTRAL_OAUTH_TOKEN_URL: process.env.IG_CENTRAL_OAUTH_TOKEN_URL,
  IG_CENTRAL_CLIENT_ID: process.env.IG_CENTRAL_CLIENT_ID,
  IG_CENTRAL_CLIENT_SECRET: process.env.IG_CENTRAL_CLIENT_SECRET,
  IG_CENTRAL_REDIRECT_URI: process.env.IG_CENTRAL_REDIRECT_URI
};

const TEST_SIGNING_SECRET = "0123456789abcdef0123456789abcdef";

const configureRequiredEnv = () => {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  process.env.IG_CENTRAL_SIGNING_SECRET = TEST_SIGNING_SECRET;
  process.env.IG_CENTRAL_OAUTH_TOKEN_URL = "https://oauth.example.test/token";
  process.env.IG_CENTRAL_CLIENT_ID = "central-client";
  process.env.IG_CENTRAL_CLIENT_SECRET = "central-secret";
  process.env.IG_CENTRAL_REDIRECT_URI = "http://127.0.0.1:8787/callback";
  process.env.IG_CENTRAL_RATE_LIMIT_FILE = path.join(os.tmpdir(), `instacli-central-rate-limit-${suffix}.json`);
};

const mockOauthTokenExchange = (response: { status: number; body: Record<string, unknown> }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status, headers: { "content-type": "application/json" } }))
  );
};

afterEach(async () => {
  const file = process.env.IG_CENTRAL_RATE_LIMIT_FILE;
  if (file) {
    await fs.unlink(file).catch(() => undefined);
    await fs.unlink(`${file}.lock`).catch(() => undefined);
  }

  process.env.IG_CENTRAL_RATE_LIMIT_MAX = ORIGINAL_ENV.IG_CENTRAL_RATE_LIMIT_MAX;
  process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS = ORIGINAL_ENV.IG_CENTRAL_RATE_LIMIT_WINDOW_MS;
  process.env.IG_CENTRAL_RATE_LIMIT_FILE = ORIGINAL_ENV.IG_CENTRAL_RATE_LIMIT_FILE;
  process.env.IG_CENTRAL_SIGNING_SECRET = ORIGINAL_ENV.IG_CENTRAL_SIGNING_SECRET;
  process.env.IG_CENTRAL_OAUTH_TOKEN_URL = ORIGINAL_ENV.IG_CENTRAL_OAUTH_TOKEN_URL;
  process.env.IG_CENTRAL_CLIENT_ID = ORIGINAL_ENV.IG_CENTRAL_CLIENT_ID;
  process.env.IG_CENTRAL_CLIENT_SECRET = ORIGINAL_ENV.IG_CENTRAL_CLIENT_SECRET;
  process.env.IG_CENTRAL_REDIRECT_URI = ORIGINAL_ENV.IG_CENTRAL_REDIRECT_URI;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("central-api security hardening", () => {
  it("rate limits repeated requests from the same client", async () => {
    configureRequiredEnv();
    process.env.IG_CENTRAL_RATE_LIMIT_MAX = "2";
    process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS = "60000";
    mockOauthTokenExchange({
      status: 200,
      body: { access_token: "access-token-value", tenant_id: "tenant-default" }
    });

    const app = buildServer();
    await app.ready();

    try {
      const start = await app.inject({ method: "POST", url: "/oauth/start" });
      const startJson = start.json() as { state: string };

      const callback = await app.inject({
        method: "POST",
        url: "/oauth/callback",
        payload: { code: "abc", state: startJson.state }
      });
      const callbackJson = callback.json() as { session_token: string };
      const token = callbackJson.session_token;

      const first = await app.inject({ method: "GET", url: "/session", headers: { authorization: `Bearer ${token}` } });
      const second = await app.inject({ method: "GET", url: "/session", headers: { authorization: `Bearer ${token}` } });
      const third = await app.inject({ method: "GET", url: "/session", headers: { authorization: `Bearer ${token}` } });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(third.statusCode).toBe(429);
      expect(third.json()).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    } finally {
      await app.close();
    }
  });

  it("rejects oauth callback with invalid state", async () => {
    configureRequiredEnv();
    mockOauthTokenExchange({
      status: 200,
      body: { access_token: "access-token-value", tenant_id: "tenant-default" }
    });

    const app = buildServer();
    await app.ready();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/oauth/callback",
        payload: { code: "abc", state: "invalid-state" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid or expired oauth state" }
      });
    } finally {
      await app.close();
    }
  });

  it("rejects oauth callback when code exchange fails", async () => {
    configureRequiredEnv();
    mockOauthTokenExchange({
      status: 400,
      body: { error: "invalid_grant" }
    });

    const app = buildServer();
    await app.ready();

    try {
      const start = await app.inject({ method: "POST", url: "/oauth/start" });
      const startJson = start.json() as { state: string };

      const callback = await app.inject({
        method: "POST",
        url: "/oauth/callback",
        payload: { code: "bad-code", state: startJson.state }
      });

      expect(callback.statusCode).toBe(401);
      expect(callback.json()).toMatchObject({
        ok: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "Invalid or expired oauth code"
        }
      });
    } finally {
      await app.close();
    }
  });

  it("generates high-entropy signed session tokens and rejects tampering", () => {
    const store = new SignedTokenStore(TEST_SIGNING_SECRET);
    const session = store.createSession("tenant");

    expect(session.sessionToken.length).toBeGreaterThanOrEqual(120);
    expect(store.getSession(session.sessionToken)).toMatchObject({ tenantId: "tenant" });
    expect(store.getSession(`${session.sessionToken}tamper`)).toBeUndefined();
  });
});
