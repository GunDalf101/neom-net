import {
  unmetRequirements,
  ATTRIBUTES,
  SPECIAL_SKILLS,
  type AbilityDto,
  type AbilityInput,
  type AttributeKey,
  type AugmentationSlot,
  type CharacterView,
  type InstantEffect,
  type Requirement,
  type SkillTreeDto,
  type SkillTreeInput,
  type SpecialSkillKey,
} from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { campaignSettings, getMembership } from "./access.js";
import { buildView, derive, loadFull, type Actor } from "./characters.js";
import { logEvent } from "./events.js";
import { toAbilityDto, toSkillTreeDto } from "./mappers.js";
import { applyInstantEffects, dispatchTrigger } from "./rules.js";

// ---------- Skill trees ----------

export async function listSkillTrees(campaignId: string): Promise<SkillTreeDto[]> {
  const rows = await prisma.skillTreeDefinition.findMany({ where: { campaignId }, include: { nodes: true }, orderBy: { branch: "asc" } });
  return rows.map(toSkillTreeDto);
}

export async function upsertSkillTree(campaignId: string, input: SkillTreeInput): Promise<SkillTreeDto> {
  const keys = new Set(input.nodes.map((n) => n.key));
  if (keys.size !== input.nodes.length) throw ruleViolation("Node keys must be unique within a tree");
  for (const n of input.nodes) {
    for (const p of n.parentKeys) if (!keys.has(p)) throw ruleViolation(`Node ${n.key} references unknown parent ${p}`);
  }
  const tree = await prisma.$transaction(async (tx) => {
    const t = await tx.skillTreeDefinition.upsert({
      where: { campaignId_branch: { campaignId, branch: input.branch } },
      create: { campaignId, branch: input.branch, name: input.name, description: input.description },
      update: { name: input.name, description: input.description },
    });
    await tx.skillTreeNode.deleteMany({ where: { treeId: t.id, key: { notIn: [...keys] } } });
    for (const n of input.nodes) {
      const data = {
        name: n.name,
        description: n.description,
        icon: n.icon,
        maxRank: n.maxRank,
        cost: n.cost,
        parentKeys: n.parentKeys,
        requirements: n.requirements as unknown as Prisma.InputJsonValue,
        effects: n.effects as unknown as Prisma.InputJsonValue,
        ruleIds: n.ruleIds,
        position: n.position,
        tier: n.tier,
      };
      await tx.skillTreeNode.upsert({ where: { treeId_key: { treeId: t.id, key: n.key } }, create: { treeId: t.id, key: n.key, ...data }, update: data });
    }
    return tx.skillTreeDefinition.findUniqueOrThrow({ where: { id: t.id }, include: { nodes: true } });
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "skillTrees" });
  const chars = await prisma.character.findMany({ where: { campaignId }, select: { id: true } });
  for (const c of chars) emitCharacterUpdated(campaignId, c.id);
  return toSkillTreeDto(tree);
}

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

export async function unlockNode(characterId: string, actor: Actor, nodeId: string): Promise<CharacterView> {
  const { full, isDm } = await resolveActor(characterId, actor);
  const node = await prisma.skillTreeNode.findUnique({ where: { id: nodeId }, include: { tree: true } });
  if (!node || node.tree.campaignId !== full.campaignId) throw notFound("Skill node");
  const current = full.unlocks.find((u) => u.nodeId === nodeId)?.rank ?? 0;
  if (current >= node.maxRank) throw ruleViolation(`${node.name} is already at max rank`);
  const parentKeys = (node.parentKeys as string[]) ?? [];
  const unlockedKeys = new Set(full.unlocks.filter((u) => u.node.treeId === node.treeId).map((u) => u.node.key));
  const missingParents = parentKeys.filter((k) => !unlockedKeys.has(k));
  if (missingParents.length) throw ruleViolation(`Requires ${missingParents.join(", ")} first`, { missingParents });

  const derived = derive(full);
  const attributes = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES) attributes[a] = derived.attributes[a].value;
  const specialRanks = {} as Record<SpecialSkillKey, number>;
  for (const s of SPECIAL_SKILLS) specialRanks[s] = derived.specialSkills[s].rank;
  const unmet = unmetRequirements((node.requirements as unknown as Requirement[]) ?? [], {
    level: full.level,
    attributes,
    specialRanks,
    unlockedNodes: full.unlocks.map((u) => ({ key: u.node.key, rank: u.rank })),
    augmentations: full.items.filter((i) => i.installedSlot).map((i) => ({ slot: i.installedSlot as AugmentationSlot, definitionId: i.definitionId })),
  });
  if (unmet.length && !isDm) throw ruleViolation(`Requirements not met: ${unmet.join(", ")}`, { unmet });
  if (full.progressionPoints < node.cost && !isDm) throw ruleViolation(`Needs ${node.cost} progression points (you have ${full.progressionPoints})`);

  await prisma.$transaction(async (tx) => {
    // Guard against double-spend: only decrement if points are still sufficient.
    const res = await tx.character.updateMany({
      where: { id: characterId, progressionPoints: { gte: isDm ? 0 : node.cost } },
      data: { progressionPoints: { decrement: Math.min(node.cost, full.progressionPoints) }, version: { increment: 1 } },
    });
    if (res.count === 0) throw ruleViolation("Not enough progression points");
    await tx.characterUnlock.upsert({
      where: { characterId_nodeId: { characterId, nodeId } },
      create: { characterId, nodeId, rank: 1 },
      update: { rank: { increment: 1 } },
    });
  });
  await logEvent({
    campaignId: full.campaignId,
    type: "progression.unlock",
    actorUserId: actor.userId,
    characterId,
    summary: `${full.name} unlocked ${node.name}${node.maxRank > 1 ? ` (rank ${current + 1})` : ""} for ${node.cost} point(s)`,
    payload: { nodeId, rank: current + 1, cost: node.cost },
  });
  emitCharacterUpdated(full.campaignId, characterId);
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
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
 * Uses an ability the character has been granted (via a grantAbility effect).
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
    if (!full.inspiration) throw ruleViolation("No inspiration to spend");
    data.inspiration = false;
  }
  await prisma.character.update({ where: { id: characterId }, data });
  await logEvent({ campaignId: full.campaignId, type: "ability.used", actorUserId: actor.userId, characterId, summary: `${full.name} activated ${ability.name}`, payload: { abilityId } });
  emitCharacterUpdated(full.campaignId, characterId);
  await applyInstantEffects(characterId, (ability.effects as unknown as InstantEffect[]) ?? [], { sourceLabel: ability.name, depth: 1, actorUserId: actor.userId });
  await dispatchTrigger(characterId, { type: "abilityActivated", abilityId }, { actorUserId: actor.userId, depth: 1 });
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
}
