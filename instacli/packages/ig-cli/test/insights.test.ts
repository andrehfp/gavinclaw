import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliStore } from "@instacli/ig-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const originalExitCode = process.exitCode;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalHome = process.env.HOME;

const IG_USER_ID = "17841400000000000";
let configHome: string;

const restoreEnv = (): void => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
};

const seedMetaAuth = async (): Promise<void> => {
  const store = new CliStore();
  store.setMetaByoConfig({ igUserId: IG_USER_ID, igAccountId: IG_USER_ID });
  await store.setSecret("meta-byo", "accessToken", "EAAB_TEST_ACCESS_TOKEN");
  store.setDefaultProvider("meta-byo");
};

const runCliJson = async (argv: string[]): Promise<unknown> => {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write);

  await runCli(argv);
  return JSON.parse(output.trim()) as unknown;
};

describe("ig insights commands", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-insights-"));
    process.env.XDG_CONFIG_HOME = configHome;
    process.env.HOME = configHome;
    await seedMetaAuth();
  });

  afterEach(async () => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreEnv();
    await fs.rm(configHome, { recursive: true, force: true });
  });

  it("returns account insights in the expected JSON shape", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ followers_count: 1234, media_count: 87 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ name: "reach", values: [{ value: 5432 }] }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ name: "profile_views", values: [{ value: 321 }] }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ name: "accounts_engaged", values: [{ value: 456 }] }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ name: "views", values: [{ value: 8765 }] }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "insights",
      "account",
      "--period",
      "week",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: {
        period: string;
        followers_count: number;
        media_count: number;
        metrics: {
          reach: number;
          impressions: number;
          profile_views: number;
          accounts_engaged: number;
        };
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("insights.account");
    expect(parsed.data.period).toBe("week");
    expect(parsed.data.followers_count).toBe(1234);
    expect(parsed.data.media_count).toBe(87);
    expect(parsed.data.metrics.reach).toBe(5432);
    expect(parsed.data.metrics.impressions).toBe(8765);
    expect(parsed.data.metrics.profile_views).toBe(321);
    expect(parsed.data.metrics.accounts_engaged).toBe(456);
  });

  it("keeps null for unavailable media metrics instead of failing", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "1790001",
            media_type: "IMAGE",
            permalink: "https://instagram.com/p/1790001",
            like_count: 194,
            comments_count: 18,
            timestamp: "2026-02-10T12:00:00.000Z"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { name: "reach", values: [{ value: 1200 }] },
              { name: "impressions", values: [{ value: 1900 }] }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "insights",
      "media",
      "--id",
      "1790001",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: {
        id: string;
        media_type: string;
        permalink: string;
        metrics: {
          reach: number | null;
          impressions: number | null;
          likes: number;
          comments: number;
          saved: number | null;
          shares: number | null;
        };
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("insights.media");
    expect(parsed.data.id).toBe("1790001");
    expect(parsed.data.media_type).toBe("IMAGE");
    expect(parsed.data.metrics.reach).toBe(1200);
    expect(parsed.data.metrics.impressions).toBe(1900);
    expect(parsed.data.metrics.likes).toBe(194);
    expect(parsed.data.metrics.comments).toBe(18);
    expect(parsed.data.metrics.saved).toBeNull();
    expect(parsed.data.metrics.shares).toBeNull();
  });

  it("returns clear validation error when instagram_manage_insights scope is missing", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ followers_count: 1234, media_count: 87 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "(#10) To access this endpoint you need the instagram_manage_insights permission for this user.",
              type: "OAuthException",
              code: 10
            }
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "insights",
      "account",
      "--period",
      "day",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      error?: {
        code: string;
        message: string;
        details?: { required_scope?: string };
      };
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
    expect(parsed.error?.message).toContain("instagram_manage_insights");
    expect(parsed.error?.details?.required_scope).toBe("instagram_manage_insights");
  });
});
