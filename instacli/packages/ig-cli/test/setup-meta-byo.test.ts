import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

describe("ig setup meta-byo", () => {
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalHome = process.env.HOME;

  afterEach(() => {
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
    vi.restoreAllMocks();
  });

  it("returns JSON in dry-run mode", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli([
      "node",
      "ig",
      "setup",
      "meta-byo",
      "--client-id",
      "abc123",
      "--client-secret",
      "supersecret",
      "--redirect-uri",
      "http://127.0.0.1:8788/callback",
      "--json",
      "--quiet",
      "--dry-run"
    ]);

    const parsed = JSON.parse(output.trim()) as { ok: boolean; action: string; data: { wrote: boolean; env: { IG_META_CLIENT_SECRET: string } } };
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("setup.meta-byo");
    expect(parsed.data.wrote).toBe(false);
    expect(parsed.data.env.IG_META_CLIENT_SECRET).not.toContain("supersecret");
  });

  it("writes env file in non-dry-run mode", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-setup-test-"));
    const envPath = path.join(tempDir, ".env.test");
    process.env.XDG_CONFIG_HOME = tempDir;
    process.env.HOME = tempDir;

    const previousCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await runCli([
        "node",
        "ig",
        "setup",
        "meta-byo",
        "--client-id",
        "app_id_1",
        "--client-secret",
        "app_secret_1",
        "--redirect-uri",
        "http://127.0.0.1:8788/callback",
        "--env-file",
        ".env.test",
        "--json",
        "--quiet"
      ]);

      const envFile = await fs.readFile(envPath, "utf8");
      expect(envFile).toContain("IG_META_CLIENT_ID=app_id_1");
      expect(envFile).toContain("IG_META_CLIENT_SECRET=app_secret_1");
      expect(envFile).toContain("IG_META_REDIRECT_URI=http://127.0.0.1:8788/callback");

      const parsed = JSON.parse(output.trim()) as { ok: boolean; action: string; data: { wrote: boolean } };
      expect(parsed.ok).toBe(true);
      expect(parsed.action).toBe("setup.meta-byo");
      expect(parsed.data.wrote).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects env-file path outside current working directory", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-setup-test-"));
    const previousCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await runCli([
        "node",
        "ig",
        "setup",
        "meta-byo",
        "--client-id",
        "app_id_1",
        "--client-secret",
        "app_secret_1",
        "--redirect-uri",
        "http://127.0.0.1:8788/callback",
        "--env-file",
        "../outside.env",
        "--json",
        "--quiet"
      ]);

      const parsed = JSON.parse(output.trim()) as { ok: boolean; error?: { code: string; message: string } };
      expect(parsed.ok).toBe(false);
      expect(parsed.error?.code).toBe("VALIDATION_ERROR");
      expect(parsed.error?.message).toContain("Unsafe --env-file path");
    } finally {
      process.chdir(previousCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
