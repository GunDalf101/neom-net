import { PlanDefinitionInputSchema, PlanSubscribeSchema, ShopBuySchema } from "@neom/shared";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireDm, requireMember } from "../services/access.js";
import * as plans from "../services/plans.js";
import * as shop from "../services/shop.js";

export const shopRouter = Router();
shopRouter.use(requireAuth);
const pid = (req: AuthedRequest) => req.params.campaignId as string;
const id = (req: AuthedRequest) => req.params.id as string;
const viewer = (req: AuthedRequest, isDm: boolean) => ({ userId: req.user.id, isDm });

// Shop
shopRouter.get("/:campaignId/shop", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await shop.getShop(pid(req), viewer(req, m.isDm)));
}));
shopRouter.post("/:campaignId/shop/buy", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await shop.buy(pid(req), viewer(req, m.isDm), parseBody(ShopBuySchema, req.body)));
}));
shopRouter.post("/:campaignId/shop/import", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await shop.importCatalogInto(pid(req), req.user.id));
}));

// Plans
shopRouter.get("/:campaignId/plans", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await plans.listPlans(pid(req), m.isDm));
}));
shopRouter.post("/:campaignId/plans", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.status(201).json(await plans.createPlan(pid(req), parseBody(PlanDefinitionInputSchema, req.body)));
}));
shopRouter.put("/:campaignId/plans/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await plans.updatePlan(pid(req), id(req), parseBody(PlanDefinitionInputSchema, req.body)));
}));
shopRouter.delete("/:campaignId/plans/:id", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  await plans.deletePlan(pid(req), id(req));
  res.json({ ok: true });
}));
shopRouter.post("/:campaignId/plans/subscribe", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await plans.subscribe(pid(req), viewer(req, m.isDm), parseBody(PlanSubscribeSchema, req.body)));
}));
shopRouter.post("/:campaignId/plans/unsubscribe", wrap<AuthedRequest>(async (req, res) => {
  const m = await requireMember(pid(req), req.user.id);
  res.json(await plans.unsubscribe(pid(req), viewer(req, m.isDm), parseBody(PlanSubscribeSchema, req.body)));
}));
shopRouter.get("/:campaignId/plans/bill", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await plans.previewMonth(pid(req)));
}));
shopRouter.post("/:campaignId/plans/bill", wrap<AuthedRequest>(async (req, res) => {
  await requireDm(pid(req), req.user.id);
  res.json(await plans.billMonth(pid(req), req.user.id));
}));
