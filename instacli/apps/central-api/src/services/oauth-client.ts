type OauthConfig = {
  authorizeUrl: URL;
  tokenUrl: URL;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string;
};

type OauthConfigResult =
  | { ok: true; config: OauthConfig }
  | { ok: false; message: string };

type OauthExchangeResult =
  | {
      ok: true;
      accessToken: string;
      accessTokenExpiresAt?: number;
      tenantId: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      details?: unknown;
    };

const DEFAULT_AUTHORIZE_URL = "https://example-central-auth.local/authorize";

const parseAbsoluteUrl = (value: string, fieldName: string): URL | OauthConfigResult => {
  try {
    return new URL(value);
  } catch {
    return { ok: false, message: `Invalid ${fieldName}. Expected an absolute URL.` };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseJson = async (response: Response): Promise<Record<string, unknown> | undefined> => {
  try {
    const parsed = (await response.json()) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const readStringEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

export const readOauthConfig = (): OauthConfigResult => {
  const authorizeRaw = readStringEnv("IG_CENTRAL_OAUTH_AUTHORIZE_URL") ?? DEFAULT_AUTHORIZE_URL;
  const tokenRaw = readStringEnv("IG_CENTRAL_OAUTH_TOKEN_URL");
  const clientId = readStringEnv("IG_CENTRAL_CLIENT_ID");
  const clientSecret = readStringEnv("IG_CENTRAL_CLIENT_SECRET");
  const redirectUri = readStringEnv("IG_CENTRAL_REDIRECT_URI");
  const scope = readStringEnv("IG_CENTRAL_OAUTH_SCOPE");

  if (!tokenRaw || !clientId || !clientSecret || !redirectUri) {
    return {
      ok: false,
      message:
        "Missing OAuth config. Required env vars: IG_CENTRAL_OAUTH_TOKEN_URL, IG_CENTRAL_CLIENT_ID, IG_CENTRAL_CLIENT_SECRET, IG_CENTRAL_REDIRECT_URI."
    };
  }

  const authorizeUrl = parseAbsoluteUrl(authorizeRaw, "IG_CENTRAL_OAUTH_AUTHORIZE_URL");
  if (!(authorizeUrl instanceof URL)) {
    return authorizeUrl;
  }

  const tokenUrl = parseAbsoluteUrl(tokenRaw, "IG_CENTRAL_OAUTH_TOKEN_URL");
  if (!(tokenUrl instanceof URL)) {
    return tokenUrl;
  }

  return {
    ok: true,
    config: {
      authorizeUrl,
      tokenUrl,
      clientId,
      clientSecret,
      redirectUri,
      scope
    }
  };
};

export const buildOauthLoginUrl = (config: OauthConfig, state: string): string => {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (config.scope) {
    url.searchParams.set("scope", config.scope);
  }
  return url.toString();
};

export const exchangeOauthCode = async (config: OauthConfig, code: string): Promise<OauthExchangeResult> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });

  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: body.toString()
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      message: "OAuth token exchange request failed",
      details: {
        reason: error instanceof Error ? error.message : String(error)
      }
    };
  }

  const parsed = await parseJson(response);
  if (!response.ok) {
    const upstreamError = typeof parsed?.error === "string" ? parsed.error : undefined;
    const status = response.status === 400 && upstreamError === "invalid_grant" ? 401 : 502;
    return {
      ok: false,
      status,
      message: status === 401 ? "Invalid or expired oauth code" : "OAuth token exchange failed",
      details: {
        status: response.status,
        body: parsed
      }
    };
  }

  const accessToken = parsed?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return {
      ok: false,
      status: 502,
      message: "OAuth token exchange succeeded but access_token is missing",
      details: parsed
    };
  }

  const tenantId = typeof parsed?.tenant_id === "string" && parsed.tenant_id.length > 0 ? parsed.tenant_id : "tenant-default";
  const expiresIn = parsed?.expires_in;
  const accessTokenExpiresAt =
    typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined;

  return {
    ok: true,
    accessToken,
    accessTokenExpiresAt,
    tenantId
  };
};
