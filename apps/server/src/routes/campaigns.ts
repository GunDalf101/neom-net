import { CreateCampaignSchema, JoinCampaignSchema, RollRequestSchema, UpdateCampaignSchema } from "@neom/shared";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as campaigns from "../services/campaigns.js";
import { listCampaignCharacters } from "../services/characters.js";
import { listRolls, performRoll } from "../services/dice.js";
import { listEvents } from "../services/events.js";
import { listOverrides } from "../services/overrides.js";

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

const pid = (req: AuthedRequest, key = "campaignId") => req.params[key] as string;

campaignsRouter.get("/", wrap<AuthedRequest>(async (req, res) => res.json(await campaigns.listCampaigns(req.user.id))));
campaignsRouter.post("/", wrap<AuthedRequest>(async (req, res) => res.status(201).json(await campaigns.createCampaign(req.user.id, parseBody(CreateCampaignSchema, req.body)))));
campaignsRouter.post("/join", wrap<AuthedRequest>(async (req, res) => res.json(await campaigns.joinCampaign(req.user.id, parseBody(JoinCampaignSchema, req.body).inviteCode))));

campaignsRouter.get("/:campaignId", wrap<AuthedRequest>(async (req, res) => res.json(await campaigns.getCampaign(pid(req), req.user.id))));
campaignsRouter.patch("/:campaignId", wrap<AuthedRequest>(async (req, res) => res.json(await campaigns.updateCampaign(pid(req), req.user.id, parseBody(UpdateCampaignSchema, req.body)))));
campaignsRouter.post("/:campaignId/invite/regenerate", wrap<AuthedRequest>(async (req, res) => res.json(await campaigns.regenerateInvite(pid(req), req.user.id))));
campaignsRouter.delete("/:campaignId/members/:userId", wrap<AuthedRequest>(async (req, res) => {
  await campaigns.removeMember(pid(req), req.user.id, pid(req, "userId"));
  res.json({ ok: true });
}));

campaignsRouter.get("/:campaignId/characters", wrap<AuthedRequest>(async (req, res) => res.json(await listCampaignCharacters(pid(req), req.user.id))));

campaignsRouter.get("/:campaignId/events", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  const limit = Number(req.query.limit ?? 50);
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  res.json(await listEvents(pid(req), { userId: req.user.id, isDm: m.isDm }, { limit, before, characterId }));
}));

campaignsRouter.get("/:campaignId/rolls", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await listRolls(pid(req), { userId: req.user.id, isDm: m.isDm }, Number(req.query.limit ?? 50)));
}));
campaignsRouter.post("/:campaignId/rolls", wrap<AuthedRequest>(async (req, res) => {
  res.status(201).json(await performRoll(pid(req), req.user.id, parseBody(RollRequestSchema, req.body)));
}));

campaignsRouter.get("/:campaignId/overrides", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await listOverrides(pid(req), req.query.all === "1"));
}));

campaignsRouter.get("/:campaignId/session", wrap<AuthedRequest>(async (req, res) => {
  await requireMember(pid(req), req.user.id);
  res.json(await campaigns.getActiveSession(pid(req)));
}));
campaignsRouter.post("/:campaignId/session/start", wrap<AuthedRequest>(async (req, res) => res.json(await campaigns.startSession(pid(req), req.user.id))));
campaignsRouter.post("/:campaignId/session/end", wrap<AuthedRequest>(async (req, res) => {
  await campaigns.endSession(pid(req), req.user.id);
  res.json({ ok: true });
}));
