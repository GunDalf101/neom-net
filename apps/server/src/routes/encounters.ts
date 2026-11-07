import { AddParticipantSchema, CreateEncounterSchema, EncounterActionSchema } from "@neom/shared";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as encounters from "../services/encounters.js";

export const encountersRouter = Router();
encountersRouter.use(requireAuth);
const pid = (req: AuthedRequest) => req.params.campaignId as string;
const eid = (req: AuthedRequest) => req.params.encounterId as string;

encountersRouter.get("/:campaignId/encounters", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await encounters.listEncounters(pid(req), m.isDm));
}));
encountersRouter.post("/:campaignId/encounters", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await encounters.createEncounter(pid(req), req.user.id, parseBody(CreateEncounterSchema, req.body)));
}));
encountersRouter.get("/:campaignId/encounters/:encounterId", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await encounters.getEncounter(pid(req), eid(req), m.isDm));
}));
encountersRouter.delete("/:campaignId/encounters/:encounterId", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await encounters.deleteEncounter(pid(req), eid(req));
  res.json({ ok: true });
}));
encountersRouter.post("/:campaignId/encounters/:encounterId/participants", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await encounters.addParticipant(pid(req), req.user.id, eid(req), parseBody(AddParticipantSchema, req.body)));
}));
encountersRouter.post("/:campaignId/encounters/:encounterId/action", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await encounters.encounterAction(pid(req), req.user.id, eid(req), parseBody(EncounterActionSchema, req.body)));
}));
