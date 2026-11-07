#!/usr/bin/env node
// Runs a command with development defaults for env vars that are not already set.
// Loads apps/server/.env if present (git-ignored) without any extra dependency.
// Production must provide real values: the server refuses dev defaults when NODE_ENV=production.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "..", ".env");

if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const defaults = {
  DATABASE_URL: "postgresql://neom:neom_dev_password@localhost:5433/neom_net?schema=public",
  PORT: "4000",
  CORS_ORIGINS: "http://localhost:5173,http://localhost:5174",
  NODE_ENV: "development",
};
for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-env.mjs <command> [args...]");
  process.exit(2);
}
const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
