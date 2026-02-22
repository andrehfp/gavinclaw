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

describe("ig comments reply --ai", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-comments-reply-ai-"));
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

  it("generates 3 suggestions and does not publish by default", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "comments",
      "reply",
      "--comment",
      "c-123",
      "--text",
      "can you share dimensions?",
      "--ai",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: { published: boolean; suggestions: string[] };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("comments.reply.ai");
    expect(parsed.data.published).toBe(false);
    expect(parsed.data.suggestions).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("can publish selected text when --publish is used", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "r-789" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "comments",
      "reply",
      "--comment",
      "c-123",
      "--text",
      "thanks for the question! dimensions are in the next slide 🙌",
      "--ai",
      "--publish",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: { published: boolean; reply?: { reply_id: string; status: string } };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("comments.reply.ai");
    expect(parsed.data.published).toBe(true);
    expect(parsed.data.reply?.reply_id).toBe("r-789");
    expect(parsed.data.reply?.status).toBe("published");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
