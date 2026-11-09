import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import { attachUser } from "./auth/auth.js";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import { logger } from "./logger.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { csrfGuard, securityHeaders } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { charactersRouter } from "./routes/characters.js";
import { pushRouter } from "./routes/push.js";
import { reputationRouter } from "./routes/reputation.js";
import { sharedRouter } from "./routes/shared.js";
import { contentRouter } from "./routes/content.js";
import { dmRouter } from "./routes/dm.js";
import { encountersRouter } from "./routes/encounters.js";
import { rulesRouter } from "./routes/rules.js";
import { storyRouter } from "./routes/story.js";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      serializers: { req: (req) => ({ method: req.method, url: req.url }) },
    }),
  );
  app.use(securityHeaders({ production: config.nodeEnv === "production" }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  // Order matters: the CSRF guard runs before any state-changing route, the global limiter before everything under /api.
  app.use("/api", rateLimit({ name: "api", windowMs: 60_000, max: 2400, message: "Too many requests. Slow down a little." }));
  app.use("/api", csrfGuard({ allowedOrigins: config.corsOrigins, cookieName: config.cookieName }));
  // Share and hand-off tokens are long and random, but probing them should still be slow.
  app.use("/api/shared", rateLimit({ name: "shared", windowMs: 60_000, max: 60 }));
  app.use(attachUser);

  // `commit` comes from Render (RENDER_GIT_COMMIT) so a deploy can be confirmed from outside.
  app.get("/api/health", (_req, res) => res.json({ ok: true, env: config.nodeEnv, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null }));

  app.use("/api/auth", authRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/campaigns", contentRouter);
  app.use("/api/campaigns", rulesRouter);
  app.use("/api/campaigns", dmRouter);
  app.use("/api/campaigns", encountersRouter);
  app.use("/api/campaigns", storyRouter);
  app.use("/api/characters", charactersRouter);
  app.use("/api/push", pushRouter);
  app.use("/api", reputationRouter);
  app.use("/api/shared", sharedRouter);

  app.use("/api", (_req, _res, next) => next(notFound("Endpoint")));

  // Production: serve the built web app from the same origin (Render runs a single service).
  const webDist = process.env.WEB_DIST ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDist)) {
    // Service worker + manifest must never be served stale, or installed PWAs keep old precache lists.
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: "1h",
        immutable: false,
        setHeaders: (res, filePath) => {
          if (/(?:^|\/)(sw\.js|push-sw\.js|registerSW\.js|manifest\.webmanifest|workbox-[^/]+\.js)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(resolve(webDist, "index.html"));
    });
    logger.info({ webDist }, "Serving web app");
  }

  app.use(errorHandler);
  return app;
}
