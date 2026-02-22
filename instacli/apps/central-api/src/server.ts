import fastify from "fastify";
import { registerRoutes } from "./routes/index.js";
import { InMemoryTokenStore } from "./services/token-store.js";

const parseTrustProxy = (): boolean => {
  const raw = process.env.IG_CENTRAL_TRUST_PROXY?.toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes";
};

export const buildServer = () => {
  const app = fastify({ logger: true, bodyLimit: 1_048_576, trustProxy: parseTrustProxy() });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    reply.header("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    return payload;
  });

  const tokenStore = new InMemoryTokenStore();
  registerRoutes(app, tokenStore);
  return app;
};

const start = async (): Promise<void> => {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";

  await app.listen({ port, host });
};

if (process.env.NODE_ENV !== "test") {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
