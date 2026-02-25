import crypto from "node:crypto";

export type BootstrapData = {
  tenantId: string;
  igAccountId: string;
  igUsername?: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
};

type BootstrapEntry = BootstrapData & {
  issuedAt: number;
  expiresAt: number;
};

const BOOTSTRAP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomCode = (size = 10): string => {
  const bytes = crypto.randomBytes(size);
  let code = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) {
      continue;
    }
    code += BOOTSTRAP_ALPHABET[byte % BOOTSTRAP_ALPHABET.length];
  }
  return `IGB-${code}`;
};

export class OneTimeBootstrapStore {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries: Map<string, BootstrapEntry>;

  public constructor(options: { ttlMs: number; maxEntries?: number }) {
    this.ttlMs = Math.max(1, options.ttlMs);
    this.maxEntries = Math.max(100, options.maxEntries ?? 10_000);
    this.entries = new Map();
  }

  public issue(data: BootstrapData): { bootstrapCode: string; expiresAt: number } {
    const now = Date.now();
    this.prune(now);

    let bootstrapCode = randomCode();
    while (this.entries.has(bootstrapCode)) {
      bootstrapCode = randomCode();
    }

    const expiresAt = now + this.ttlMs;
    this.entries.set(bootstrapCode, {
      ...data,
      issuedAt: now,
      expiresAt
    });

    if (this.entries.size > this.maxEntries) {
      this.prune(now, true);
    }

    return { bootstrapCode, expiresAt };
  }

  public consume(bootstrapCode: string): BootstrapData | undefined {
    const now = Date.now();
    this.prune(now);

    const entry = this.entries.get(bootstrapCode);
    if (!entry) {
      return undefined;
    }

    this.entries.delete(bootstrapCode);
    if (entry.expiresAt <= now) {
      return undefined;
    }

    return {
      tenantId: entry.tenantId,
      igAccountId: entry.igAccountId,
      igUsername: entry.igUsername,
      pageId: entry.pageId,
      pageName: entry.pageName,
      pageAccessToken: entry.pageAccessToken
    };
  }

  private prune(now: number, enforceLimit = false): void {
    for (const [code, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(code);
      }
    }

    if (!enforceLimit || this.entries.size <= this.maxEntries) {
      return;
    }

    const sorted = [...this.entries.entries()].sort((left, right) => left[1].issuedAt - right[1].issuedAt);
    const deleteCount = Math.max(1, this.entries.size - this.maxEntries);
    for (let index = 0; index < deleteCount; index += 1) {
      const code = sorted[index]?.[0];
      if (code) {
        this.entries.delete(code);
      }
    }
  }
}
