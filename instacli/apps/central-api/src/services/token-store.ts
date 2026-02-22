import crypto from "node:crypto";

type SessionData = {
  tenantId: string;
  createdAt: number;
  expiresAt: number;
};

export interface TokenStore {
  createSession(tenantId: string): { sessionToken: string; expiresAt: number };
  getSession(token: string): SessionData | undefined;
}

export class InMemoryTokenStore implements TokenStore {
  private readonly sessions = new Map<string, SessionData>();
  private readonly maxSessions: number;

  public constructor(maxSessions = 10_000) {
    this.maxSessions = Math.max(1, maxSessions);
  }

  private pruneExpired(now = Date.now()): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  private trimToLimit(): void {
    while (this.sessions.size >= this.maxSessions) {
      const oldestToken = this.sessions.keys().next().value;
      if (!oldestToken) {
        break;
      }
      this.sessions.delete(oldestToken);
    }
  }

  public createSession(tenantId: string): { sessionToken: string; expiresAt: number } {
    const now = Date.now();
    this.pruneExpired(now);
    this.trimToLimit();

    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = now + 1000 * 60 * 60 * 24;

    this.sessions.set(sessionToken, {
      tenantId,
      createdAt: now,
      expiresAt
    });

    return {
      sessionToken,
      expiresAt
    };
  }

  public getSession(token: string): SessionData | undefined {
    this.pruneExpired();

    const session = this.sessions.get(token);
    if (!session) {
      return undefined;
    }

    return session;
  }
}
