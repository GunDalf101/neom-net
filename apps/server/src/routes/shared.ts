import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { badRequest, wrap } from "../errors.js";
import { claimSheet, getClaimInfo, getSharedSheet } from "../services/characters.js";

/** Share links (`/s/<token>` in the web app). Any signed-in user holding the token may read the sheet. */
export const sharedRouter = Router();
sharedRouter.use(requireAuth);

const Token = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

// Hand-off links (`/claim/<token>`): preview, then take ownership. Declared before `/:token`.
sharedRouter.get("/claim/:token", wrap<AuthedRequest>(async (req, res) => {
  const token = Token.safeParse(req.params.token);
  if (!token.success) throw badRequest("Malformed hand-off link");
  res.json(await getClaimInfo(token.data, req.user.id));
}));
sharedRouter.post("/claim/:token", wrap<AuthedRequest>(async (req, res) => {
  const token = Token.safeParse(req.params.token);
  if (!token.success) throw badRequest("Malformed hand-off link");
  res.json(await claimSheet(token.data, req.user.id));
}));

sharedRouter.get("/:token", wrap<AuthedRequest>(async (req, res) => {
  const token = Token.safeParse(req.params.token);
  if (!token.success) throw badRequest("Malformed share link");
  res.json(await getSharedSheet(token.data, req.user.id));
}));
