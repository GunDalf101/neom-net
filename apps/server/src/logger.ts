import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "info" : "info"),
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
    censor: "[redacted]",
  },
  transport: isDev ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined,
});
