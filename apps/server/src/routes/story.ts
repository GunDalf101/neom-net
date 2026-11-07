import { JournalInputSchema, MissionInputSchema, NpcInputSchema } from "@neom/shared";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as story from "../services/story.js";

export const storyRouter = Router();
storyRouter.use(requireAuth);
const pid = (req: AuthedRequest) => req.params.campaignId as string;
const id = (req: AuthedRequest) => req.params.id as string;

// NPCs
storyRouter.get("/:campaignId/npcs", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await story.listNpcs(pid(req), m.isDm));
}));
storyRouter.post("/:campaignId/npcs", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await story.createNpc(pid(req), parseBody(NpcInputSchema, req.body)));
}));
storyRouter.put("/:campaignId/npcs/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await story.updateNpc(pid(req), id(req), parseBody(NpcInputSchema, req.body)));
}));
storyRouter.delete("/:campaignId/npcs/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await story.deleteNpc(pid(req), id(req));
  res.json({ ok: true });
}));

// Missions
storyRouter.get("/:campaignId/missions", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await story.listMissions(pid(req), { userId: req.user.id, isDm: m.isDm }));
}));
storyRouter.post("/:campaignId/missions", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await story.createMission(pid(req), req.user.id, parseBody(MissionInputSchema, req.body)));
}));
storyRouter.put("/:campaignId/missions/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await story.updateMission(pid(req), req.user.id, id(req), parseBody(MissionInputSchema, req.body)));
}));
storyRouter.delete("/:campaignId/missions/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await story.deleteMission(pid(req), id(req));
  res.json({ ok: true });
}));
storyRouter.post("/:campaignId/missions/:id/objectives/:objectiveId", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  const { done } = parseBody(z.object({ done: z.boolean() }), req.body);
  res.json(await story.toggleObjective(pid(req), req.user.id, m.isDm, id(req), req.params.objectiveId as string, done));
}));
storyRouter.post("/:campaignId/missions/:id/complete", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await story.completeMission(pid(req), req.user.id, id(req)));
}));

// Journal
storyRouter.get("/:campaignId/journal", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await story.listJournal(pid(req), { userId: req.user.id, isDm: m.isDm }));
}));
storyRouter.post("/:campaignId/journal", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.status(201).json(await story.createJournal(pid(req), req.user.id, m.isDm, parseBody(JournalInputSchema, req.body)));
}));
storyRouter.put("/:campaignId/journal/:id", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await story.updateJournal(pid(req), req.user.id, m.isDm, id(req), parseBody(JournalInputSchema, req.body)));
}));
storyRouter.delete("/:campaignId/journal/:id", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  await story.deleteJournal(pid(req), req.user.id, m.isDm, id(req));
  res.json({ ok: true });
}));
