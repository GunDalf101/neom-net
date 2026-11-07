import { AbilityInputSchema, ConditionDefinitionInputSchema, GrantItemSchema, ItemDefinitionInputSchema, SkillTreeInputSchema } from "@neom/shared";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as conditions from "../services/conditions.js";
import * as items from "../services/items.js";
import * as progression from "../services/progression.js";

export const contentRouter = Router();
contentRouter.use(requireAuth);
const pid = (req: AuthedRequest) => req.params.campaignId as string;
const id = (req: AuthedRequest) => req.params.id as string;

// Items
contentRouter.get("/:campaignId/items", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await items.listItemDefinitions(pid(req), m.isDm));
}));
contentRouter.post("/:campaignId/items", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await items.createItemDefinition(pid(req), parseBody(ItemDefinitionInputSchema, req.body)));
}));
contentRouter.put("/:campaignId/items/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await items.updateItemDefinition(pid(req), id(req), parseBody(ItemDefinitionInputSchema, req.body)));
}));
contentRouter.delete("/:campaignId/items/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await items.deleteItemDefinition(pid(req), id(req));
  res.json({ ok: true });
}));
contentRouter.post("/:campaignId/items/grant", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await items.grantItem(pid(req), req.user.id, parseBody(GrantItemSchema, req.body)));
}));

// Conditions
contentRouter.get("/:campaignId/conditions", wrap<AuthedRequest>(async (req, res) => {
  await requireMember(pid(req), req.user.id);
  res.json(await conditions.listConditionDefinitions(pid(req)));
}));
contentRouter.post("/:campaignId/conditions", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await conditions.createConditionDefinition(pid(req), parseBody(ConditionDefinitionInputSchema, req.body)));
}));
contentRouter.put("/:campaignId/conditions/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await conditions.updateConditionDefinition(pid(req), id(req), parseBody(ConditionDefinitionInputSchema, req.body)));
}));
contentRouter.delete("/:campaignId/conditions/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await conditions.deleteConditionDefinition(pid(req), id(req));
  res.json({ ok: true });
}));

// Skill trees
contentRouter.get("/:campaignId/skill-trees", wrap<AuthedRequest>(async (req, res) => {
  await requireMember(pid(req), req.user.id);
  res.json(await progression.listSkillTrees(pid(req)));
}));
contentRouter.put("/:campaignId/skill-trees", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await progression.upsertSkillTree(pid(req), parseBody(SkillTreeInputSchema, req.body)));
}));

// Abilities
contentRouter.get("/:campaignId/abilities", wrap<AuthedRequest>(async (req, res) => {
  await requireMember(pid(req), req.user.id);
  res.json(await progression.listAbilities(pid(req)));
}));
contentRouter.post("/:campaignId/abilities", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await progression.createAbility(pid(req), parseBody(AbilityInputSchema, req.body)));
}));
contentRouter.put("/:campaignId/abilities/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await progression.updateAbility(pid(req), id(req), parseBody(AbilityInputSchema, req.body)));
}));
contentRouter.delete("/:campaignId/abilities/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await progression.deleteAbility(pid(req), id(req));
  res.json({ ok: true });
}));
