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

describe("ig analytics top-posts", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-analytics-"));
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

  it("sorts by engagement score and respects days/limit", async () => {
    const now = Date.now();
    const ts10d = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const ts5d = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const ts2d = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const ts45d = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "post-a",
                caption: "A",
                media_type: "IMAGE",
                permalink: "https://instagram.com/p/post-a",
                timestamp: ts10d,
                like_count: 100,
                comments_count: 10
              },
              {
                id: "post-b",
                caption: "B",
                media_type: "IMAGE",
                permalink: "https://instagram.com/p/post-b",
                timestamp: ts5d,
                like_count: 80,
                comments_count: 20
              },
              {
                id: "post-c",
                caption: "C",
                media_type: "VIDEO",
                permalink: "https://instagram.com/p/post-c",
                timestamp: ts2d,
                like_count: 150,
                comments_count: 5
              },
              {
                id: "post-old",
                caption: "OLD",
                media_type: "IMAGE",
                permalink: "https://instagram.com/p/post-old",
                timestamp: ts45d,
                like_count: 999,
                comments_count: 999
              }
            ]
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
              { name: "reach", values: [{ value: 1000 }] },
              { name: "impressions", values: [{ value: 1800 }] },
              { name: "saved", values: [{ value: 5 }] },
              { name: "shares", values: [{ value: 1 }] }
            ]
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
              { name: "reach", values: [{ value: 1400 }] },
              { name: "impressions", values: [{ value: 2000 }] },
              { name: "saved", values: [{ value: 10 }] },
              { name: "shares", values: [{ value: 8 }] }
            ]
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
              { name: "reach", values: [{ value: 1600 }] },
              { name: "impressions", values: [{ value: 2300 }] },
              { name: "saved", values: [{ value: 0 }] },
              { name: "shares", values: [{ value: 0 }] }
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
      "analytics",
      "top-posts",
      "--days",
      "30",
      "--limit",
      "2",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: {
        days: number;
        limit: number;
        items: Array<{
          id: string;
          metrics: {
            likes: number;
            comments: number;
            saved: number | null;
            shares: number | null;
          };
          engagement_score: number;
        }>;
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("analytics.top-posts");
    expect(parsed.data.days).toBe(30);
    expect(parsed.data.limit).toBe(2);
    expect(parsed.data.items).toHaveLength(2);
    expect(parsed.data.items[0]?.id).toBe("post-b");
    expect(parsed.data.items[0]?.engagement_score).toBe(174);
    expect(parsed.data.items[1]?.id).toBe("post-c");
    expect(parsed.data.items[1]?.engagement_score).toBe(160);
    expect(parsed.data.items[0]?.metrics.likes).toBe(80);
    expect(parsed.data.items[0]?.metrics.comments).toBe(20);
    expect(parsed.data.items.some((item) => item.id === "post-old")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
