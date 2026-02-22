import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliStore } from "@instacli/ig-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const originalExitCode = process.exitCode;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalHome = process.env.HOME;

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

const runCliJson = async (argv: string[]): Promise<unknown> => {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write);

  await runCli(argv);
  return JSON.parse(output.trim()) as unknown;
};

describe("ig accounts", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-accounts-"));
    process.env.XDG_CONFIG_HOME = configHome;
    process.env.HOME = configHome;
  });

  afterEach(async () => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreEnv();
    await fs.rm(configHome, { recursive: true, force: true });
  });

  it("adds accounts, sets default, and lists them", async () => {
    await runCliJson([
      "node",
      "instacli",
      "accounts",
      "add",
      "--name",
      "alpha",
      "--ig-account-id",
      "17841400000000001",
      "--page-access-token",
      "EAAB_TEST_ALPHA",
      "--ig-username",
      "alpha_user",
      "--json",
      "--quiet"
    ]);

    await runCliJson([
      "node",
      "instacli",
      "accounts",
      "add",
      "--name",
      "beta",
      "--ig-account-id",
      "17841400000000002",
      "--page-access-token",
      "EAAB_TEST_BETA",
      "--ig-username",
      "beta_user",
      "--use",
      "--json",
      "--quiet"
    ]);

    const parsed = (await runCliJson(["node", "instacli", "accounts", "list", "--json", "--quiet"])) as {
      ok: boolean;
      data: {
        default_account?: string;
        items: Array<{ name: string; is_default: boolean }>;
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.data.default_account).toBe("beta");
    expect(parsed.data.items).toHaveLength(2);
    expect(parsed.data.items.some((item) => item.name === "alpha")).toBe(true);
    expect(parsed.data.items.some((item) => item.name === "beta" && item.is_default)).toBe(true);
  });

  it("routes media list to the selected --account", async () => {
    const store = new CliStore();
    store.setMetaByoConfig({ igUserId: "17841400000000001", igAccountId: "17841400000000001", hasAccessToken: true }, "alpha");
    store.setMetaByoConfig({ igUserId: "17841400000000002", igAccountId: "17841400000000002", hasAccessToken: true }, "beta");
    await store.setSecret("meta-byo", "accessToken", "EAAB_ALPHA", "alpha");
    await store.setSecret("meta-byo", "accessToken", "EAAB_BETA", "beta");
    store.setDefaultProvider("meta-byo");
    store.setDefaultAccount("alpha", "meta-byo");

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "media",
      "list",
      "--account",
      "beta",
      "--json",
      "--quiet"
    ])) as { ok: boolean; action: string };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("media.list");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/17841400000000002/media");
  });

  it("blocks publish when --confirm-account does not match account metadata", async () => {
    const store = new CliStore();
    store.setMetaByoConfig(
      {
        hasAccessToken: true,
        igUserId: "17841400000000001",
        igAccountId: "17841400000000001",
        igUsername: "alpha_user"
      },
      "alpha"
    );
    store.setDefaultProvider("meta-byo");
    store.setDefaultAccount("alpha", "meta-byo");

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "publish",
      "photo",
      "--file",
      "https://example.com/photo.jpg",
      "--account",
      "alpha",
      "--confirm-account",
      "@wrong_user",
      "--json",
      "--quiet",
      "--dry-run"
    ])) as {
      ok: boolean;
      error?: {
        code: string;
        message: string;
        details?: { configured_username?: string; confirm_account?: string };
      };
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
    expect(parsed.error?.message).toContain("Account confirmation failed");
    expect(parsed.error?.details?.configured_username).toBe("@alpha_user");
    expect(parsed.error?.details?.confirm_account).toBe("@wrong_user");
  });

  it("blocks publish when no default account is configured", async () => {
    const parsed = (await runCliJson([
      "node",
      "instacli",
      "publish",
      "photo",
      "--file",
      "https://example.com/photo.jpg",
      "--json",
      "--quiet",
      "--dry-run"
    ])) as {
      ok: boolean;
      error?: { code: string; message: string };
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
    expect(parsed.error?.message).toContain("No default account configured");
  });
});
