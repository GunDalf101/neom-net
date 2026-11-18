import { type AbilityDto, type AbilityInput, type CharacterView, type InstantEffect } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { campaignSettings, getMembership } from "./access.js";
import { buildView, derive, loadFull, type Actor } from "./characters.js";
import { logEvent } from "./events.js";
import { toAbilityDto } from "./mappers.js";
import { applyInstantEffects, dispatchTrigger } from "./rules.js";

async function resolveActor(characterId: string, actor: Actor) {
  const full = await loadFull(characterId);
  let isDm = true;
  if (actor.userId) {
    const m = await getMembership(full.campaignId, actor.userId);
    if (!m) throw forbidden();
    isDm = m.isDm;
    if (!isDm && full.ownerUserId !== actor.userId) throw forbidden("Not your character");
    if (!isDm && campaignSettings(full.campaign).playersReadOnly) throw forbidden("This campaign is DM-controlled: only the Dungeon Master can change characters");
  }
  return { full, isDm };
}

// ---------- Abilities ----------

export async function listAbilities(campaignId: string): Promise<AbilityDto[]> {
  const rows = await prisma.abilityDefinition.findMany({ where: { campaignId }, orderBy: { name: "asc" } });
  return rows.map(toAbilityDto);
}

function abilityData(input: AbilityInput) {
  return {
    name: input.name,
    description: input.description,
    icon: input.icon,
    actionType: input.actionType,
    cost: input.cost,
    usesPer: input.usesPer,
    maxUses: input.maxUses,
    effects: input.effects as unknown as Prisma.InputJsonValue,
    passiveEffects: input.passiveEffects as unknown as Prisma.InputJsonValue,
    ruleIds: input.ruleIds,
  };
}

export async function createAbility(campaignId: string, input: AbilityInput): Promise<AbilityDto> {
  const row = await prisma.abilityDefinition.create({ data: { campaignId, ...abilityData(input) } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "abilities" });
  return toAbilityDto(row);
}

export async function updateAbility(campaignId: string, id: string, input: AbilityInput): Promise<AbilityDto> {
  const existing = await prisma.abilityDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Ability");
  const row = await prisma.abilityDefinition.update({ where: { id }, data: abilityData(input) });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "abilities" });
  return toAbilityDto(row);
}

export async function deleteAbility(campaignId: string, id: string): Promise<void> {
  const existing = await prisma.abilityDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Ability");
  await prisma.abilityDefinition.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "abilities" });
}

/**
 * Uses an ability the character has been granted (directly by the DM or via a grantAbility effect).
 * Pays the cost, applies the ability's instant effects, and fires the abilityActivated trigger.
 * Per-encounter use limits are not yet enforced server-side (see docs/ARCHITECTURE.md).
 */
export async function useAbility(characterId: string, actor: Actor, abilityId: string): Promise<CharacterView> {
  const { full, isDm } = await resolveActor(characterId, actor);
  const derived = derive(full);
  if (!derived.grantedAbilityIds.includes(abilityId) && !isDm) throw ruleViolation("This character does not have that ability");
  const ability = await prisma.abilityDefinition.findFirst({ where: { id: abilityId, campaignId: full.campaignId } });
  if (!ability) throw notFound("Ability");
  const cost = (ability.cost as { resource: string; amount: number } | null) ?? { resource: "none", amount: 0 };
  const data: Prisma.CharacterUpdateInput = { version: { increment: 1 } };
  if (cost.resource === "progressionPoints") {
    if (full.progressionPoints < cost.amount) throw ruleViolation("Not enough progression points");
    data.progressionPoints = { decrement: cost.amount };
  } else if (cost.resource === "credits") {
    if (full.credits < cost.amount) throw ruleViolation("Not enough credits");
    data.credits = { decrement: cost.amount };
  } else if (cost.resource === "hitDice") {
    if (full.level - full.hitDiceUsed < cost.amount) throw ruleViolation("Not enough hit dice");
    data.hitDiceUsed = { increment: cost.amount };
  } else if (cost.resource === "inspiration") {
    if (full.inspiration < cost.amount) throw ruleViolation(cost.amount > 1 ? `Needs ${cost.amount} inspiration (you have ${full.inspiration})` : "No inspiration to spend");
    data.inspiration = { decrement: cost.amount };
  }
  await prisma.character.update({ where: { id: characterId }, data });
  await logEvent({ campaignId: full.campaignId, type: "ability.used", actorUserId: actor.userId, characterId, summary: `${full.name} activated ${ability.name}`, payload: { abilityId } });
  emitCharacterUpdated(full.campaignId, characterId);
  await applyInstantEffects(characterId, (ability.effects as unknown as InstantEffect[]) ?? [], { sourceLabel: ability.name, depth: 1, actorUserId: actor.userId });
  await dispatchTrigger(characterId, { type: "abilityActivated", abilityId }, { actorUserId: actor.userId, depth: 1 });
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
}
