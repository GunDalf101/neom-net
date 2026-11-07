import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { attachUser } from "./auth/auth.js";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import { logger } from "./logger.js";
import { authRouter } from "./routes/auth.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { charactersRouter } from "./routes/characters.js";
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
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true, env: config.nodeEnv }));

  app.use("/api/auth", authRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/campaigns", contentRouter);
  app.use("/api/campaigns", rulesRouter);
  app.use("/api/campaigns", dmRouter);
  app.use("/api/campaigns", encountersRouter);
  app.use("/api/campaigns", storyRouter);
  app.use("/api/characters", charactersRouter);

  app.use("/api", (_req, _res, next) => next(notFound("Endpoint")));
  app.use(errorHandler);
  return app;
}
