import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server.js";

const ORIGINAL_ENV = {
  IG_CENTRAL_RATE_LIMIT_FILE: process.env.IG_CENTRAL_RATE_LIMIT_FILE,
  IG_CENTRAL_SIGNING_SECRET: process.env.IG_CENTRAL_SIGNING_SECRET,
  IG_CENTRAL_OAUTH_PROVIDER: process.env.IG_CENTRAL_OAUTH_PROVIDER,
  IG_CENTRAL_CLIENT_ID: process.env.IG_CENTRAL_CLIENT_ID,
  IG_CENTRAL_CLIENT_SECRET: process.env.IG_CENTRAL_CLIENT_SECRET,
  IG_CENTRAL_REDIRECT_URI: process.env.IG_CENTRAL_REDIRECT_URI
};

const TEST_SIGNING_SECRET = "0123456789abcdef0123456789abcdef";

const configureRequiredEnv = () => {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  process.env.IG_CENTRAL_SIGNING_SECRET = TEST_SIGNING_SECRET;
  process.env.IG_CENTRAL_OAUTH_PROVIDER = "facebook";
  process.env.IG_CENTRAL_CLIENT_ID = "central-client";
  process.env.IG_CENTRAL_CLIENT_SECRET = "central-secret";
  process.env.IG_CENTRAL_REDIRECT_URI = "https://landing.example.com/oauth/callback";
  process.env.IG_CENTRAL_RATE_LIMIT_FILE = path.join(os.tmpdir(), `instacli-central-bootstrap-rate-limit-${suffix}.json`);
};

afterEach(async () => {
  const file = process.env.IG_CENTRAL_RATE_LIMIT_FILE;
  if (file) {
    await fs.unlink(file).catch(() => undefined);
    await fs.unlink(`${file}.lock`).catch(() => undefined);
  }

  process.env.IG_CENTRAL_RATE_LIMIT_FILE = ORIGINAL_ENV.IG_CENTRAL_RATE_LIMIT_FILE;
  process.env.IG_CENTRAL_SIGNING_SECRET = ORIGINAL_ENV.IG_CENTRAL_SIGNING_SECRET;
  process.env.IG_CENTRAL_OAUTH_PROVIDER = ORIGINAL_ENV.IG_CENTRAL_OAUTH_PROVIDER;
  process.env.IG_CENTRAL_CLIENT_ID = ORIGINAL_ENV.IG_CENTRAL_CLIENT_ID;
  process.env.IG_CENTRAL_CLIENT_SECRET = ORIGINAL_ENV.IG_CENTRAL_CLIENT_SECRET;
  process.env.IG_CENTRAL_REDIRECT_URI = ORIGINAL_ENV.IG_CENTRAL_REDIRECT_URI;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("central-api bootstrap flow", () => {
  it("issues a bootstrap code on oauth callback and exchanges it once", async () => {
    configureRequiredEnv();

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "user-token", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "user-1" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [{ id: "123", name: "Page One", access_token: "page-token" }] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ instagram_business_account: { id: "17841400000000001", username: "instacli_user" } }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
    );

    const app = buildServer();
    await app.ready();

    try {
      const started = await app.inject({ method: "POST", url: "/oauth/start" });
      const state = (started.json() as { state: string }).state;

      const callback = await app.inject({
        method: "GET",
        url: `/oauth/callback?code=abc123&state=${encodeURIComponent(state)}`
      });
      expect(callback.statusCode).toBe(200);
      const body = callback.body;
      const match = body.match(/Bootstrap code:\s([A-Z0-9-]+)/);
      expect(match?.[1]).toBeTruthy();
      const bootstrapCode = match?.[1] ?? "";

      const exchanged = await app.inject({
        method: "POST",
        url: "/bootstrap/exchange",
        payload: { bootstrap_code: bootstrapCode }
      });
      expect(exchanged.statusCode).toBe(200);
      expect(exchanged.json()).toMatchObject({
        ok: true,
        provider: "meta-byo",
        ig_account_id: "17841400000000001",
        ig_username: "instacli_user",
        page_id: "123",
        page_name: "Page One",
        page_access_token: "page-token"
      });

      const secondTry = await app.inject({
        method: "POST",
        url: "/bootstrap/exchange",
        payload: { bootstrap_code: bootstrapCode }
      });
      expect(secondTry.statusCode).toBe(404);
      expect(secondTry.json()).toMatchObject({
        ok: false,
        error: { code: "AUTH_REQUIRED" }
      });
    } finally {
      await app.close();
    }
  });
});
