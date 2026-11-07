import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type NodeEnv = "development" | "production" | "test";

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  cookieName: string;
  sessionDays: number;
}

/**
 * In development, when JWT_SECRET is not provided, a random secret is generated once and kept
 * in the OS temp directory (outside the project tree) so sessions survive server restarts
 * without committing any secret to the repository. Production must set JWT_SECRET.
 */
function devSecret(): string {
  const dir = join(tmpdir(), "neom-net");
  const file = join(dir, "dev-jwt-secret");
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
    mkdirSync(dir, { recursive: true });
    const secret = randomBytes(48).toString("hex");
    writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  } catch {
    return randomBytes(48).toString("hex");
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV as NodeEnv | undefined) ?? "development";
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  let jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (!jwtSecret) {
    if (nodeEnv === "production") throw new Error("JWT_SECRET is required in production");
    jwtSecret = devSecret();
  }
  if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return {
    nodeEnv,
    port: Number(env.PORT ?? 4000),
    databaseUrl,
    jwtSecret,
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174").split(",").map((s) => s.trim()).filter(Boolean),
    cookieName: "neom_session",
    // Sessions slide: any authenticated request after a day re-issues the cookie, so an active
    // device (browser or installed PWA) stays signed in until it is idle for this many days.
    sessionDays: Math.max(1, Number(env.SESSION_DAYS ?? 30)),
  };
}

export const config = loadConfig();
