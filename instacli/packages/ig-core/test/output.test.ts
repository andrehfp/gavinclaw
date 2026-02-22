import { describe, expect, it } from "vitest";
import { formatResult } from "../src/output.js";

describe("formatResult", () => {
  it("returns JSON when --json is enabled", () => {
    const value = formatResult({ ok: true, action: "media.list", data: { items: [] } }, { json: true, quiet: false });
    expect(value).toBe('{"ok":true,"action":"media.list","data":{"items":[]}}');
  });

  it("returns null when quiet mode is active without json", () => {
    const value = formatResult({ ok: true, action: "media.list", data: { items: [] } }, { json: false, quiet: true });
    expect(value).toBeNull();
  });

  it("renders onboarding in step-by-step human format", () => {
    const value = formatResult(
      {
        ok: true,
        action: "onboarding.meta-byo",
        data: {
          provider: "meta-byo",
          opened_links: false,
          links: [{ label: "Meta App Dashboard", url: "https://developers.facebook.com/apps" }],
          checklist: ["Connect Instagram to a Facebook Page"],
          next_steps: ["ig setup meta-token"]
        }
      },
      { json: false, quiet: false }
    );

    expect(value).toContain("Meta BYO Onboarding");
    expect(value).toContain("1. Meta App Dashboard: https://developers.facebook.com/apps");
    expect(value).toContain("Step-by-step:");
    expect(value).toContain("1. [ ] Connect Instagram to a Facebook Page");
    expect(value).toContain("Run now:");
    expect(value).toContain("1. $ ig setup meta-token");
  });

  it("renders onboarding completion with next steps only", () => {
    const value = formatResult(
      {
        ok: true,
        action: "onboarding.meta-byo.completed",
        data: {
          configured: true,
          provider: "meta-byo",
          profile: { ig_account_id: "17841455498491865", ig_username: "andrefprado" },
          next_steps: [
            "ig auth status --json --quiet",
            "ig media list --limit 5 --json --quiet",
            "ig publish photo --file <PUBLIC_URL> --caption \"hello\" --json --quiet --dry-run"
          ]
        }
      },
      { json: false, quiet: false }
    );

    expect(value).toContain("Setup completed (meta-byo)");
    expect(value).toContain("CONFIRMED");
    expect(value).toContain("Next command:");
    expect(value).toContain("$ ig auth status --json --quiet");
    expect(value).not.toContain("Selected profile:");
    expect(value).not.toContain("@andrefprado (17841455498491865)");
    expect(value).not.toContain("Next steps:");
    expect(value).not.toContain("Meta BYO Onboarding");
    expect(value).not.toContain("Links:");
    expect(value).not.toContain("Step-by-step:");
  });
});
