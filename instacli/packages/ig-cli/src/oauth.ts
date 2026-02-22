import http from "node:http";

export type OAuthCallbackPayload =
  | { ok: true; code: string; state: string }
  | { ok: false; message: string };

export const waitForOAuthCallback = async (redirectUri: string, timeoutMs = 120_000): Promise<OAuthCallbackPayload> => {
  const url = new URL(redirectUri);

  if (url.protocol !== "http:") {
    return {
      ok: false,
      message: `Redirect URI protocol must be http for loopback callback server: ${redirectUri}`
    };
  }

  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    return {
      ok: false,
      message: `Redirect URI host must be localhost/127.0.0.1 for automated login: ${redirectUri}`
    };
  }

  const targetPath = url.pathname;
  const port = Number.parseInt(url.port || "80", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return {
      ok: false,
      message: `Invalid redirect URI port for automated login: ${redirectUri}`
    };
  }

  return new Promise<OAuthCallbackPayload>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const done = (payload: OAuthCallbackPayload): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }

      if (server.listening) {
        server.close(() => resolve(payload));
        return;
      }

      resolve(payload);
    };

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `${url.protocol}//${url.host}`);
      if (reqUrl.pathname !== targetPath) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state");
      const error = reqUrl.searchParams.get("error_description") ?? reqUrl.searchParams.get("error");

      if (error) {
        res.statusCode = 400;
        res.end("Authentication failed. You can close this tab.");
        done({ ok: false, message: String(error) });
        return;
      }

      if (!code || !state) {
        res.statusCode = 400;
        res.end("Missing OAuth parameters. You can close this tab.");
        done({ ok: false, message: "OAuth callback missing code/state" });
        return;
      }

      res.statusCode = 200;
      res.end("Authentication completed. You can close this tab.");
      done({ ok: true, code, state });
    });

    server.once("error", (error) => {
      done({
        ok: false,
        message: `Failed to start OAuth callback server: ${error instanceof Error ? error.message : String(error)}`
      });
    });

    server.listen(port, url.hostname);

    timeout = setTimeout(() => {
      done({ ok: false, message: `Timed out waiting for OAuth callback after ${timeoutMs}ms` });
    }, timeoutMs);
  });
};
