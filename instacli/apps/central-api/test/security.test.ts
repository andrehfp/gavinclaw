import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { InMemoryTokenStore } from "../src/services/token-store.js";

const ORIGINAL_ENV = {
  IG_CENTRAL_RATE_LIMIT_MAX: process.env.IG_CENTRAL_RATE_LIMIT_MAX,
  IG_CENTRAL_RATE_LIMIT_WINDOW_MS: process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS
};

afterEach(() => {
  process.env.IG_CENTRAL_RATE_LIMIT_MAX = ORIGINAL_ENV.IG_CENTRAL_RATE_LIMIT_MAX;
  process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS = ORIGINAL_ENV.IG_CENTRAL_RATE_LIMIT_WINDOW_MS;
});

describe("central-api security hardening", () => {
  it("rate limits repeated requests from the same client", async () => {
    process.env.IG_CENTRAL_RATE_LIMIT_MAX = "2";
    process.env.IG_CENTRAL_RATE_LIMIT_WINDOW_MS = "60000";

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

  it("generates high-entropy session tokens and enforces max sessions", () => {
    const store = new InMemoryTokenStore(2);

    const a = store.createSession("tenant");
    const b = store.createSession("tenant");
    const c = store.createSession("tenant");

    expect(a.sessionToken.length).toBeGreaterThanOrEqual(43);
    expect(b.sessionToken.length).toBeGreaterThanOrEqual(43);
    expect(c.sessionToken.length).toBeGreaterThanOrEqual(43);

    expect(store.getSession(a.sessionToken)).toBeUndefined();
    expect(store.getSession(b.sessionToken)).toBeDefined();
    expect(store.getSession(c.sessionToken)).toBeDefined();
  });
});
