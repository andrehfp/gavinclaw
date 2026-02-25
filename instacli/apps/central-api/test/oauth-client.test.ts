import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOauthLoginUrl, exchangeOauthCode, readOauthConfig } from "../src/services/oauth-client.js";

const ORIGINAL_ENV = {
  IG_CENTRAL_CLIENT_ID: process.env.IG_CENTRAL_CLIENT_ID,
  IG_CENTRAL_CLIENT_SECRET: process.env.IG_CENTRAL_CLIENT_SECRET,
  IG_CENTRAL_REDIRECT_URI: process.env.IG_CENTRAL_REDIRECT_URI,
  IG_CENTRAL_OAUTH_PROVIDER: process.env.IG_CENTRAL_OAUTH_PROVIDER,
  IG_CENTRAL_OAUTH_AUTHORIZE_URL: process.env.IG_CENTRAL_OAUTH_AUTHORIZE_URL,
  IG_CENTRAL_OAUTH_TOKEN_URL: process.env.IG_CENTRAL_OAUTH_TOKEN_URL,
  IG_CENTRAL_OAUTH_PROFILE_URL: process.env.IG_CENTRAL_OAUTH_PROFILE_URL,
  IG_CENTRAL_OAUTH_SCOPE: process.env.IG_CENTRAL_OAUTH_SCOPE
};

const setOptionalEnv = (key: keyof typeof ORIGINAL_ENV, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

const restoreEnv = () => {
  setOptionalEnv("IG_CENTRAL_CLIENT_ID", ORIGINAL_ENV.IG_CENTRAL_CLIENT_ID);
  setOptionalEnv("IG_CENTRAL_CLIENT_SECRET", ORIGINAL_ENV.IG_CENTRAL_CLIENT_SECRET);
  setOptionalEnv("IG_CENTRAL_REDIRECT_URI", ORIGINAL_ENV.IG_CENTRAL_REDIRECT_URI);
  setOptionalEnv("IG_CENTRAL_OAUTH_PROVIDER", ORIGINAL_ENV.IG_CENTRAL_OAUTH_PROVIDER);
  setOptionalEnv("IG_CENTRAL_OAUTH_AUTHORIZE_URL", ORIGINAL_ENV.IG_CENTRAL_OAUTH_AUTHORIZE_URL);
  setOptionalEnv("IG_CENTRAL_OAUTH_TOKEN_URL", ORIGINAL_ENV.IG_CENTRAL_OAUTH_TOKEN_URL);
  setOptionalEnv("IG_CENTRAL_OAUTH_PROFILE_URL", ORIGINAL_ENV.IG_CENTRAL_OAUTH_PROFILE_URL);
  setOptionalEnv("IG_CENTRAL_OAUTH_SCOPE", ORIGINAL_ENV.IG_CENTRAL_OAUTH_SCOPE);
};

const configureRequiredEnv = () => {
  process.env.IG_CENTRAL_CLIENT_ID = "central-client";
  process.env.IG_CENTRAL_CLIENT_SECRET = "central-secret";
  process.env.IG_CENTRAL_REDIRECT_URI = "https://landing.example.com/oauth/callback";
};

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("oauth client config", () => {
  it("defaults to facebook oauth endpoints", () => {
    configureRequiredEnv();
    delete process.env.IG_CENTRAL_OAUTH_PROVIDER;
    delete process.env.IG_CENTRAL_OAUTH_AUTHORIZE_URL;
    delete process.env.IG_CENTRAL_OAUTH_TOKEN_URL;
    delete process.env.IG_CENTRAL_OAUTH_PROFILE_URL;
    process.env.IG_CENTRAL_OAUTH_SCOPE = "instagram_basic,pages_show_list";

    const result = readOauthConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.config.provider).toBe("facebook");
    expect(result.config.authorizeUrl.toString()).toBe("https://www.facebook.com/v20.0/dialog/oauth");
    expect(result.config.tokenUrl.toString()).toBe("https://graph.facebook.com/v20.0/oauth/access_token");
    expect(result.config.profileUrl?.toString()).toBe("https://graph.facebook.com/v20.0/me");

    const loginUrl = new URL(buildOauthLoginUrl(result.config, "test-state"));
    expect(loginUrl.origin).toBe("https://www.facebook.com");
    expect(loginUrl.pathname).toBe("/v20.0/dialog/oauth");
    expect(loginUrl.searchParams.get("state")).toBe("test-state");
    expect(loginUrl.searchParams.get("scope")).toBe("instagram_basic,pages_show_list");
  });

  it("rejects invalid oauth provider", () => {
    configureRequiredEnv();
    process.env.IG_CENTRAL_OAUTH_PROVIDER = "invalid-provider";

    const result = readOauthConfig();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.message).toContain("IG_CENTRAL_OAUTH_PROVIDER");
  });

  it("requires token url for generic provider", () => {
    configureRequiredEnv();
    process.env.IG_CENTRAL_OAUTH_PROVIDER = "generic";
    delete process.env.IG_CENTRAL_OAUTH_TOKEN_URL;

    const result = readOauthConfig();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.message).toContain("IG_CENTRAL_OAUTH_TOKEN_URL");
  });
});

describe("oauth code exchange", () => {
  it("maps facebook invalid code errors to auth required", async () => {
    configureRequiredEnv();
    process.env.IG_CENTRAL_OAUTH_PROVIDER = "facebook";

    const config = readOauthConfig();
    expect(config.ok).toBe(true);
    if (!config.ok) {
      return;
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Error validating verification code", code: 100 } }), {
          status: 400,
          headers: { "content-type": "application/json" }
        })
      )
    );

    const exchanged = await exchangeOauthCode(config.config, "bad-code");
    expect(exchanged.ok).toBe(false);
    if (exchanged.ok) {
      return;
    }

    expect(exchanged.status).toBe(401);
    expect(exchanged.message).toBe("Invalid or expired oauth code");
  });

  it("resolves tenant id from profile when token response has no tenant", async () => {
    configureRequiredEnv();
    process.env.IG_CENTRAL_OAUTH_PROVIDER = "facebook";

    const config = readOauthConfig();
    expect(config.ok).toBe(true);
    if (!config.ok) {
      return;
    }

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "token-value", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "123456" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
    );

    const exchanged = await exchangeOauthCode(config.config, "ok-code");
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) {
      return;
    }

    expect(exchanged.tenantId).toBe("facebook:123456");
    expect(exchanged.accessToken).toBe("token-value");
    expect(exchanged.accessTokenExpiresAt).toBeTypeOf("number");
  });
});
