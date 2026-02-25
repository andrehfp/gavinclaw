import http from "node:http";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_API_BASE = "http://127.0.0.1:8787";

const readStringEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveApiBase = () => {
  const raw = readStringEnv("LANDING_API_BASE_URL") ?? readStringEnv("IG_CENTRAL_API_URL") ?? DEFAULT_API_BASE;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid LANDING_API_BASE_URL/IG_CENTRAL_API_URL: ${raw}`);
  }
};

const html = (apiBase) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>InstaCLI Login Gateway</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg-1: #fff8ef;
        --bg-2: #f9efe4;
        --ink: #1a1108;
        --ink-soft: #5f4e3f;
        --accent: #e06f1e;
        --accent-ink: #ffffff;
        --card: #fffaf4;
        --line: #efdbca;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Space Grotesk", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(1000px 500px at -10% -20%, #ffe3c2 0%, transparent 65%),
          radial-gradient(900px 500px at 110% 120%, #ffd7b1 0%, transparent 60%),
          linear-gradient(160deg, var(--bg-1), var(--bg-2));
      }
      .wrap {
        max-width: 720px;
        margin: 0 auto;
        padding: 40px 24px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--card);
        box-shadow: 0 24px 70px rgba(132, 74, 20, 0.14);
        padding: 28px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: clamp(28px, 5vw, 40px);
        line-height: 1.05;
        letter-spacing: -0.02em;
      }
      p {
        margin: 0;
        color: var(--ink-soft);
        line-height: 1.5;
      }
      .actions {
        margin-top: 24px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .btn {
        border: 0;
        border-radius: 12px;
        background: var(--accent);
        color: var(--accent-ink);
        padding: 12px 18px;
        font-weight: 700;
        font-family: inherit;
        text-decoration: none;
        display: inline-block;
      }
      .btn.secondary {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--line);
      }
      .meta {
        margin-top: 18px;
        font-family: "DM Mono", monospace;
        font-size: 12px;
        color: #866751;
        border-top: 1px dashed var(--line);
        padding-top: 12px;
      }
      ol {
        margin: 18px 0 0;
        padding-left: 18px;
      }
      li {
        margin-bottom: 8px;
        color: var(--ink-soft);
      }
      code {
        font-family: "DM Mono", monospace;
        background: #f6ece0;
        border: 1px solid #ead4c0;
        border-radius: 8px;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <h1>Instagram Login Gateway</h1>
        <p>Authenticate with Facebook Login, then copy the one-time bootstrap code and finish setup in your agent terminal.</p>
        <div class="actions">
          <a class="btn" href="/login">Continue with Facebook</a>
          <a class="btn secondary" href="/health">Health</a>
        </div>
        <ol>
          <li>Click <strong>Continue with Facebook</strong>.</li>
          <li>Authorize your account and return to the callback page.</li>
          <li>Copy the <code>IGB-...</code> code shown there.</li>
          <li>Run <code>instacli setup central-bootstrap --code IGB-... --json --quiet</code>.</li>
        </ol>
        <p class="meta">API base: ${apiBase}</p>
      </section>
    </main>
  </body>
</html>`;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, headers);
  res.end(body);
};

const start = async () => {
  const apiBase = resolveApiBase();
  const portRaw = process.env.PORT ?? String(DEFAULT_PORT);
  const port = Number.parseInt(portRaw, 10);
  const host = process.env.HOST ?? DEFAULT_HOST;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = reqUrl.pathname;

    if (path === "/health") {
      return send(res, 200, JSON.stringify({ ok: true, service: "landing", api_base: apiBase }), {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
    }

    if (path === "/login") {
      const startUrl = new URL("/oauth/start", apiBase);
      let response;
      try {
        response = await fetch(startUrl, {
          method: "POST",
          headers: {
            Accept: "application/json"
          }
        });
      } catch (error) {
        return send(
          res,
          502,
          `Could not reach auth backend (${apiBase}). ${error instanceof Error ? error.message : String(error)}`,
          { "content-type": "text/plain; charset=utf-8" }
        );
      }

      const parsed = await response.json().catch(() => null);
      const loginUrl = parsed && typeof parsed.login_url === "string" ? parsed.login_url : undefined;
      if (!response.ok || !loginUrl) {
        return send(
          res,
          502,
          `Auth backend returned an invalid response.\n\n${JSON.stringify(parsed, null, 2)}`,
          { "content-type": "text/plain; charset=utf-8" }
        );
      }

      res.writeHead(302, {
        location: loginUrl,
        "cache-control": "no-store"
      });
      res.end();
      return;
    }

    if (path === "/") {
      return send(res, 200, html(apiBase), {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
    }

    return send(res, 404, "Not found", {
      "content-type": "text/plain; charset=utf-8"
    });
  });

  server.listen(port, host, () => {
    process.stdout.write(`[landing] listening on http://${host}:${port} (api: ${apiBase})\n`);
  });
};

start().catch((error) => {
  process.stderr.write(`[landing] failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
