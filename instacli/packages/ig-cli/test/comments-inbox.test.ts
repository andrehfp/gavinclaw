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

describe("ig comments inbox", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-comments-inbox-"));
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

  it("returns unresolved comments filtered by owner replies, days and limit", async () => {
    const now = Date.now();
    const ts2d = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const ts5d = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const ts12d = new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString();

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { id: "m-1", timestamp: ts2d, permalink: "https://instagram.com/p/m1" },
              { id: "m-2", timestamp: ts5d, permalink: "https://instagram.com/p/m2" },
              { id: "m-old", timestamp: ts12d, permalink: "https://instagram.com/p/m-old" }
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
                text: "Looks amazing!",
                username: "alice",
                timestamp: ts2d,
                replies: { data: [{ id: "r-1", username: "studio_maia", text: "thank you!" }] }
              },
              {
                id: "c-2",
                text: "How much does it cost?",
                username: "bob",
                timestamp: ts2d,
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
                text: "love the textures",
                username: "carol",
                timestamp: ts5d,
                replies: { data: [{ id: "r-2", username: "someone_else", text: "same" }] }
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
      "comments",
      "inbox",
      "--days",
      "7",
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
        scanned: { media: number; comments: number };
        items: Array<{ comment_id: string; has_owner_reply: boolean }>;
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("comments.inbox");
    expect(parsed.data.days).toBe(7);
    expect(parsed.data.limit).toBe(2);
    expect(parsed.data.scanned.media).toBe(2);
    expect(parsed.data.scanned.comments).toBe(3);
    expect(parsed.data.items).toHaveLength(2);
    expect(parsed.data.items.map((item) => item.comment_id)).toEqual(["c-2", "c-3"]);
    expect(parsed.data.items.every((item) => item.has_owner_reply === false)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
