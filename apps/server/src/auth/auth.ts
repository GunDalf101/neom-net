import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { unauthorized } from "../errors.js";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type AuthedRequest = Request & { user: AuthUser };

interface TokenPayload {
  sub: string;
  username: string;
  /** Issued-at (seconds), set by jsonwebtoken; drives the sliding refresh. */
  iat?: number;
}

/** Re-issue the session cookie once it is this old, so active devices never hit the expiry. */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: { id: string; username: string }): string {
  const payload: TokenPayload = { sub: user.id, username: user.username };
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: `${config.sessionDays}d`,
    issuer: "neom-net",
    audience: "neom-net-web",
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "neom-net",
      audience: "neom-net-web",
    });
    if (typeof decoded !== "object" || !decoded || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub, username: String((decoded as TokenPayload).username ?? ""), iat: typeof decoded.iat === "number" ? decoded.iat : undefined };
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  return (await sessionFromToken(token))?.user ?? null;
}

async function sessionFromToken(token: string | undefined): Promise<{ user: AuthUser; issuedAt: number | undefined } | null> {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true, email: true },
  });
  return user ? { user, issuedAt: payload.iat } : null;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, { path: "/" });
}

/**
 * Attaches req.user when a valid session cookie is present; never rejects. Sliding session: a
 * token older than a day is re-issued on the response, so a device that keeps using the app
 * (including an installed PWA opened from a shared link) stays authenticated by default.
 */
export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const session = await sessionFromToken(cookies[config.cookieName]);
    if (session) {
      req.user = session.user;
      const age = Math.floor(Date.now() / 1000) - (session.issuedAt ?? 0);
      if (age > REFRESH_AFTER_SECONDS) setSessionCookie(res, signToken(session.user));
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}
