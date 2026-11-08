import { FactionInputSchema, ReputationChangeSchema } from "@neom/shared";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireCharacterAccess, requireDm, requireMember } from "../services/access.js";
import * as rep from "../services/reputation.js";

/** Factions (per campaign) and reputation (per character). Mounted at /api. */
export const reputationRouter = Router();
reputationRouter.use(requireAuth);

reputationRouter.get("/campaigns/:campaignId/factions", wrap<AuthedRequest>(async (req, res) => {
  await requireMember(req.params.campaignId as string, req.user.id);
  res.json(await rep.listFactions(req.params.campaignId as string));
}));
reputationRouter.post("/campaigns/:campaignId/factions", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(req.params.campaignId as string, req.user.id);
  res.status(201).json(await rep.createFaction(req.params.campaignId as string, req.user.id, parseBody(FactionInputSchema, req.body)));
}));
reputationRouter.put("/campaigns/:campaignId/factions/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(req.params.campaignId as string, req.user.id);
  res.json(await rep.updateFaction(req.params.campaignId as string, req.user.id, req.params.id as string, parseBody(FactionInputSchema, req.body)));
}));
reputationRouter.delete("/campaigns/:campaignId/factions/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(req.params.campaignId as string, req.user.id);
  await rep.deleteFaction(req.params.campaignId as string, req.user.id, req.params.id as string);
  res.status(204).end();
}));

reputationRouter.get("/characters/:characterId/reputation", wrap<AuthedRequest>(async (req, res) => {
  const { character } = await requireCharacterAccess(req.params.characterId as string, req.user.id);
  res.json(await rep.getReputation(character.campaignId, character.id));
}));
reputationRouter.post("/characters/:characterId/reputation", wrap<AuthedRequest>(async (req, res) => {
  const { character, membership } = await requireCharacterAccess(req.params.characterId as string, req.user.id);
  if (!membership.isDm) {
    res.status(403).json({ error: "Only the DM changes reputation", code: "forbidden" });
    return;
  }
  res.json(await rep.changeReputation(character.campaignId, req.user.id, character.id, parseBody(ReputationChangeSchema, req.body)));
}));
