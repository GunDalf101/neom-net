import { LoginSchema, RegisterSchema } from "@neom/shared";
import { Router } from "express";
import { clearSessionCookie, hashPassword, requireAuth, setSessionCookie, signToken, verifyPassword, type AuthedRequest } from "../auth/auth.js";
import { prisma } from "../db.js";
import { conflict, unauthorized, wrap } from "../errors.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";

const WINDOW_15_MIN = 15 * 60 * 1000;
/** Per IP: failed logins only, so a table full of people behind one NAT can still sign in. */
const loginIpLimit = rateLimit({ name: "login-ip", windowMs: WINDOW_15_MIN, max: 30, failuresOnly: true, message: "Too many failed logins from this network. Try again in 15 minutes." });
/** Per account: stops a distributed guess against one identifier. */
const loginAccountLimit = rateLimit({
  name: "login-account",
  windowMs: WINDOW_15_MIN,
  max: 10,
  failuresOnly: true,
  key: (req) => (typeof req.body?.identifier === "string" ? req.body.identifier.trim().toLowerCase() : null),
  message: "Too many failed logins for this account. Try again in 15 minutes.",
});
const registerLimit = rateLimit({ name: "register", windowMs: 60 * 60 * 1000, max: 20, message: "Too many accounts created from this network. Try again later." });

export const authRouter = Router();

const publicUser = (u: { id: string; email: string; username: string; createdAt: Date }) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  createdAt: u.createdAt.toISOString(),
});

authRouter.post(
  "/register",
  registerLimit,
  wrap(async (req, res) => {
    const input = parseBody(RegisterSchema, req.body);
    const email = input.email.toLowerCase();
    let username = (input.username || email.split("@")[0] || "user").replace(/[^a-zA-Z0-9_\-.]/g, "").slice(0, 32) || "user";
    if (username.length < 2) username = `${username}1`;
    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { username: { equals: username, mode: "insensitive" } }] } });
    if (exists?.email === email && exists.passwordHash === "") {
      // Claimable account: created by a data migration that imported a campaign for this email before the
      // person registered. Registering with that email sets the password and keeps everything attached.
      const claimed = await prisma.user.update({
        where: { id: exists.id },
        data: { passwordHash: await hashPassword(input.password), username: input.username ? username : exists.username },
      });
      setSessionCookie(res, signToken(claimed));
      res.status(201).json({ user: publicUser(claimed), claimed: true });
      return;
    }
    if (exists?.email === email) throw conflict("An account with this email already exists. Log in instead.");
    if (exists) {
      // Handle taken: suffix a short random tag so registration still succeeds.
      username = `${username.slice(0, 27)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const user = await prisma.user.create({ data: { email, username, passwordHash: await hashPassword(input.password) } });
    setSessionCookie(res, signToken(user));
    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  loginIpLimit,
  loginAccountLimit,
  wrap(async (req, res) => {
    const input = parseBody(LoginSchema, req.body);
    const id = input.identifier.trim();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: id.toLowerCase() }, { username: { equals: id, mode: "insensitive" } }] },
    });
    // Constant-ish time: always run a compare.
    const ok = user ? await verifyPassword(input.password, user.passwordHash) : await verifyPassword(input.password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    if (!user || !ok) throw unauthorized("Invalid credentials");
    setSessionCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const { user } = req as AuthedRequest;
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    res.json({ user: publicUser(row) });
  }),
);
