import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForOAuthCallback } from "../src/oauth.js";

describe("oauth callback server", () => {
  const serversToClose: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      serversToClose.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close(() => resolve());
          })
      )
    );
  });

  it("rejects non-http redirect uri protocol", async () => {
    const result = await waitForOAuthCallback("https://127.0.0.1:8788/callback", 50);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("protocol must be http");
  });

  it("returns clear error when callback port is already in use", async () => {
    const fakeServer = {
      listening: false,
      once(event: string, handler: (...args: unknown[]) => void) {
        if (event === "error") {
          setTimeout(() => handler(new Error("EADDRINUSE")), 0);
        }
        return this;
      },
      listen() {
        return this;
      },
      close(callback?: () => void) {
        callback?.();
        return this;
      }
    } as unknown as http.Server;

    const spy = vi.spyOn(http, "createServer").mockReturnValue(fakeServer);
    const result = await waitForOAuthCallback("http://127.0.0.1:8788/callback", 200);
    spy.mockRestore();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("Failed to start OAuth callback server");
  });
});
