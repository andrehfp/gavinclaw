import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

describe("ig setup meta-token", () => {
  afterEach(() => {
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
      "meta-token",
      "--ig-account-id",
      "17841400000000000",
      "--page-access-token",
      "EAABsbCS1iHgBOtoken",
      "--ig-username",
      "myprofile",
      "--json",
      "--quiet",
      "--dry-run"
    ]);

    const parsed = JSON.parse(output.trim()) as {
      ok: boolean;
      action: string;
      data: { wrote: boolean; profile: { ig_account_id: string; page_access_token: string } };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("setup.meta-token");
    expect(parsed.data.wrote).toBe(false);
    expect(parsed.data.profile.ig_account_id).toBe("17841400000000000");
    expect(parsed.data.profile.page_access_token).not.toContain("EAABsbCS1iHgBOtoken");
  });

  it("returns validation error when required fields are missing", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli(["node", "ig", "setup", "meta-token", "--json", "--quiet"]);

    const parsed = JSON.parse(output.trim()) as { ok: boolean; error?: { code: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
  });
});
