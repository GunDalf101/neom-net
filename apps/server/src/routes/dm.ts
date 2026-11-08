import { DmGrantSchema, DmMessageSchema, MarkMessagesReadSchema, OverrideInputSchema, RollRequestCreateSchema } from "@neom/shared";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { prisma } from "../db.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as dm from "../services/dm.js";
import { createOverride, revokeOverride } from "../services/overrides.js";

export const dmRouter = Router();
dmRouter.use(requireAuth);
const pid = (req: AuthedRequest) => req.params.campaignId as string;

dmRouter.get("/:campaignId/dashboard", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await dm.getDashboard(pid(req), req.user.id));
}));

dmRouter.post("/:campaignId/overrides", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await createOverride(pid(req), req.user.id, parseBody(OverrideInputSchema, req.body)));
}));
dmRouter.delete("/:campaignId/overrides/:overrideId", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await revokeOverride(pid(req), req.user.id, req.params.overrideId as string));
}));

dmRouter.post("/:campaignId/dm/grant", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await dm.grantResource(pid(req), req.user.id, parseBody(DmGrantSchema, req.body));
  res.json({ ok: true });
}));

dmRouter.post("/:campaignId/messages", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  const input = parseBody(DmMessageSchema, req.body);
  // Players may only whisper the DM; the DM may target anyone or broadcast.
  if (!m.isDm) {
    const dmMember = await prisma.campaignMembership.findFirst({ where: { campaignId: pid(req), role: "DM" } });
    res.status(201).json(await dm.sendMessage(pid(req), req.user.id, { ...input, kind: "whisper", userId: dmMember?.userId, userIds: undefined, characterId: undefined }));
    return;
  }
  res.status(201).json(await dm.sendMessage(pid(req), req.user.id, input));
}));
dmRouter.post("/:campaignId/messages/read", wrap<AuthedRequest>(async (req, res) => {
  await requireMember(pid(req), req.user.id);
  res.json(await dm.markMessagesRead(pid(req), req.user.id, parseBody(MarkMessagesReadSchema, req.body).ids));
}));
dmRouter.get("/:campaignId/messages", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await dm.listMessages(pid(req), { userId: req.user.id, isDm: m.isDm }));
}));

dmRouter.post("/:campaignId/roll-requests", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await dm.createRollRequest(pid(req), req.user.id, parseBody(RollRequestCreateSchema, req.body)));
}));
dmRouter.get("/:campaignId/roll-requests", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await dm.listRollRequests(pid(req), { userId: req.user.id, isDm: m.isDm }));
}));
dmRouter.delete("/:campaignId/roll-requests/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await dm.cancelRollRequest(pid(req), req.params.id as string);
  res.json({ ok: true });
}));
