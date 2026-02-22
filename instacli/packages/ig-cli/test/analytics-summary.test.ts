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
  store.setMetaByoConfig({ igUserId: IG_USER_ID, igAccountId: IG_USER_ID, igUsername: "studio_maia" });
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

describe("ig analytics summary", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-analytics-summary-"));
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

  it("returns totals, best/worst post and reply_rate and handles null metrics", async () => {
    const now = Date.now();
    const ts2d = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const ts4d = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "post-a",
                media_type: "IMAGE",
                permalink: "https://instagram.com/p/post-a",
                timestamp: ts2d,
                like_count: 20,
                comments_count: 3
              },
              {
                id: "post-b",
                media_type: "VIDEO",
                permalink: "https://instagram.com/p/post-b",
                timestamp: ts4d,
                like_count: 10,
                comments_count: 1
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { name: "reach", values: [{ value: 100 }] },
              { name: "impressions", values: [{ value: 200 }] },
              { name: "saved", values: [{ value: 2 }] },
              { name: "shares", values: [{ value: 1 }] }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { name: "reach", values: [{ value: null }] },
              { name: "impressions", values: [{ value: null }] }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "c-1",
                text: "great post",
                replies: { data: [{ id: "r-1", username: "studio_maia" }] }
              },
              {
                id: "c-2",
                text: "nice",
                replies: { data: [] }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "c-3",
                text: "cool",
                replies: { data: [] }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "analytics",
      "summary",
      "--days",
      "7",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: {
        days: number;
        totals: { posts: number; likes: number; comments: number; saved: number; shares: number; reach: number; impressions: number };
        best_post: { id: string } | null;
        worst_post: { id: string } | null;
        reply_rate: number;
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("analytics.summary");
    expect(parsed.data.days).toBe(7);
    expect(parsed.data.totals.posts).toBe(2);
    expect(parsed.data.totals.likes).toBe(30);
    expect(parsed.data.totals.comments).toBe(4);
    expect(parsed.data.totals.saved).toBe(2);
    expect(parsed.data.totals.shares).toBe(1);
    expect(parsed.data.totals.reach).toBe(100);
    expect(parsed.data.totals.impressions).toBe(200);
    expect(parsed.data.best_post?.id).toBe("post-a");
    expect(parsed.data.worst_post?.id).toBe("post-b");
    expect(parsed.data.reply_rate).toBe(0.3333);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
