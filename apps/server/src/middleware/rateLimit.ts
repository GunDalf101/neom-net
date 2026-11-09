import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors.js";

export interface RateLimitOptions {
  /** Window length in milliseconds (fixed window). */
  windowMs: number;
  /** Attempts allowed per key per window. */
  max: number;
  /** Bucket name, kept separate from other limiters on the same route. */
  name: string;
  /** Key derivation; defaults to the client IP (Express honours `trust proxy`). */
  key?: (req: Request) => string | null | undefined;
  /** Count only requests that end in an error (4xx/5xx): brute force is throttled, real logins are not. */
  failuresOnly?: boolean;
  /** Message for the 429 body. */
  message?: string;
  /** Clock, injectable for tests. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export const tooManyRequests = (msg: string, retryAfterSeconds: number) => new HttpError(429, msg, "rate_limited", { retryAfterSeconds });

/**
 * Small in-memory fixed-window limiter. Enough for a single-instance deployment (Render runs one
 * process); a multi-instance setup would need a shared store. Sends the IETF draft `RateLimit-*`
 * headers so clients can show "try again in N minutes".
 */
export function rateLimit(opts: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const now = opts.now ?? Date.now;
  const keyOf = opts.key ?? ((req: Request) => req.ip);
  let lastSweep = 0;

  const sweep = (t: number) => {
    if (t - lastSweep < opts.windowMs) return;
    lastSweep = t;
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  };

  const bucket = (k: string, t: number): Bucket => {
    let b = buckets.get(k);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + opts.windowMs };
      buckets.set(k, b);
    }
    return b;
  };

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const raw = keyOf(req);
    if (!raw) return next();
    const k = `${opts.name}:${raw}`;
    const t = now();
    sweep(t);
    const b = bucket(k, t);
    const retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
    res.setHeader("RateLimit-Limit", String(opts.max));
    res.setHeader("RateLimit-Reset", String(retryAfter));
    if (b.count >= opts.max) {
      res.setHeader("RateLimit-Remaining", "0");
      res.setHeader("Retry-After", String(retryAfter));
      return next(tooManyRequests(opts.message ?? `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} min.`, retryAfter));
    }
    if (opts.failuresOnly) {
      res.on("finish", () => {
        if (res.statusCode >= 400) bucket(k, now()).count += 1;
      });
    } else {
      b.count += 1;
    }
    res.setHeader("RateLimit-Remaining", String(Math.max(0, opts.max - b.count)));
    next();
  };

  return Object.assign(middleware, {
    /** Test/inspection hook. */
    _buckets: buckets,
    reset: () => buckets.clear(),
  });
}
