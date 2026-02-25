import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliStore } from "@instacli/ig-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const originalExitCode = process.exitCode;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalHome = process.env.HOME;
const originalCentralApiUrl = process.env.IG_CENTRAL_API_URL;

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

  if (originalCentralApiUrl === undefined) {
    delete process.env.IG_CENTRAL_API_URL;
  } else {
    process.env.IG_CENTRAL_API_URL = originalCentralApiUrl;
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

describe("ig setup central-bootstrap", () => {
  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-central-bootstrap-"));
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

  it("returns JSON in dry-run mode", async () => {
    const parsed = (await runCliJson([
      "node",
      "instacli",
      "setup",
      "central-bootstrap",
      "--code",
      "IGB-DRYRUN",
      "--json",
      "--quiet",
      "--dry-run"
    ])) as { ok: boolean; action: string; data: { wrote: boolean; status: string } };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("setup.central-bootstrap");
    expect(parsed.data.wrote).toBe(false);
    expect(parsed.data.status).toBe("dry-run");
  });

  it("writes meta-byo config from bootstrap exchange", async () => {
    process.env.IG_CENTRAL_API_URL = "https://central.example.com";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            provider: "meta-byo",
            ig_account_id: "17841400000000001",
            ig_username: "instacli_user",
            page_id: "123",
            page_name: "Page One",
            page_access_token: "EAAB_TEST_TOKEN",
            session_token: "central-session-token",
            expires_at: 2_000_000_000_000
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const parsed = (await runCliJson([
      "node",
      "instacli",
      "setup",
      "central-bootstrap",
      "--code",
      "IGB-123456",
      "--account",
      "demo",
      "--json",
      "--quiet"
    ])) as {
      ok: boolean;
      action: string;
      data: { wrote: boolean; account_name: string; profile: { ig_account_id: string; page_access_token: string } };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("setup.central-bootstrap");
    expect(parsed.data.wrote).toBe(true);
    expect(parsed.data.account_name).toBe("demo");
    expect(parsed.data.profile.ig_account_id).toBe("17841400000000001");
    expect(parsed.data.profile.page_access_token).not.toContain("EAAB_TEST_TOKEN");

    const store = new CliStore();
    const meta = store.getMetaByoConfig("demo");
    const token = await store.getSecret("meta-byo", "accessToken", "demo");
    const sessionToken = await store.getSecret("central", "sessionToken");
    expect(meta.igAccountId).toBe("17841400000000001");
    expect(meta.igUsername).toBe("instacli_user");
    expect(token).toBe("EAAB_TEST_TOKEN");
    expect(sessionToken).toBe("central-session-token");
    expect(store.getDefaultProvider()).toBe("meta-byo");
    expect(store.getDefaultAccount("meta-byo")).toBe("demo");
  });
});
