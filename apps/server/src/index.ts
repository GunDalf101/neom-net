import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { createRealtime } from "./realtime/io.js";
import { ensureBuiltinConditions } from "./services/conditions.js";

async function main() {
  await prisma.$connect();
  await ensureBuiltinConditions();
  const app = createApp();
  const httpServer = createServer(app);
  createRealtime(httpServer);
  httpServer.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "NEOM//NET server online");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
