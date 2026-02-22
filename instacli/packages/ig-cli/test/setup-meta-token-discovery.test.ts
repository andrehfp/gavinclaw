import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

describe("ig setup meta-token discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-selects page when a single IG candidate is discovered", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "111", name: "Only Page", access_token: "PAGE_TOKEN_111" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instagram_business_account: { id: "1784", username: "only_user" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    await runCli([
      "node",
      "ig",
      "setup",
      "meta-token",
      "--discover-pages",
      "--user-access-token",
      "USER_TOKEN",
      "--json",
      "--quiet",
      "--dry-run"
    ]);

    const parsed = JSON.parse(output.trim()) as {
      ok: boolean;
      action: string;
      data: { selection: { mode: string; page_id?: string }; profile: { ig_account_id: string } };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("setup.meta-token");
    expect(parsed.data.selection.mode).toBe("auto");
    expect(parsed.data.selection.page_id).toBe("111");
    expect(parsed.data.profile.ig_account_id).toBe("1784");
  });

  it("returns explicit guidance when multiple pages are discovered and page-id is missing", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { id: "111", name: "Page One", access_token: "PAGE_TOKEN_111" },
              { id: "222", name: "Page Two", access_token: "PAGE_TOKEN_222" }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instagram_business_account: { id: "1784A", username: "user_a" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instagram_business_account: { id: "1784B", username: "user_b" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    await runCli([
      "node",
      "ig",
      "setup",
      "meta-token",
      "--discover-pages",
      "--user-access-token",
      "USER_TOKEN",
      "--json",
      "--quiet",
      "--dry-run"
    ]);

    const parsed = JSON.parse(output.trim()) as {
      ok: boolean;
      error?: { code: string; message: string; details?: { suggested_commands?: string[] } };
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
    expect(parsed.error?.message).toContain("Multiple pages discovered");
    expect(parsed.error?.details?.suggested_commands?.length).toBe(2);
    expect(parsed.error?.details?.suggested_commands?.[0]).toContain("--page-id 111");
  });

  it("returns onboarding mini step-by-step when no connected Instagram page is found", async () => {
    let output = "";

    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "111", name: "Page One", access_token: "PAGE_TOKEN_111" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "111", name: "Page One" }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    await runCli([
      "node",
      "ig",
      "setup",
      "meta-token",
      "--discover-pages",
      "--user-access-token",
      "USER_TOKEN",
      "--json",
      "--quiet",
      "--dry-run"
    ]);

    const parsed = JSON.parse(output.trim()) as {
      ok: boolean;
      error?: { code: string; message: string; details?: { links?: unknown[]; required_scopes?: string[] } };
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
    expect(parsed.error?.message).toContain("No Facebook page with instagram_business_account found.");
    expect(parsed.error?.message).toContain("Fix now:");
    expect(parsed.error?.message).toContain("Graph API Explorer");
    expect(parsed.error?.details?.links?.length).toBeGreaterThan(0);
    expect(parsed.error?.details?.required_scopes).toContain("pages_show_list");
  });
});
