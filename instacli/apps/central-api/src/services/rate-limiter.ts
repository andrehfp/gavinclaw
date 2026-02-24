import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitState = {
  buckets: Record<string, RateLimitBucket>;
};

export type RateLimitCheckResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

const DEFAULT_RATE_LIMIT_PATH = path.join(os.tmpdir(), "instacli-central-rate-limit.json");
const DEFAULT_LOCK_RETRY_DELAY_MS = 10;
const DEFAULT_LOCK_RETRY_MAX = 200;
const DEFAULT_MAX_BUCKETS = 50_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const ensureState = (value: unknown): RateLimitState => {
  if (typeof value !== "object" || value === null) {
    return { buckets: {} };
  }

  const rawBuckets = (value as { buckets?: unknown }).buckets;
  if (typeof rawBuckets !== "object" || rawBuckets === null) {
    return { buckets: {} };
  }

  const buckets: Record<string, RateLimitBucket> = {};
  for (const [key, bucket] of Object.entries(rawBuckets)) {
    if (typeof bucket !== "object" || bucket === null) {
      continue;
    }

    const count = (bucket as { count?: unknown }).count;
    const resetAt = (bucket as { resetAt?: unknown }).resetAt;
    if (!Number.isFinite(count) || !Number.isFinite(resetAt)) {
      continue;
    }

    buckets[key] = {
      count: Number(count),
      resetAt: Number(resetAt)
    };
  }

  return { buckets };
};

export class FileRateLimiter {
  private readonly filePath: string;
  private readonly lockPath: string;
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxBuckets: number;

  public constructor(options: { max: number; windowMs: number; filePath?: string; maxBuckets?: number }) {
    this.max = Math.max(1, options.max);
    this.windowMs = Math.max(1, options.windowMs);
    this.filePath = options.filePath?.trim() || DEFAULT_RATE_LIMIT_PATH;
    this.lockPath = `${this.filePath}.lock`;
    this.maxBuckets = Math.max(1_000, options.maxBuckets ?? DEFAULT_MAX_BUCKETS);
  }

  public async check(key: string): Promise<RateLimitCheckResult> {
    return this.withLock(async () => {
      const now = Date.now();
      const state = await this.readState();
      const buckets = state.buckets;

      for (const [bucketKey, bucket] of Object.entries(buckets)) {
        if (bucket.resetAt <= now) {
          delete buckets[bucketKey];
        }
      }

      if (Object.keys(buckets).length > this.maxBuckets) {
        const oldest = Object.entries(buckets)
          .sort((a, b) => a[1].resetAt - b[1].resetAt)
          .slice(0, Math.ceil(this.maxBuckets * 0.1));

        for (const [bucketKey] of oldest) {
          delete buckets[bucketKey];
        }
      }

      const current = buckets[key];
      if (!current || current.resetAt <= now) {
        buckets[key] = {
          count: 1,
          resetAt: now + this.windowMs
        };
        await this.writeState(state);
        return { allowed: true };
      }

      current.count += 1;
      await this.writeState(state);

      if (current.count > this.max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
        };
      }

      return { allowed: true };
    });
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    let lockHandle: fs.FileHandle | undefined;
    for (let attempt = 0; attempt < DEFAULT_LOCK_RETRY_MAX; attempt += 1) {
      try {
        lockHandle = await fs.open(this.lockPath, "wx");
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") {
          throw error;
        }
        await sleep(DEFAULT_LOCK_RETRY_DELAY_MS);
      }
    }

    if (!lockHandle) {
      throw new Error("Unable to acquire rate-limit lock");
    }

    try {
      return await fn();
    } finally {
      try {
        await lockHandle.close();
      } finally {
        await fs.unlink(this.lockPath).catch(() => undefined);
      }
    }
  }

  private async readState(): Promise<RateLimitState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return ensureState(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { buckets: {} };
      }
      throw error;
    }
  }

  private async writeState(state: RateLimitState): Promise<void> {
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmpPath, this.filePath);
  }
}
