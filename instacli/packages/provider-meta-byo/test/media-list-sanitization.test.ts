import type { ProviderContext } from "@instacli/ig-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaByoProvider } from "../src/index.js";

const originalMetaMinInterval = process.env.IG_META_MIN_REQUEST_INTERVAL_MS;
const originalMetaGetRetryMax = process.env.IG_META_GET_RETRY_MAX;
const originalMetaGetCacheTtl = process.env.IG_META_GET_CACHE_TTL_MS;
const originalMetaGetCacheMaxEntries = process.env.IG_META_GET_CACHE_MAX_ENTRIES;
const originalMetaRetryBaseDelay = process.env.IG_META_RETRY_BASE_DELAY_MS;
const originalMetaRetryMaxDelay = process.env.IG_META_RETRY_MAX_DELAY_MS;

const createContext = (igUserId: string, accessToken: string): ProviderContext => {
  const store = {
    getMetaByoConfig: () => ({ igUserId }),
    getSecret: vi.fn().mockResolvedValue(accessToken)
  } as unknown as ProviderContext["store"];

  return {
    store,
    dryRun: false,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  };
};

describe("provider-meta-byo media.list sanitization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalMetaMinInterval === undefined) {
      delete process.env.IG_META_MIN_REQUEST_INTERVAL_MS;
    } else {
      process.env.IG_META_MIN_REQUEST_INTERVAL_MS = originalMetaMinInterval;
    }
    if (originalMetaGetRetryMax === undefined) {
      delete process.env.IG_META_GET_RETRY_MAX;
    } else {
      process.env.IG_META_GET_RETRY_MAX = originalMetaGetRetryMax;
    }
    if (originalMetaGetCacheTtl === undefined) {
      delete process.env.IG_META_GET_CACHE_TTL_MS;
    } else {
      process.env.IG_META_GET_CACHE_TTL_MS = originalMetaGetCacheTtl;
    }
    if (originalMetaGetCacheMaxEntries === undefined) {
      delete process.env.IG_META_GET_CACHE_MAX_ENTRIES;
    } else {
      process.env.IG_META_GET_CACHE_MAX_ENTRIES = originalMetaGetCacheMaxEntries;
    }
    if (originalMetaRetryBaseDelay === undefined) {
      delete process.env.IG_META_RETRY_BASE_DELAY_MS;
    } else {
      process.env.IG_META_RETRY_BASE_DELAY_MS = originalMetaRetryBaseDelay;
    }
    if (originalMetaRetryMaxDelay === undefined) {
      delete process.env.IG_META_RETRY_MAX_DELAY_MS;
    } else {
      process.env.IG_META_RETRY_MAX_DELAY_MS = originalMetaRetryMaxDelay;
    }
  });

  it("masks sensitive query params from paging.next and exposes next_cursor", async () => {
    const accessToken = "EAABsbCS1iHgBA_TOKEN_SHOULD_NOT_LEAK";
    const pagingNext = `https://graph.facebook.com/v20.0/17841455498491865/media?fields=id&limit=5&after=CURSOR123&access_token=${accessToken}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: "1" }],
            paging: {
              cursors: { after: "CURSOR123" },
              next: pagingNext
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    const provider = createMetaByoProvider(createContext("17841455498491865", accessToken));
    const result = await provider.media.list({ limit: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.next).toContain("access_token=***");
    expect(result.data.next).not.toContain(accessToken);
    expect(result.data.next_cursor).toBe("CURSOR123");
    expect(JSON.stringify(result)).not.toContain(accessToken);
  });

  it("omits pagination fields when Graph API response has no paging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: "1" }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    const provider = createMetaByoProvider(createContext("17841455498491865", "TOKEN"));
    const result = await provider.media.list({ limit: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.next).toBeUndefined();
    expect(result.data.next_cursor).toBeUndefined();
  });

  it("rejects non-https media URLs for publish", async () => {
    const provider = createMetaByoProvider(createContext("17841455498491865", "TOKEN"));
    const result = await provider.publish.photo({ file: "http://example.com/insecure.jpg", caption: "hello" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("HTTPS URL");
  });

  it("retries transient GET failures and succeeds after rate-limit response", async () => {
    process.env.IG_META_MIN_REQUEST_INTERVAL_MS = "0";
    process.env.IG_META_GET_RETRY_MAX = "2";
    process.env.IG_META_GET_CACHE_TTL_MS = "0";
    process.env.IG_META_RETRY_BASE_DELAY_MS = "1";
    process.env.IG_META_RETRY_MAX_DELAY_MS = "5";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "Application request limit reached", code: 4 }
          }),
          {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "0" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "1" }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createMetaByoProvider(createContext("17841455498491865", "TOKEN"));
    const result = await provider.media.list({ limit: 5 });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves repeated GET requests from short-lived cache", async () => {
    process.env.IG_META_MIN_REQUEST_INTERVAL_MS = "0";
    process.env.IG_META_GET_RETRY_MAX = "0";
    process.env.IG_META_GET_CACHE_TTL_MS = "10000";
    process.env.IG_META_GET_CACHE_MAX_ENTRIES = "10";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "cached-1" }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createMetaByoProvider(createContext("17841455498491865", "TOKEN"));
    const first = await provider.media.list({ limit: 5 });
    const second = await provider.media.list({ limit: 5 });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
