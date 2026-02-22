import type { ProviderContext } from "@instacli/ig-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCentralProvider } from "../src/index.js";

const ORIGINAL_ENV = {
  IG_CENTRAL_API_URL: process.env.IG_CENTRAL_API_URL,
  IG_CENTRAL_FETCH_TIMEOUT_MS: process.env.IG_CENTRAL_FETCH_TIMEOUT_MS
};

const createContext = (dryRun: boolean): ProviderContext => {
  const store = {
    getSecret: vi.fn(),
    setSecret: vi.fn(),
    deleteSecret: vi.fn(),
    clearProvider: vi.fn(),
    setCentralConfig: vi.fn()
  } as unknown as ProviderContext["store"];

  return {
    store,
    dryRun,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  };
};

describe("provider-central security hardening", () => {
  afterEach(() => {
    process.env.IG_CENTRAL_API_URL = ORIGINAL_ENV.IG_CENTRAL_API_URL;
    process.env.IG_CENTRAL_FETCH_TIMEOUT_MS = ORIGINAL_ENV.IG_CENTRAL_FETCH_TIMEOUT_MS;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects non-https remote base url", async () => {
    process.env.IG_CENTRAL_API_URL = "http://central.example.com";
    const provider = createCentralProvider(createContext(true));
    const result = await provider.auth.start();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("CONFIG_ERROR");
    expect(result.error.message).toContain("https://");
  });

  it("allows localhost http base url", async () => {
    process.env.IG_CENTRAL_API_URL = "http://127.0.0.1:8787";
    const provider = createCentralProvider(createContext(true));
    const result = await provider.auth.start();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.loginUrl).toBe("http://127.0.0.1:8787/oauth/start");
  });

  it("returns provider error on timeout", async () => {
    process.env.IG_CENTRAL_API_URL = "https://central.example.com";
    process.env.IG_CENTRAL_FETCH_TIMEOUT_MS = "5";

    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      })
    );

    const provider = createCentralProvider(createContext(false));
    const result = await provider.auth.start();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("PROVIDER_ERROR");
    expect(result.error.message).toContain("Central API request failed");
  });
});
