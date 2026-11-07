import { PendingActionResolveSchema, RuleDefinitionInputSchema, SimulateRuleSchema, TriggerRuleSchema } from "@neom/shared";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as rules from "../services/rules.js";

export const rulesRouter = Router();
rulesRouter.use(requireAuth);
const pid = (req: AuthedRequest) => req.params.campaignId as string;
const rid = (req: AuthedRequest) => req.params.ruleId as string;

rulesRouter.get("/:campaignId/rules", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await rules.listRules(pid(req)));
}));
rulesRouter.post("/:campaignId/rules", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await rules.createRule(pid(req), parseBody(RuleDefinitionInputSchema, req.body)));
}));
rulesRouter.put("/:campaignId/rules/:ruleId", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await rules.updateRule(pid(req), rid(req), parseBody(RuleDefinitionInputSchema.partial(), req.body)));
}));
rulesRouter.delete("/:campaignId/rules/:ruleId", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await rules.deleteRule(pid(req), rid(req));
  res.json({ ok: true });
}));
rulesRouter.post("/:campaignId/rules/:ruleId/publish", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  const { note } = parseBody(z.object({ note: z.string().max(200).optional() }), req.body ?? {});
  res.json(await rules.publishRule(pid(req), rid(req), note));
}));
rulesRouter.post("/:campaignId/rules/:ruleId/duplicate", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await rules.duplicateRule(pid(req), rid(req)));
}));
rulesRouter.get("/:campaignId/rules/:ruleId/versions", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await rules.listRuleVersions(pid(req), rid(req)));
}));
rulesRouter.post("/:campaignId/rules/:ruleId/versions/:version/restore", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await rules.restoreRuleVersion(pid(req), rid(req), Number(req.params.version)));
}));
rulesRouter.post("/:campaignId/rules/simulate", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await rules.simulateRule(pid(req), parseBody(SimulateRuleSchema, req.body)));
}));
rulesRouter.post("/:campaignId/rules/trigger", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  const input = parseBody(TriggerRuleSchema, req.body);
  res.json(await rules.triggerRuleManually(pid(req), req.user.id, input.characterId, input.ruleId));
}));

rulesRouter.get("/:campaignId/traces", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await rules.listTraces(pid(req), { userId: req.user.id, isDm: m.isDm }, Number(req.query.limit ?? 50)));
}));
rulesRouter.get("/:campaignId/pending", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await rules.listPending(pid(req)));
}));
rulesRouter.post("/:campaignId/pending/:pendingId/resolve", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  const input = parseBody(PendingActionResolveSchema, req.body);
  res.json(await rules.resolvePending(pid(req), req.params.pendingId as string, req.user.id, input.decision, input.modifiedActions, input.note));
}));
