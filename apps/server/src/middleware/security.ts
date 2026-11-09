import type { NextFunction, Request, Response } from "express";
import { forbidden } from "../errors.js";

/** Header every first-party client sends on state-changing requests. Forms cannot set it; cross-origin fetch needs CORS approval to. */
export const CLIENT_HEADER = "x-neom-client";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The origin this request was served from, as the browser would compute it (behind one trusted proxy hop). */
export function requestOrigin(req: Request): string {
  return `${req.protocol}://${req.get("host") ?? ""}`;
}

/**
 * CSRF defence in depth, on top of `SameSite=Lax` cookies:
 *  1. a mutating request that carries a session cookie must come from an allowed origin
 *     (`Origin`, or `Referer` when the browser sent no `Origin`), and
 *  2. must carry the first-party client header, which an HTML form or an `<img>` cannot add
 *     and a cross-origin script can only add after a CORS preflight we do not grant.
 * Requests without the session cookie (login, register, share links) are checked for origin only.
 */
export function csrfGuard(opts: { allowedOrigins: string[]; cookieName: string }) {
  const allowed = new Set(opts.allowedOrigins.map((o) => o.replace(/\/$/, "")));
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = originOf(req.get("origin")) ?? originOf(req.get("referer"));
    if (origin && origin !== requestOrigin(req) && !allowed.has(origin)) {
      return next(forbidden("Cross-site request blocked"));
    }
    const hasSession = typeof req.headers.cookie === "string" && req.headers.cookie.includes(`${opts.cookieName}=`);
    if (hasSession && !req.get(CLIENT_HEADER)) {
      return next(forbidden("Missing client header"));
    }
    next();
  };
}

/** Baseline response headers (no CSP yet: see README). */
export function securityHeaders(opts: { production: boolean }) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (opts.production) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    next();
  };
}
