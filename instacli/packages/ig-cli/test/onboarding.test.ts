import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

describe("ig onboarding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns onboarding payload in JSON mode", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli(["node", "ig", "onboarding", "--json", "--quiet", "--dry-run"]);

    const parsed = JSON.parse(output.trim()) as {
      ok: boolean;
      action: string;
      data: { provider: string; opened_links: boolean; links: Array<{ label: string; url: string }>; checklist: string[] };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("onboarding.meta-byo");
    expect(parsed.data.provider).toBe("meta-byo");
    expect(parsed.data.opened_links).toBe(false);
    expect(parsed.data.links.length).toBeGreaterThan(0);
    expect(parsed.data.checklist.length).toBeGreaterThan(0);
  });

  it("returns validation error for unsupported provider", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli(["node", "ig", "onboarding", "--provider", "central", "--json", "--quiet"]);

    const parsed = JSON.parse(output.trim()) as { ok: boolean; error?: { code: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
  });
});
