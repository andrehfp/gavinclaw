import type { ProviderContext } from "@instacli/ig-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaByoProvider } from "../src/index.js";

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
});
