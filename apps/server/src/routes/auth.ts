import { LoginSchema, RegisterSchema } from "@neom/shared";
import { Router } from "express";
import { clearSessionCookie, hashPassword, requireAuth, setSessionCookie, signToken, verifyPassword, type AuthedRequest } from "../auth/auth.js";
import { prisma } from "../db.js";
import { conflict, unauthorized, wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";

export const authRouter = Router();

const publicUser = (u: { id: string; email: string; username: string; createdAt: Date }) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  createdAt: u.createdAt.toISOString(),
});

authRouter.post(
  "/register",
  wrap(async (req, res) => {
    const input = parseBody(RegisterSchema, req.body);
    const email = input.email.toLowerCase();
    let username = (input.username || email.split("@")[0] || "user").replace(/[^a-zA-Z0-9_\-.]/g, "").slice(0, 32) || "user";
    if (username.length < 2) username = `${username}1`;
    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { username: { equals: username, mode: "insensitive" } }] } });
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
