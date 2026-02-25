import crypto from "node:crypto";

type OauthProvider = "facebook" | "generic";

type OauthConfig = {
  provider: OauthProvider;
  authorizeUrl: URL;
  tokenUrl: URL;
  profileUrl?: URL;
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

const FACEBOOK_AUTHORIZE_URL = "https://www.facebook.com/v20.0/dialog/oauth";
const FACEBOOK_TOKEN_URL = "https://graph.facebook.com/v20.0/oauth/access_token";
const FACEBOOK_PROFILE_URL = "https://graph.facebook.com/v20.0/me";
const GENERIC_DEFAULT_AUTHORIZE_URL = "https://example-central-auth.local/authorize";

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
  const raw = await response.text();
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // Some OAuth providers still reply as urlencoded text.
    try {
      const params = new URLSearchParams(raw);
      if ([...params.keys()].length === 0) {
        return undefined;
      }

      return Object.fromEntries(params.entries());
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const readStringEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

export const readOauthConfig = (): OauthConfigResult => {
  const providerRaw = readStringEnv("IG_CENTRAL_OAUTH_PROVIDER") ?? "facebook";
  if (providerRaw !== "facebook" && providerRaw !== "generic") {
    return {
      ok: false,
      message: "Invalid IG_CENTRAL_OAUTH_PROVIDER. Supported values: facebook, generic."
    };
  }
  const provider: OauthProvider = providerRaw;

  const authorizeRaw =
    readStringEnv("IG_CENTRAL_OAUTH_AUTHORIZE_URL") ??
    (provider === "facebook" ? FACEBOOK_AUTHORIZE_URL : GENERIC_DEFAULT_AUTHORIZE_URL);
  const tokenRaw = readStringEnv("IG_CENTRAL_OAUTH_TOKEN_URL") ?? (provider === "facebook" ? FACEBOOK_TOKEN_URL : undefined);
  const profileRaw = readStringEnv("IG_CENTRAL_OAUTH_PROFILE_URL") ?? (provider === "facebook" ? FACEBOOK_PROFILE_URL : undefined);
  const clientId = readStringEnv("IG_CENTRAL_CLIENT_ID");
  const clientSecret = readStringEnv("IG_CENTRAL_CLIENT_SECRET");
  const redirectUri = readStringEnv("IG_CENTRAL_REDIRECT_URI");
  const scope = readStringEnv("IG_CENTRAL_OAUTH_SCOPE");

  if (!clientId || !clientSecret || !redirectUri) {
    return {
      ok: false,
      message:
        "Missing OAuth config. Required env vars: IG_CENTRAL_CLIENT_ID, IG_CENTRAL_CLIENT_SECRET, IG_CENTRAL_REDIRECT_URI."
    };
  }

  if (!tokenRaw) {
    return {
      ok: false,
      message:
        "Missing OAuth config. Set IG_CENTRAL_OAUTH_TOKEN_URL (or use IG_CENTRAL_OAUTH_PROVIDER=facebook defaults)."
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

  let profileUrl: URL | undefined;
  if (profileRaw) {
    const parsedProfileUrl = parseAbsoluteUrl(profileRaw, "IG_CENTRAL_OAUTH_PROFILE_URL");
    if (!(parsedProfileUrl instanceof URL)) {
      return parsedProfileUrl;
    }
    profileUrl = parsedProfileUrl;
  }

  return {
    ok: true,
    config: {
      provider,
      authorizeUrl,
      tokenUrl,
      profileUrl,
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

const getString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getIdentifier = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return getString(value);
};

const getExpiresInSeconds = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const isOauthCodeInvalid = (status: number, parsed?: Record<string, unknown>): boolean => {
  if (status === 401) {
    return true;
  }

  if (status !== 400) {
    return false;
  }

  const error = parsed?.error;
  if (typeof error === "string") {
    return ["invalid_grant", "invalid_code", "invalid_request"].includes(error);
  }

  if (isRecord(error)) {
    const code = error.code;
    if (code === 100 || code === 190) {
      return true;
    }

    const message = getString(error.message)?.toLowerCase();
    if (message?.includes("invalid") && (message.includes("code") || message.includes("verification"))) {
      return true;
    }
  }

  const description = getString(parsed?.error_description)?.toLowerCase();
  if (description?.includes("invalid") && description.includes("code")) {
    return true;
  }

  return false;
};

const resolveTenantIdFromPayload = (provider: OauthProvider, parsed: Record<string, unknown> | undefined): string | undefined => {
  const explicitTenant = getString(parsed?.tenant_id) ?? getString(parsed?.tenant);
  if (explicitTenant) {
    return explicitTenant;
  }

  const userId = getIdentifier(parsed?.user_id) ?? getIdentifier(parsed?.id);
  if (userId) {
    return `${provider}:${userId}`;
  }

  return undefined;
};

const resolveTenantIdFromProfile = async (config: OauthConfig, accessToken: string): Promise<string | undefined> => {
  if (!config.profileUrl) {
    return undefined;
  }

  const url = new URL(config.profileUrl);
  if (config.provider === "facebook") {
    url.searchParams.set("fields", "id");
    url.searchParams.set("access_token", accessToken);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(config.provider === "generic" ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  const parsed = await parseJson(response);
  const tenantId = resolveTenantIdFromPayload(config.provider, parsed);
  return tenantId;
};

const fallbackTenantId = (accessToken: string): string => {
  const digest = crypto.createHash("sha256").update(accessToken).digest("hex").slice(0, 24);
  return `token:${digest}`;
};

export const exchangeOauthCode = async (config: OauthConfig, code: string): Promise<OauthExchangeResult> => {
  const tokenUrl = new URL(config.tokenUrl);
  let requestInit: RequestInit;

  if (config.provider === "facebook") {
    tokenUrl.searchParams.set("client_id", config.clientId);
    tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
    tokenUrl.searchParams.set("client_secret", config.clientSecret);
    tokenUrl.searchParams.set("code", code);

    requestInit = {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    };
  } else {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret
    });

    requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: body.toString()
    };
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, requestInit);
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
    const status = isOauthCodeInvalid(response.status, parsed) ? 401 : 502;
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

  const accessToken = getString(parsed?.access_token);
  if (!accessToken) {
    return {
      ok: false,
      status: 502,
      message: "OAuth token exchange succeeded but access_token is missing",
      details: parsed
    };
  }

  const tenantId =
    resolveTenantIdFromPayload(config.provider, parsed) ??
    (await resolveTenantIdFromProfile(config, accessToken)) ??
    fallbackTenantId(accessToken);
  const expiresIn = getExpiresInSeconds(parsed?.expires_in);
  const accessTokenExpiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

  return {
    ok: true,
    accessToken,
    accessTokenExpiresAt,
    tenantId
  };
};
