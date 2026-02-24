import crypto from "node:crypto";
import { createSignedToken, verifySignedToken } from "./token-signing.js";

type SessionData = {
  tenantId: string;
  createdAt: number;
  expiresAt: number;
};

type SessionClaims = {
  typ: "session";
  tenantId: string;
  iat: number;
  exp: number;
  jti: string;
};

export interface TokenStore {
  createSession(tenantId: string): { sessionToken: string; expiresAt: number };
  getSession(token: string): SessionData | undefined;
}

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24;

export class SignedTokenStore implements TokenStore {
  private readonly signingSecret: string;
  private readonly sessionTtlMs: number;

  public constructor(signingSecret: string, sessionTtlMs = DEFAULT_SESSION_TTL_MS) {
    this.signingSecret = signingSecret;
    this.sessionTtlMs = Math.max(1, sessionTtlMs);
  }

  public createSession(tenantId: string): { sessionToken: string; expiresAt: number } {
    const now = Date.now();
    const expiresAt = now + this.sessionTtlMs;
    const claims: SessionClaims = {
      typ: "session",
      tenantId,
      iat: now,
      exp: expiresAt,
      jti: crypto.randomBytes(24).toString("base64url")
    };
    const sessionToken = createSignedToken(claims, this.signingSecret);

    return {
      sessionToken,
      expiresAt
    };
  }

  public getSession(token: string): SessionData | undefined {
    const claims = verifySignedToken<SessionClaims>(token, this.signingSecret);
    if (!claims) {
      return undefined;
    }

    if (claims.typ !== "session" || typeof claims.tenantId !== "string") {
      return undefined;
    }

    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) {
      return undefined;
    }

    if (claims.exp <= Date.now()) {
      return undefined;
    }

    return {
      tenantId: claims.tenantId,
      createdAt: claims.iat,
      expiresAt: claims.exp
    };
  }
}
