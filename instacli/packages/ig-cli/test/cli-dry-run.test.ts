import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliStore } from "@instacli/ig-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const originalExitCode = process.exitCode;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalHome = process.env.HOME;

let configHome: string | undefined;

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

describe("ig cli dry-run json contract", () => {
  afterEach(async () => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    restoreEnv();
    if (configHome) {
      await fs.rm(configHome, { recursive: true, force: true });
    }
  });

  it("prints strict JSON for publish photo dry-run", async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "ig-cli-dry-run-"));
    process.env.XDG_CONFIG_HOME = configHome;
    process.env.HOME = configHome;
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
    store.setDefaultAccount("alpha", "meta-byo");
    store.setDefaultProvider("meta-byo");

    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli(["node", "ig", "publish", "photo", "--file", "https://example.com/photo.jpg", "--json", "--quiet", "--dry-run"]);

    const parsed = JSON.parse(output.trim()) as { ok: boolean; action: string; data: { status: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("publish.photo");
    expect(parsed.data.status).toBe("dry-run");
  });

  it("returns JSON for media list dry-run", async () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli(["node", "ig", "media", "list", "--json", "--quiet", "--dry-run"]);

    const parsed = JSON.parse(output.trim()) as { ok: boolean; action: string; data: { items: unknown[] } };
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("media.list");
    expect(Array.isArray(parsed.data.items)).toBe(true);
  });
});
