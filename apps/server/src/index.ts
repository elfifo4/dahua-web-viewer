import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config, hasCredentials } from "./config.js";
import { registerRoutes } from "./routes.js";
import { startGo2rtc, stopGo2rtc } from "./go2rtc/supervisor.js";

const app = Fastify({ logger: true });

// SDP offers arrive as application/sdp text bodies.
app.addContentTypeParser(["application/sdp", "text/plain"], { parseAs: "string" }, (_req, body, done) => {
  done(null, body);
});

await app.register(cors, { origin: true });
await registerRoutes(app);

// Serve the built web app when it exists (production / LaunchAgent mode),
// with an SPA fallback so deep links like /camera/2 work.
const webDist = path.join(config.repoRoot, "apps/web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ error: "not found" });
  });
}

startGo2rtc((msg) => app.log.info(msg));

const shutdown = async (): Promise<void> => {
  stopGo2rtc();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.server.port, host: "127.0.0.1" });
app.log.info(
  `API on http://127.0.0.1:${config.server.port} — credentials ${hasCredentials ? "loaded" : "MISSING (copy .env.example to .env)"}`,
);
