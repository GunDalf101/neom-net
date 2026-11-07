import { AssignCharacterSchema, ApplyConditionSchema, CreateCharacterSchema, HpActionSchema, ItemActionSchema, SetPortraitSchema, ShareLinkSchema, UnlockNodeSchema, UpdateCharacterSchema } from "@neom/shared";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { prisma } from "../db.js";
import { forbidden, notFound, wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { requireCharacterAccess, requireCharacterEdit } from "../services/access.js";
import * as characters from "../services/characters.js";
import { performItemAction } from "../services/items.js";
import { unlockNode, useAbility } from "../services/progression.js";
import { emitCharacterUpdated } from "../realtime/io.js";
import { logEvent } from "../services/events.js";

export const charactersRouter = Router();
charactersRouter.use(requireAuth);

const cid = (req: AuthedRequest) => req.params.characterId as string;
const actor = (req: AuthedRequest, isDm: boolean) => ({ userId: req.user.id, isDm });

charactersRouter.post("/", wrap<AuthedRequest>(async (req, res) => res.status(201).json(await characters.createCharacter(req.user.id, parseBody(CreateCharacterSchema, req.body)))));
charactersRouter.get("/:characterId", wrap<AuthedRequest>(async (req, res) => res.json(await characters.getView(cid(req), req.user.id))));
charactersRouter.patch("/:characterId", wrap<AuthedRequest>(async (req, res) => res.json(await characters.updateCharacter(cid(req), req.user.id, parseBody(UpdateCharacterSchema, req.body)))));
charactersRouter.delete("/:characterId", wrap<AuthedRequest>(async (req, res) => {
  await characters.deleteCharacter(cid(req), req.user.id);
  res.json({ ok: true });
}));

charactersRouter.post("/:characterId/hp", wrap<AuthedRequest>(async (req, res) => {
  const { membership } = await requireCharacterEdit(cid(req), req.user.id);
  res.json(await characters.applyHpAction(cid(req), actor(req, membership.isDm), parseBody(HpActionSchema, req.body)));
}));

charactersRouter.post("/:characterId/conditions", wrap<AuthedRequest>(async (req, res) => {
  const { membership } = await requireCharacterEdit(cid(req), req.user.id);
  res.json(await characters.applyCondition(cid(req), actor(req, membership.isDm), parseBody(ApplyConditionSchema, req.body)));
}));
charactersRouter.delete("/:characterId/conditions/:conditionId", wrap<AuthedRequest>(async (req, res) => {
  const { membership } = await requireCharacterEdit(cid(req), req.user.id);
  res.json(await characters.removeCondition(cid(req), actor(req, membership.isDm), req.params.conditionId as string));
}));

charactersRouter.post("/:characterId/items/:itemId/action", wrap<AuthedRequest>(async (req, res) => {
  // Access only: the item service decides per action (players may manage their own gear even in DM-controlled mode).
  const { membership } = await requireCharacterAccess(cid(req), req.user.id);
  res.json(await performItemAction(cid(req), actor(req, membership.isDm), req.params.itemId as string, parseBody(ItemActionSchema, req.body)));
}));

charactersRouter.delete("/:characterId/effects/:effectId", wrap<AuthedRequest>(async (req, res) => {
  const { membership } = await requireCharacterAccess(cid(req), req.user.id);
  if (!membership.isDm) throw forbidden("Only the DM can clear active effects");
  const eff = await prisma.activeEffect.findFirst({ where: { id: req.params.effectId as string, characterId: cid(req) } });
  if (!eff) throw notFound("Effect");
  await characters.expireActiveEffect(eff.id, "cleared by the DM");
  res.json(await characters.getView(cid(req), req.user.id));
}));

charactersRouter.post("/:characterId/unlock", wrap<AuthedRequest>(async (req, res) => {
  const { membership } = await requireCharacterEdit(cid(req), req.user.id);
  res.json(await unlockNode(cid(req), actor(req, membership.isDm), parseBody(UnlockNodeSchema, req.body).nodeId));
}));
charactersRouter.post("/:characterId/abilities/:abilityId/use", wrap<AuthedRequest>(async (req, res) => {
  const { membership } = await requireCharacterEdit(cid(req), req.user.id);
  res.json(await useAbility(cid(req), actor(req, membership.isDm), req.params.abilityId as string));
}));

charactersRouter.post("/:characterId/assign", wrap<AuthedRequest>(async (req, res) => {
  const body = parseBody(AssignCharacterSchema, req.body);
  res.json(await characters.assignCharacter(cid(req), req.user.id, body.userId));
}));
charactersRouter.put("/:characterId/portrait", wrap<AuthedRequest>(async (req, res) => res.json(await characters.setPortrait(cid(req), req.user.id, parseBody(SetPortraitSchema, req.body).portraitUrl))));
charactersRouter.post("/:characterId/share", wrap<AuthedRequest>(async (req, res) => res.json(await characters.createShareLink(cid(req), req.user.id, parseBody(ShareLinkSchema, req.body).rotate))));
charactersRouter.delete("/:characterId/share", wrap<AuthedRequest>(async (req, res) => res.json(await characters.revokeShareLink(cid(req), req.user.id))));
charactersRouter.get("/:characterId/export", wrap<AuthedRequest>(async (req, res) => res.json(await characters.exportCharacter(cid(req), req.user.id))));
charactersRouter.post("/:characterId/import", wrap<AuthedRequest>(async (req, res) => {
  const body = parseBody(z.object({ format: z.literal("neom-net/character"), version: z.literal(1), character: z.record(z.unknown()) }), req.body);
  res.json(await characters.importCharacter(cid(req), req.user.id, body.character));
}));
charactersRouter.post("/:characterId/reset", wrap<AuthedRequest>(async (req, res) => {
  parseBody(z.object({ confirm: z.literal(true) }), req.body);
  res.json(await characters.resetCharacter(cid(req), req.user.id));
}));

/** Player-side note on the sheet, e.g. "Touch" button to bump version and resync everyone (debug/support). */
charactersRouter.post("/:characterId/resync", wrap<AuthedRequest>(async (req, res) => {
  const { character } = await requireCharacterAccess(cid(req), req.user.id);
  emitCharacterUpdated(character.campaignId, character.id);
  await logEvent({ campaignId: character.campaignId, type: "character.resync", actorUserId: req.user.id, characterId: character.id, summary: `${character.name} resynced`, visibility: "dm" });
  res.json({ ok: true });
}));
