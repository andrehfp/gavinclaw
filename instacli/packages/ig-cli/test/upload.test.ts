import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const originalExitCode = process.exitCode;

describe("ig upload file", () => {
  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("passes through HTTPS URLs and exposes capability fields", async () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    await runCli(["node", "ig", "upload", "file", "--file", "https://example.com/image.jpg", "--json", "--quiet"]);

    const parsed = JSON.parse(output.trim()) as {
      ok: boolean;
      action: string;
      data: {
        source_kind: string;
        effective_via: string;
        public_url: string;
        capabilities: {
          can_use_input_url: boolean;
          can_use_uguu: boolean;
          can_use_litterbox: boolean;
        };
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe("upload.file");
    expect(parsed.data.source_kind).toBe("https-url");
    expect(parsed.data.effective_via).toBe("passthrough");
    expect(parsed.data.public_url).toBe("https://example.com/image.jpg");
    expect(parsed.data.capabilities.can_use_input_url).toBe(true);
    expect(parsed.data.capabilities.can_use_uguu).toBe(false);
    expect(parsed.data.capabilities.can_use_litterbox).toBe(false);
  });

  it("shows dry-run plan for local files", async () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-upload-test-"));
    const filePath = path.join(tempDir, "photo.jpg");
    await fs.writeFile(filePath, "fake-image-content", "utf8");

    try {
      await runCli(["node", "ig", "upload", "file", "--file", filePath, "--json", "--quiet", "--dry-run"]);

      const parsed = JSON.parse(output.trim()) as {
        ok: boolean;
        data: {
          source_kind: string;
          status: string;
          effective_via: string;
          capabilities: {
            can_use_input_url: boolean;
            can_use_uguu: boolean;
            can_use_litterbox: boolean;
          };
        };
      };

      expect(parsed.ok).toBe(true);
      expect(parsed.data.source_kind).toBe("local-file");
      expect(parsed.data.status).toBe("dry-run");
      expect(parsed.data.effective_via).toBe("uguu");
      expect(parsed.data.capabilities.can_use_input_url).toBe(false);
      expect(parsed.data.capabilities.can_use_uguu).toBe(true);
      expect(parsed.data.capabilities.can_use_litterbox).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uploads local files to uguu", async () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ files: [{ url: "https://a.uguu.se/uploaded.jpg" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-upload-test-"));
    const filePath = path.join(tempDir, "photo.jpg");
    await fs.writeFile(filePath, "fake-image-content", "utf8");

    try {
      await runCli(["node", "ig", "upload", "file", "--file", filePath, "--via", "uguu", "--json", "--quiet"]);

      const parsed = JSON.parse(output.trim()) as {
        ok: boolean;
        action: string;
        data: {
          effective_via: string;
          public_url: string;
          status: string;
        };
      };

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(parsed.ok).toBe(true);
      expect(parsed.action).toBe("upload.file");
      expect(parsed.data.effective_via).toBe("uguu");
      expect(parsed.data.public_url).toBe("https://a.uguu.se/uploaded.jpg");
      expect(parsed.data.status).toBe("uploaded");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uploads local files to litterbox", async () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const fetchMock = vi.fn().mockResolvedValue(new Response("https://litter.catbox.moe/abcd12.jpg", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-upload-test-"));
    const filePath = path.join(tempDir, "photo.jpg");
    await fs.writeFile(filePath, "fake-image-content", "utf8");

    try {
      await runCli([
        "node",
        "ig",
        "upload",
        "file",
        "--file",
        filePath,
        "--via",
        "litterbox",
        "--litterbox-expiry",
        "12h",
        "--json",
        "--quiet"
      ]);

      const parsed = JSON.parse(output.trim()) as {
        ok: boolean;
        action: string;
        data: {
          effective_via: string;
          public_url: string;
          litterbox_expiry: string;
        };
      };

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(parsed.ok).toBe(true);
      expect(parsed.action).toBe("upload.file");
      expect(parsed.data.effective_via).toBe("litterbox");
      expect(parsed.data.public_url).toBe("https://litter.catbox.moe/abcd12.jpg");
      expect(parsed.data.litterbox_expiry).toBe("12h");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns validation error when passthrough is used with local file", async () => {
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-upload-test-"));
    const filePath = path.join(tempDir, "photo.jpg");
    await fs.writeFile(filePath, "fake-image-content", "utf8");

    try {
      await runCli(["node", "ig", "upload", "file", "--file", filePath, "--via", "passthrough", "--json", "--quiet"]);

      const parsed = JSON.parse(output.trim()) as {
        ok: boolean;
        error?: {
          code: string;
          details?: {
            capabilities?: { can_use_uguu?: boolean; can_use_litterbox?: boolean };
          };
        };
      };

      expect(parsed.ok).toBe(false);
      expect(parsed.error?.code).toBe("VALIDATION_ERROR");
      expect(parsed.error?.details?.capabilities?.can_use_uguu).toBe(true);
      expect(parsed.error?.details?.capabilities?.can_use_litterbox).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
