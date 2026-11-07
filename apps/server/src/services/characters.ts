import {
  ATTRIBUTES,
  abilityModifier,
  applyDamage,
  computeDerivedStats,
  hitDieForClass,
  SKILLS,
  SPECIAL_SKILLS,
  UpdateCharacterSchema,
  roll,
  type AbilityDto,
  type ApplyConditionInput,
  type CharacterSnapshot,
  type CharacterSummaryDto,
  type CharacterView,
  type CreateCharacterInput,
  type DerivedStats,
  type EffectSource,
  type HpAction,
  type PassiveEffect,
  type RuleCharacterState,
  type UpdateCharacterInput,
  type AugmentationSlot,
  type AttributeKey,
  type SpecialSkillKey,
  type SkillKey,
  type ProficiencyMultiplier,
  type SheetChange,
  type SharedSheetDto,
} from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma, type Db } from "../db.js";
import { badRequest, conflict, forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToUser } from "../realtime/io.js";
import { campaignSettings, getMembership, requireCharacterAccess, requireCharacterEdit, requireMember } from "./access.js";
import { findConditionDefinition } from "./conditions.js";
import { logEvent } from "./events.js";
import {
  toAbilityDto,
  toActiveEffectDto,
  toCharacterConditionDto,
  toCharacterCore,
  toItemInstanceDto,
  toOverrideDto,
} from "./mappers.js";
import { dispatchTrigger, applyInstantEffects } from "./rules.js";

export interface Actor {
  userId: string | null;
  isDm: boolean;
}
export const SYSTEM_ACTOR: Actor = { userId: null, isDm: true };

export const fullInclude = {
  owner: { select: { username: true } },
  campaign: true,
  items: { include: { definition: true }, orderBy: { createdAt: "asc" } },
  conditions: { include: { definition: true }, orderBy: { appliedAt: "asc" } },
  activeEffects: { orderBy: { createdAt: "asc" } },
  overrides: { where: { active: true }, include: { createdBy: { select: { username: true } } } },
  unlocks: { include: { node: true } },
} satisfies Prisma.CharacterInclude;

export type FullCharacter = Prisma.CharacterGetPayload<{ include: typeof fullInclude }>;

export async function loadFull(characterId: string, db: Db = prisma): Promise<FullCharacter> {
  const c = await db.character.findUnique({ where: { id: characterId }, include: fullInclude });
  if (!c) throw notFound("Character");
  return c;
}

// ---------- Snapshot & derived ----------

export function buildSnapshot(full: FullCharacter): CharacterSnapshot {
  const settings = campaignSettings(full.campaign);
  const sources: EffectSource[] = [];

  for (const item of full.items) {
    const def = item.definition;
    const effects = [
      ...((def.effects as unknown as PassiveEffect[]) ?? []),
      ...((item.customEffects as unknown as PassiveEffect[] | null) ?? []),
    ];
    const name = item.customName ?? def.name;
    if (item.installedSlot) {
      sources.push({
        id: item.id,
        kind: "augmentation",
        name,
        active: item.status === "installed",
        effects,
        capacityCost: def.capacityCost,
        occupiesCapacity: true,
      });
    } else if (item.equippedSlot || item.status === "equipped") {
      sources.push({ id: item.id, kind: "item", name, active: true, effects });
    }
  }
  for (const cond of full.conditions) {
    sources.push({
      id: cond.id,
      kind: "condition",
      name: cond.definition.name,
      active: true,
      effects: (cond.definition.effects as unknown as PassiveEffect[]) ?? [],
    });
  }
  for (const eff of full.activeEffects) {
    sources.push({ id: eff.id, kind: "temporary", name: eff.label, active: true, effects: (eff.effects as unknown as PassiveEffect[]) ?? [] });
  }
  for (const unlock of full.unlocks) {
    const effects = (unlock.node.effects as unknown as PassiveEffect[]) ?? [];
    // Each rank grants the node's effects again (ranked nodes stack).
    for (let r = 1; r <= unlock.rank; r++) {
      sources.push({
        id: `${unlock.id}:${r}`,
        kind: "skillNode",
        name: unlock.rank > 1 ? `${unlock.node.name} (rank ${r})` : unlock.node.name,
        active: true,
        effects,
      });
    }
  }

  return {
    level: full.level,
    attributes: full.attributes as unknown as Record<AttributeKey, number>,
    saveProficiencies: full.saveProficiencies as unknown as Record<AttributeKey, boolean>,
    skills: full.skills as unknown as Record<SkillKey, ProficiencyMultiplier>,
    specialSkills: full.specialSkills as unknown as Record<SpecialSkillKey, { rank: number; proficiency: ProficiencyMultiplier }>,
    hpMaxBase: full.hpMaxBase,
    baseSpeed: full.baseSpeed ?? undefined,
    acBase: full.acBase,
    acBonus: full.acBonus,
    sources,
    overrides: full.overrides.map((o) => ({ id: o.id, target: o.target, value: o.value, reason: o.reason })),
    settings,
  };
}

export function derive(full: FullCharacter): DerivedStats {
  return computeDerivedStats(buildSnapshot(full));
}

export function buildRuleState(full: FullCharacter, derived: DerivedStats): RuleCharacterState {
  const attributes = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES) attributes[a] = derived.attributes[a].value;
  const specialRanks = {} as Record<SpecialSkillKey, number>;
  for (const s of SPECIAL_SKILLS) specialRanks[s] = derived.specialSkills[s].rank;
  return {
    hpCurrent: full.hpCurrent,
    hpMax: derived.maxHp.value,
    hpTemp: full.hpTemp,
    attributes,
    specialRanks,
    equippedDefinitionIds: full.items.filter((i) => i.status === "equipped").map((i) => i.definitionId),
    augmentations: full.items
      .filter((i) => i.installedSlot)
      .map((i) => ({ slot: i.installedSlot as AugmentationSlot, definitionId: i.definitionId, active: i.status === "installed" })),
    conditions: full.conditions.map((c) => c.definition.key),
    resources: {
      hitDice: Math.max(0, full.level - full.hitDiceUsed),
      progressionPoints: full.progressionPoints,
      credits: full.credits,
      inspiration: full.inspiration ? 1 : 0,
    },
  };
}

export async function buildView(full: FullCharacter, viewer: { userId: string; isDm: boolean }): Promise<CharacterView> {
  const derived = derive(full);
  const settings = campaignSettings(full.campaign);
  const isOwner = full.ownerUserId === viewer.userId;
  const readOnly = !viewer.isDm && settings.playersReadOnly;
  const canEdit = viewer.isDm || (isOwner && !readOnly);
  const abilityIds = derived.grantedAbilityIds;
  const abilities: AbilityDto[] = abilityIds.length
    ? (await prisma.abilityDefinition.findMany({ where: { id: { in: abilityIds }, campaignId: full.campaignId } })).map(toAbilityDto)
    : [];
  return {
    character: toCharacterCore(full),
    ownerUsername: full.owner.username,
    derived,
    items: full.items.map(toItemInstanceDto),
    conditions: full.conditions.map(toCharacterConditionDto),
    activeEffects: full.activeEffects.map(toActiveEffectDto),
    overrides: viewer.isDm || isOwner ? full.overrides.map(toOverrideDto) : [],
    unlocks: full.unlocks.map((u) => ({ nodeId: u.nodeId, nodeKey: u.node.key, treeId: u.node.treeId, rank: u.rank })),
    abilities,
    shareToken: viewer.isDm || isOwner ? full.shareToken : null,
    permissions: {
      canEdit,
      canEditAttributes: viewer.isDm || (canEdit && settings.playersEditAttributes),
      canInstallCyberware: viewer.isDm || (canEdit && settings.playersInstallCyberware),
      canLevelUp: viewer.isDm || (canEdit && settings.playersLevelUp),
      canManageInventory: viewer.isDm || canEdit || (isOwner && settings.playersManageInventory),
      canChangePortrait: viewer.isDm || canEdit || (isOwner && settings.playersManagePortrait),
      canShare: viewer.isDm || isOwner,
      isDm: viewer.isDm,
      isOwner,
      readOnly,
    },
  };
}

export function toSummary(full: FullCharacter, derived = derive(full)): CharacterSummaryDto {
  return {
    id: full.id,
    campaignId: full.campaignId,
    ownerUserId: full.ownerUserId,
    ownerUsername: full.owner.username,
    name: full.name,
    species: full.species,
    characterClass: full.characterClass,
    level: full.level,
    portraitUrl: full.portraitUrl,
    hpCurrent: full.hpCurrent,
    hpMax: derived.maxHp.value,
    hpTemp: full.hpTemp,
    ac: derived.ac.value,
    conditions: full.conditions.map((c) => c.definition.name),
    capacityUsed: derived.capacityUsed,
    capacity: derived.capacity.value,
    overrideCount: full.overrides.length,
  };
}

export async function getView(characterId: string, userId: string): Promise<CharacterView> {
  const access = await requireCharacterAccess(characterId, userId);
  const full = await loadFull(characterId);
  return buildView(full, { userId, isDm: access.membership.isDm });
}

export async function listCampaignCharacters(campaignId: string, userId: string): Promise<CharacterSummaryDto[]> {
  await requireMember(campaignId, userId);
  const rows = await prisma.character.findMany({ where: { campaignId }, include: fullInclude, orderBy: { createdAt: "asc" } });
  return rows.map((r) => toSummary(r));
}

// ---------- Create / update / delete ----------

function defaultSheet(input: CreateCharacterInput) {
  const attributes = input.attributes ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const saveProficiencies = Object.fromEntries(ATTRIBUTES.map((a) => [a, false]));
  const skills = Object.fromEntries(SKILLS.map((s) => [s, 0]));
  const specialSkills = Object.fromEntries(SPECIAL_SKILLS.map((s) => [s, { rank: 0, proficiency: 0 }]));
  const hitDieSize = input.hitDieSize ?? hitDieForClass(input.characterClass);
  const hpMaxBase = input.hpMaxBase ?? Math.max(1, hitDieSize + abilityModifier(attributes.con));
  return { attributes, saveProficiencies, skills, specialSkills, hitDieSize, hpMaxBase };
}

export async function createCharacter(userId: string, input: CreateCharacterInput): Promise<CharacterView> {
  const membership = await requireMember(input.campaignId, userId);
  const sheet = defaultSheet(input);
  const created = await prisma.character.create({
    data: {
      campaignId: input.campaignId,
      ownerUserId: userId,
      name: input.name,
      species: input.species ?? "Human",
      characterClass: input.characterClass ?? "",
      subclass: input.subclass ?? "",
      level: input.level ?? 1,
      faction: input.faction ?? "",
      alignment: input.alignment ?? "",
      background: input.background ?? "",
      biography: input.biography ?? "",
      portraitUrl: input.portraitUrl ?? null,
      attributes: sheet.attributes,
      saveProficiencies: sheet.saveProficiencies,
      skills: sheet.skills,
      specialSkills: sheet.specialSkills,
      hitDieSize: sheet.hitDieSize,
      hpMaxBase: sheet.hpMaxBase,
      hpCurrent: sheet.hpMaxBase,
    },
  });
  await logEvent({
    campaignId: input.campaignId,
    type: "character.created",
    actorUserId: userId,
    characterId: created.id,
    summary: `${created.name} joined the roster`,
  });
  emitCharacterUpdated(input.campaignId, created.id);
  const full = await loadFull(created.id);
  return buildView(full, { userId, isDm: membership.isDm });
}

const SHEET_LABELS: Record<string, string> = {
  name: "name", species: "species", characterClass: "class", subclass: "subclass", faction: "faction", alignment: "alignment",
  background: "background", biography: "biography", portraitUrl: "portrait", level: "level", xp: "XP", hpMaxBase: "base max HP",
  baseSpeed: "base speed", hitDieSize: "hit die", inspiration: "inspiration", credits: "credits", progressionPoints: "points",
  acBase: "base AC", acBonus: "AC adjustment",
};

/** Field-level before/after list for the change log. Nested sheet maps (attributes, skills…) diff per key. */
function diffSheet(before: Prisma.CharacterGetPayload<Record<string, never>>, data: Prisma.CharacterUpdateInput): SheetChange[] {
  const out: SheetChange[] = [];
  const prev = before as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(data)) {
    if (k === "version") continue;
    if (k === "attributes" || k === "saveProficiencies" || k === "skills" || k === "specialSkills") {
      const a = (prev[k] ?? {}) as Record<string, unknown>;
      const b = (v ?? {}) as Record<string, unknown>;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.push({ field: `${k}.${key}`, from: a[key] ?? null, to: b[key] ?? null });
      }
      continue;
    }
    if (prev[k] !== v) out.push({ field: k, from: k === "portraitUrl" ? (prev[k] ? "(image)" : null) : prev[k] ?? null, to: k === "portraitUrl" ? (v ? "(image)" : null) : (v as unknown) ?? null });
  }
  return out;
}

function describeChanges(changes: SheetChange[]): string {
  if (changes.length === 0) return "no changes";
  const fmt = (v: unknown) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—"));
  const parts = changes.slice(0, 4).map((c) => `${SHEET_LABELS[c.field] ?? c.field} ${fmt(c.from)} → ${fmt(c.to)}`);
  return parts.join(", ") + (changes.length > 4 ? ` (+${changes.length - 4} more)` : "");
}

export async function updateCharacter(characterId: string, userId: string, input: UpdateCharacterInput): Promise<CharacterView> {
  const { character, membership, isOwner } = await requireCharacterEdit(characterId, userId);
  const settings = campaignSettings(character.campaign);
  const isDm = membership.isDm;

  const restricted: (keyof UpdateCharacterInput)[] = [];
  if (!isDm && !settings.playersEditAttributes) {
    for (const k of ["attributes", "hpMaxBase", "baseSpeed", "saveProficiencies", "skills", "specialSkills", "hitDieSize"] as const) {
      if (input[k] !== undefined) restricted.push(k);
    }
  }
  if (!isDm && !settings.playersLevelUp) {
    for (const k of ["level", "xp"] as const) if (input[k] !== undefined) restricted.push(k);
  }
  if (!isDm) {
    for (const k of ["credits", "progressionPoints", "acBase", "acBonus"] as const) if (input[k] !== undefined) restricted.push(k);
  }
  if (restricted.length) throw forbidden(`This campaign does not let players edit: ${restricted.join(", ")}`);
  if (!isOwner && !isDm) throw forbidden();

  const data: Prisma.CharacterUpdateInput = { version: { increment: 1 } };
  const simple = [
    "name", "species", "characterClass", "subclass", "faction", "alignment", "background", "biography", "portraitUrl",
    "level", "xp", "hpMaxBase", "baseSpeed", "hitDieSize", "inspiration", "credits", "progressionPoints", "acBase", "acBonus",
  ] as const;
  for (const k of simple) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  }
  if (input.attributes) data.attributes = input.attributes;
  if (input.saveProficiencies) {
    data.saveProficiencies = { ...(character.saveProficiencies as Record<string, boolean>), ...input.saveProficiencies };
  }
  if (input.skills) data.skills = { ...(character.skills as Record<string, number>), ...input.skills };
  if (input.specialSkills) {
    const merged = { ...(character.specialSkills as Record<string, { rank: number; proficiency: number }>) };
    for (const [k, v] of Object.entries(input.specialSkills)) {
      if (!v) continue;
      if (v.rank > settings.specialMaxRank) throw ruleViolation(`${k} rank cannot exceed ${settings.specialMaxRank} in this campaign`);
      merged[k] = v;
    }
    data.specialSkills = merged;
  }

  const where: Prisma.CharacterWhereUniqueInput = { id: characterId };
  if (input.expectedVersion !== undefined && input.expectedVersion !== character.version) {
    throw conflict("This character was changed by someone else. Reload and try again.", { currentVersion: character.version });
  }
  const changes = diffSheet(character, data);
  await prisma.character.update({ where, data });

  // Clamp current HP if the max went down.
  let full = await loadFull(characterId);
  const derived = derive(full);
  if (full.hpCurrent > derived.maxHp.value) {
    await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: derived.maxHp.value } });
    full = await loadFull(characterId);
  }
  await logEvent({
    campaignId: character.campaignId,
    type: "character.updated",
    actorUserId: userId,
    characterId,
    summary: `${full.name}'s sheet was updated: ${describeChanges(changes)}`,
    payload: { changes },
    visibility: "owner",
  });
  emitCharacterUpdated(character.campaignId, characterId);
  return buildView(full, { userId, isDm });
}

export async function deleteCharacter(characterId: string, userId: string): Promise<void> {
  const { character, membership, isOwner } = await requireCharacterAccess(characterId, userId);
  if (!isOwner && !membership.isDm) throw forbidden();
  await prisma.character.delete({ where: { id: characterId } });
  await logEvent({
    campaignId: character.campaignId,
    type: "character.deleted",
    actorUserId: userId,
    summary: `${character.name} was removed from the roster`,
  });
  emitCharacterUpdated(character.campaignId, characterId);
}

// ---------- HP ----------

export interface MutationContext {
  sourceLabel?: string;
  /** Recursion depth for rule-triggered effects. */
  depth?: number;
}

const MAX_RULE_DEPTH = 3;

async function resolveActor(characterId: string, actor: Actor) {
  const full = await loadFull(characterId);
  if (actor.userId) {
    const m = await getMembership(full.campaignId, actor.userId);
    if (!m) throw forbidden();
    if (!m.isDm && full.ownerUserId !== actor.userId) throw forbidden("You can only change your own character");
    if (!m.isDm && campaignSettings(full.campaign).playersReadOnly) throw forbidden("This campaign is DM-controlled: only the Dungeon Master can change characters");
    return { full, isDm: m.isDm };
  }
  return { full, isDm: true };
}

export async function applyHpAction(characterId: string, actor: Actor, action: HpAction, ctx: MutationContext = {}): Promise<CharacterView> {
  const { full, isDm } = await resolveActor(characterId, actor);
  const derived = derive(full);
  const maxHp = derived.maxHp.value;
  const who = actor.userId ? undefined : ctx.sourceLabel ?? "SYSTEM";
  const depth = ctx.depth ?? 0;
  const base = { campaignId: full.campaignId, actorUserId: actor.userId, characterId };

  switch (action.action) {
    case "damage": {
      const app = applyDamage({ hpCurrent: full.hpCurrent, hpTemp: full.hpTemp }, action.amount, action.damageType, derived.resistances, {
        ignoreResistance: action.ignoreResistance && isDm,
      });
      await prisma.character.update({
        where: { id: characterId },
        data: { hpCurrent: app.hpAfter, hpTemp: app.tempAfter, version: { increment: 1 } },
      });
      await logEvent({
        ...base,
        type: "hp.damage",
        summary: `${full.name} took ${app.afterResistance} ${action.damageType} damage${who ? ` from ${who}` : ""} (HP ${app.hpBefore} → ${app.hpAfter})`,
        payload: { ...app, note: action.note ?? null, source: ctx.sourceLabel ?? null },
      });
      if (app.hpAfter === 0 && app.hpBefore > 0) {
        await applyConditionInternal(characterId, { conditionKey: "unconscious", note: "Dropped to 0 HP" }, { sourceLabel: "0 HP", depth: depth + 1 }, SYSTEM_ACTOR);
      }
      emitCharacterUpdated(full.campaignId, characterId);
      if (depth < MAX_RULE_DEPTH) {
        await dispatchTrigger(
          characterId,
          { type: "damageReceived", damage: { amount: app.afterResistance, damageType: action.damageType }, hp: { before: app.hpBefore, after: app.hpAfter, max: maxHp } },
          { actorUserId: actor.userId, depth: depth + 1 },
        );
      }
      break;
    }
    case "heal": {
      const before = full.hpCurrent;
      const after = Math.min(maxHp, before + action.amount);
      const data: Prisma.CharacterUpdateInput = { hpCurrent: after, version: { increment: 1 } };
      if (before === 0 && after > 0) {
        data.deathSaveSuccess = 0;
        data.deathSaveFailure = 0;
      }
      await prisma.character.update({ where: { id: characterId }, data });
      if (before === 0 && after > 0) {
        const unconscious = full.conditions.find((c) => c.definition.key === "unconscious");
        if (unconscious) await prisma.characterCondition.delete({ where: { id: unconscious.id } });
      }
      await logEvent({
        ...base,
        type: "hp.heal",
        summary: `${full.name} regained ${after - before} HP${who ? ` from ${who}` : ""} (HP ${before} → ${after})`,
        payload: { requested: action.amount, applied: after - before, before, after, source: ctx.sourceLabel ?? null },
      });
      emitCharacterUpdated(full.campaignId, characterId);
      if (depth < MAX_RULE_DEPTH && after !== before) {
        await dispatchTrigger(characterId, { type: "healingReceived", healing: after - before, hp: { before, after, max: maxHp } }, { actorUserId: actor.userId, depth: depth + 1 });
      }
      break;
    }
    case "setCurrent": {
      const value = Math.min(maxHp, Math.max(0, action.value));
      await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: value, version: { increment: 1 } } });
      await logEvent({ ...base, type: "hp.set", summary: `${full.name}'s HP set to ${value}`, payload: { before: full.hpCurrent, after: value } });
      break;
    }
    case "setMax": {
      if (!isDm && !campaignSettings(full.campaign).playersEditAttributes) throw forbidden("Players cannot change max HP in this campaign");
      await prisma.character.update({ where: { id: characterId }, data: { hpMaxBase: action.value, version: { increment: 1 } } });
      const refreshed = await loadFull(characterId);
      const newMax = derive(refreshed).maxHp.value;
      if (refreshed.hpCurrent > newMax) await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: newMax } });
      await logEvent({ ...base, type: "hp.setMax", summary: `${full.name}'s base max HP set to ${action.value}`, payload: { before: full.hpMaxBase, after: action.value } });
      break;
    }
    case "addTemp": {
      const stacks = campaignSettings(full.campaign).tempHpStacks;
      const value = stacks ? full.hpTemp + action.amount : Math.max(full.hpTemp, action.amount);
      await prisma.character.update({ where: { id: characterId }, data: { hpTemp: value, version: { increment: 1 } } });
      await logEvent({ ...base, type: "hp.temp", summary: `${full.name} gained temporary HP (${full.hpTemp} → ${value})`, payload: { before: full.hpTemp, after: value } });
      break;
    }
    case "clearTemp": {
      await prisma.character.update({ where: { id: characterId }, data: { hpTemp: 0, version: { increment: 1 } } });
      await logEvent({ ...base, type: "hp.temp", summary: `${full.name}'s temporary HP cleared`, payload: { before: full.hpTemp, after: 0 } });
      break;
    }
    case "deathSave": {
      let s = full.deathSaveSuccess;
      let f = full.deathSaveFailure;
      if (action.result === "reset") {
        s = 0;
        f = 0;
      } else if (action.result === "success") s = Math.min(3, s + 1);
      else f = Math.min(3, f + 1);
      await prisma.character.update({ where: { id: characterId }, data: { deathSaveSuccess: s, deathSaveFailure: f, version: { increment: 1 } } });
      const outcome = s >= 3 ? " — stabilized" : f >= 3 ? " — DEAD" : "";
      await logEvent({ ...base, type: "deathSave", summary: `${full.name} death saves: ${s} success / ${f} failure${outcome}`, payload: { success: s, failure: f } });
      break;
    }
    case "hitDice": {
      const available = full.level - full.hitDiceUsed;
      if (action.op === "spend") {
        if (action.count > available) throw ruleViolation(`Only ${available} hit dice available`);
        const conMod = derived.modifiers.con;
        let healed = 0;
        const rolls: number[] = [];
        for (let i = 0; i < action.count; i++) {
          const r = roll(`1d${full.hitDieSize}`);
          rolls.push(r.total);
          healed += Math.max(0, r.total + conMod);
        }
        const after = Math.min(maxHp, full.hpCurrent + healed);
        await prisma.character.update({
          where: { id: characterId },
          data: { hitDiceUsed: full.hitDiceUsed + action.count, hpCurrent: after, version: { increment: 1 } },
        });
        await logEvent({
          ...base,
          type: "hitDice.spend",
          summary: `${full.name} spent ${action.count}d${full.hitDieSize} (${rolls.join(", ")}) +${conMod} CON each → healed ${after - full.hpCurrent}`,
          payload: { rolls, conMod, healed: after - full.hpCurrent },
        });
      } else {
        const used = action.op === "restoreAll" ? 0 : Math.max(0, full.hitDiceUsed - action.count);
        await prisma.character.update({ where: { id: characterId }, data: { hitDiceUsed: used, version: { increment: 1 } } });
        await logEvent({ ...base, type: "hitDice.restore", summary: `${full.name} restored hit dice (${full.level - used}/${full.level} available)` });
      }
      break;
    }
    case "rest": {
      if (action.kind === "long") {
        const regain = Math.max(1, Math.floor(full.level / 2));
        await prisma.character.update({
          where: { id: characterId },
          data: {
            hpCurrent: maxHp,
            hpTemp: 0,
            hitDiceUsed: Math.max(0, full.hitDiceUsed - regain),
            deathSaveSuccess: 0,
            deathSaveFailure: 0,
            version: { increment: 1 },
          },
        });
        await prisma.activeEffect.deleteMany({ where: { characterId, durationTurns: { not: null } } });
        await prisma.characterCondition.deleteMany({ where: { characterId, durationTurns: { not: null } } });
      }
      await prisma.ruleUsage.deleteMany({ where: { characterId, usageKey: { contains: ":rest:" } } });
      await logEvent({ ...base, type: `rest.${action.kind}`, summary: `${full.name} completed a ${action.kind} rest` });
      break;
    }
  }
  emitCharacterUpdated(full.campaignId, characterId);
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
}

// ---------- Conditions ----------

async function applyConditionInternal(characterId: string, input: ApplyConditionInput, ctx: MutationContext, actor: Actor) {
  const full = await loadFull(characterId);
  const def = await findConditionDefinition(full.campaignId, input.conditionKey);
  const existing = full.conditions.find((c) => c.definitionId === def.id);
  const depth = ctx.depth ?? 0;
  if (existing) {
    // Refresh duration / level instead of duplicating.
    await prisma.characterCondition.update({
      where: { id: existing.id },
      data: {
        durationTurns: input.durationTurns ?? existing.durationTurns,
        remainingTurns: input.durationTurns ?? existing.remainingTurns,
        level: input.level ?? (def.key === "exhaustion" ? Math.min(10, (existing.level ?? 1) + 1) : existing.level),
        note: input.note ?? existing.note,
      },
    });
  } else {
    await prisma.characterCondition.create({
      data: {
        characterId,
        definitionId: def.id,
        durationTurns: input.durationTurns ?? null,
        remainingTurns: input.durationTurns ?? null,
        level: input.level ?? (def.key === "exhaustion" ? 1 : null),
        note: input.note ?? null,
        sourceLabel: ctx.sourceLabel ?? null,
      },
    });
  }
  await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
  await logEvent({
    campaignId: full.campaignId,
    type: "condition.applied",
    actorUserId: actor.userId,
    characterId,
    summary: `${full.name} is now ${def.name}${input.durationTurns ? ` (${input.durationTurns} turns)` : ""}${ctx.sourceLabel ? ` — ${ctx.sourceLabel}` : ""}`,
    payload: { conditionKey: def.key, durationTurns: input.durationTurns ?? null, level: input.level ?? null, refreshed: Boolean(existing) },
  });
  emitCharacterUpdated(full.campaignId, characterId);
  if (!existing && depth < MAX_RULE_DEPTH) {
    await dispatchTrigger(characterId, { type: "conditionApplied", conditionKey: def.key }, { actorUserId: actor.userId, depth: depth + 1 });
  }
}

export async function applyCondition(characterId: string, actor: Actor, input: ApplyConditionInput, ctx: MutationContext = {}): Promise<CharacterView> {
  const { isDm } = await resolveActor(characterId, actor);
  await applyConditionInternal(characterId, input, ctx, actor);
  const full = await loadFull(characterId);
  return buildView(full, { userId: actor.userId ?? full.ownerUserId, isDm });
}

export async function removeCondition(characterId: string, actor: Actor, idOrKey: string, ctx: MutationContext = {}): Promise<CharacterView> {
  const { full, isDm } = await resolveActor(characterId, actor);
  const cond = full.conditions.find((c) => c.id === idOrKey || c.definition.key === idOrKey);
  if (!cond) throw notFound("Condition on character");
  await prisma.characterCondition.delete({ where: { id: cond.id } });
  await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
  await logEvent({
    campaignId: full.campaignId,
    type: "condition.removed",
    actorUserId: actor.userId,
    characterId,
    summary: `${full.name} is no longer ${cond.definition.name}${ctx.sourceLabel ? ` — ${ctx.sourceLabel}` : ""}`,
    payload: { conditionKey: cond.definition.key },
  });
  emitCharacterUpdated(full.campaignId, characterId);
  if ((ctx.depth ?? 0) < MAX_RULE_DEPTH) {
    await dispatchTrigger(characterId, { type: "conditionRemoved", conditionKey: cond.definition.key }, { actorUserId: actor.userId, depth: (ctx.depth ?? 0) + 1 });
  }
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
}

// ---------- Turn ticking & expiry ----------

export async function expireActiveEffect(effectId: string, reason = "expired"): Promise<void> {
  const eff = await prisma.activeEffect.findUnique({ where: { id: effectId }, include: { character: { select: { campaignId: true, name: true } } } });
  if (!eff) return;
  await prisma.activeEffect.delete({ where: { id: effectId } });
  await prisma.character.update({ where: { id: eff.characterId }, data: { version: { increment: 1 } } });
  await logEvent({
    campaignId: eff.character.campaignId,
    type: "effect.expired",
    characterId: eff.characterId,
    summary: `${eff.label} ${reason} on ${eff.character.name}`,
    payload: { effectId: eff.id, label: eff.label },
  });
  emitCharacterUpdated(eff.character.campaignId, eff.characterId);
  const onExpiry = (eff.onExpiry as unknown as Parameters<typeof applyInstantEffects>[1]) ?? [];
  if (onExpiry.length) {
    await applyInstantEffects(eff.characterId, onExpiry, { sourceLabel: `${eff.label} (expiry)`, depth: 1, actorUserId: null });
  }
}

/** Advances durations for one character by one turn. Called when the character's turn starts. */
export async function tickCharacterTurn(characterId: string): Promise<void> {
  const full = await loadFull(characterId);
  for (const eff of full.activeEffects) {
    if (eff.remainingTurns === null) continue;
    const next = eff.remainingTurns - 1;
    if (next <= 0) await expireActiveEffect(eff.id);
    else await prisma.activeEffect.update({ where: { id: eff.id }, data: { remainingTurns: next } });
  }
  for (const cond of full.conditions) {
    if (cond.remainingTurns === null) continue;
    const next = cond.remainingTurns - 1;
    if (next <= 0) await removeCondition(characterId, SYSTEM_ACTOR, cond.id, { sourceLabel: "duration ended" });
    else await prisma.characterCondition.update({ where: { id: cond.id }, data: { remainingTurns: next } });
  }
  for (const o of full.overrides) {
    if (o.remainingTurns === null) continue;
    const next = o.remainingTurns - 1;
    if (next <= 0) {
      await prisma.dMOverride.update({ where: { id: o.id }, data: { active: false, revokedAt: new Date(), remainingTurns: 0 } });
      await logEvent({
        campaignId: full.campaignId,
        type: "override.expired",
        characterId,
        summary: `Override on ${full.name}'s ${o.target} expired`,
        payload: { overrideId: o.id, target: o.target },
      });
    } else await prisma.dMOverride.update({ where: { id: o.id }, data: { remainingTurns: next } });
  }
  await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
  emitCharacterUpdated(full.campaignId, characterId);
}

// ---------- Export / import / reset ----------

export async function exportCharacter(characterId: string, userId: string) {
  await requireCharacterAccess(characterId, userId);
  return sheetExport(await loadFull(characterId));
}

function sheetExport(full: FullCharacter): SharedSheetDto["sheet"] {
  const core = toCharacterCore(full);
  return {
    format: "neom-net/character" as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    character: {
      ...core,
      items: full.items.map((i) => ({ definitionName: i.definition.name, definitionId: i.definitionId, quantity: i.quantity, status: i.status, installedSlot: i.installedSlot, equippedSlot: i.equippedSlot, charges: i.charges, customName: i.customName })),
      conditions: full.conditions.map((c) => ({ key: c.definition.key, level: c.level, note: c.note })),
      unlocks: full.unlocks.map((u) => ({ nodeKey: u.node.key, rank: u.rank })),
    },
  };
}

/**
 * Imports sheet fields from an export (identity, attributes, skills, HP, speed, hit die; level/XP/credits/points for the DM).
 * Items, conditions and unlocks are campaign-specific and are not re-created automatically.
 */
export async function importCharacter(characterId: string, userId: string, payload: Record<string, unknown>): Promise<CharacterView> {
  const { membership } = await requireCharacterEdit(characterId, userId);
  const pick = <T>(k: string): T | undefined => payload[k] as T | undefined;
  const input: UpdateCharacterInput = {
    name: pick("name"),
    species: pick("species"),
    characterClass: pick("characterClass"),
    subclass: pick("subclass"),
    faction: pick("faction"),
    alignment: pick("alignment"),
    background: pick("background"),
    biography: pick("biography"),
    portraitUrl: pick("portraitUrl") ?? null,
    attributes: pick("attributes"),
    saveProficiencies: pick("saveProficiencies"),
    skills: pick("skills"),
    specialSkills: pick("specialSkills"),
    hpMaxBase: pick("hpMaxBase"),
    baseSpeed: pick("baseSpeed"),
    hitDieSize: pick("hitDieSize"),
    inspiration: pick("inspiration"),
  };
  if (membership.isDm) {
    input.level = pick("level");
    input.xp = pick("xp");
    input.credits = pick("credits");
    input.progressionPoints = pick("progressionPoints");
    input.acBase = pick("acBase");
    input.acBonus = pick("acBonus");
  }
  const cleaned = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(cleaned).length === 0) throw badRequest("Nothing importable in payload");
  // The file comes from outside: validate it exactly like a PATCH body before touching the sheet.
  const parsed = UpdateCharacterSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw badRequest(
      "Import file failed validation",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const view = await updateCharacter(characterId, userId, parsed.data);
  await logEvent({
    campaignId: view.character.campaignId,
    type: "character.imported",
    actorUserId: userId,
    characterId,
    summary: `${view.character.name}'s sheet was imported from a file (${Object.keys(parsed.data).join(", ")})`,
    visibility: "owner",
  });
  return view;
}

export async function resetCharacter(characterId: string, userId: string): Promise<CharacterView> {
  const { character, membership } = await requireCharacterEdit(characterId, userId);
  await prisma.$transaction([
    prisma.itemInstance.deleteMany({ where: { characterId } }),
    prisma.characterCondition.deleteMany({ where: { characterId } }),
    prisma.activeEffect.deleteMany({ where: { characterId } }),
    prisma.characterUnlock.deleteMany({ where: { characterId } }),
    prisma.dMOverride.updateMany({ where: { characterId, active: true }, data: { active: false, revokedAt: new Date() } }),
    prisma.ruleUsage.deleteMany({ where: { characterId } }),
    prisma.character.update({
      where: { id: characterId },
      data: {
        level: 1,
        xp: 0,
        hpCurrent: character.hpMaxBase,
        hpTemp: 0,
        hitDiceUsed: 0,
        deathSaveSuccess: 0,
        deathSaveFailure: 0,
        inspiration: false,
        progressionPoints: 0,
        version: { increment: 1 },
      },
    }),
  ]);
  await logEvent({ campaignId: character.campaignId, type: "character.reset", actorUserId: userId, characterId, summary: `${character.name} was reset to level 1` });
  emitCharacterUpdated(character.campaignId, characterId);
  const full = await loadFull(characterId);
  return buildView(full, { userId, isDm: membership.isDm });
}

// ---------- Ownership ----------

/** DM hands a sheet to another member: ownership moves, the recipient is notified (socket + push). */
export async function assignCharacter(characterId: string, dmUserId: string, targetUserId: string): Promise<CharacterView> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, include: { campaign: true } });
  if (!character) throw notFound("Character");
  const dm = await getMembership(character.campaignId, dmUserId);
  if (!dm?.isDm) throw forbidden("Only the DM can send sheets");
  const target = await prisma.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId: character.campaignId, userId: targetUserId } },
    include: { user: { select: { username: true } } },
  });
  if (!target) throw badRequest("That user is not a member of this campaign");
  const sender = await prisma.user.findUnique({ where: { id: dmUserId }, select: { username: true } });
  const previousOwner = character.ownerUserId;
  await prisma.character.update({ where: { id: characterId }, data: { ownerUserId: targetUserId, version: { increment: 1 } } });
  await logEvent({
    campaignId: character.campaignId,
    type: "character.assigned",
    actorUserId: dmUserId,
    characterId,
    summary: `${sender?.username ?? "DM"} sent ${character.name}'s sheet to ${target.user.username}`,
    payload: { fromUserId: previousOwner, toUserId: targetUserId },
    visibility: "owner",
    ownerUserId: targetUserId,
  });
  emitToUser(targetUserId, "sheet.sent", { campaignId: character.campaignId, characterId, characterName: character.name, fromName: sender?.username ?? "DM" });
  emitCharacterUpdated(character.campaignId, characterId);
  const full = await loadFull(characterId);
  return buildView(full, { userId: dmUserId, isDm: true });
}

// ---------- Portrait ----------

/**
 * Portrait-only update. Goes through access (not edit) so an owner can still set their picture in
 * DM-controlled mode when the campaign allows it (`playersManagePortrait`, on by default).
 */
export async function setPortrait(characterId: string, userId: string, portraitUrl: string | null): Promise<CharacterView> {
  const { character, membership, isOwner } = await requireCharacterAccess(characterId, userId);
  const settings = campaignSettings(character.campaign);
  const allowed = membership.isDm || (isOwner && (!settings.playersReadOnly || settings.playersManagePortrait));
  if (!allowed) throw forbidden(isOwner ? "The Dungeon Master manages portraits in this campaign" : "You can only change your own character's portrait");
  const next = portraitUrl || null;
  await prisma.character.update({ where: { id: characterId }, data: { portraitUrl: next, version: { increment: 1 } } });
  const changes: SheetChange[] = [{ field: "portraitUrl", from: character.portraitUrl ? "(image)" : null, to: next ? "(image)" : null }];
  await logEvent({
    campaignId: character.campaignId,
    type: "character.updated",
    actorUserId: userId,
    characterId,
    summary: `${character.name}'s portrait was ${next ? "updated" : "cleared"}`,
    payload: { changes },
    visibility: "owner",
    ownerUserId: character.ownerUserId,
  });
  emitCharacterUpdated(character.campaignId, characterId);
  return buildView(await loadFull(characterId), { userId, isDm: membership.isDm });
}

// ---------- Share links ----------

async function requireShareRights(characterId: string, userId: string) {
  const access = await requireCharacterAccess(characterId, userId);
  if (!access.isOwner && !access.membership.isDm) throw forbidden("Only the owner or the DM can share this sheet");
  return access;
}

/** Returns the character's share token, creating it (or replacing it when `rotate`) as needed. */
export async function createShareLink(characterId: string, userId: string, rotate: boolean): Promise<CharacterView> {
  const { character, membership } = await requireShareRights(characterId, userId);
  if (!character.shareToken || rotate) {
    await prisma.character.update({
      where: { id: characterId },
      data: { shareToken: randomBytes(24).toString("base64url"), shareCreatedAt: new Date() },
    });
    await logEvent({
      campaignId: character.campaignId,
      type: "character.shared",
      actorUserId: userId,
      characterId,
      summary: `${character.name}'s share link was ${character.shareToken ? "replaced" : "created"}`,
      visibility: "owner",
      ownerUserId: character.ownerUserId,
    });
  }
  return buildView(await loadFull(characterId), { userId, isDm: membership.isDm });
}

export async function revokeShareLink(characterId: string, userId: string): Promise<CharacterView> {
  const { character, membership } = await requireShareRights(characterId, userId);
  if (character.shareToken) {
    await prisma.character.update({ where: { id: characterId }, data: { shareToken: null, shareCreatedAt: null } });
    await logEvent({
      campaignId: character.campaignId,
      type: "character.unshared",
      actorUserId: userId,
      characterId,
      summary: `${character.name}'s share link was revoked`,
      visibility: "owner",
      ownerUserId: character.ownerUserId,
    });
  }
  return buildView(await loadFull(characterId), { userId, isDm: membership.isDm });
}

/**
 * Resolves a share link for any signed-in user. Holding the link is the grant: non-members get a
 * read-only copy of the sheet (export format, so it can be downloaded or imported), members are
 * told to open the live HUD. Revoked or unknown tokens are a plain 404.
 */
export async function getSharedSheet(token: string, userId: string): Promise<SharedSheetDto> {
  const row = await prisma.character.findUnique({ where: { shareToken: token }, select: { id: true } });
  if (!row) throw notFound("Shared sheet");
  const full = await loadFull(row.id);
  const membership = await getMembership(full.campaignId, userId);
  return {
    campaignId: full.campaignId,
    campaignName: full.campaign.name,
    characterId: full.id,
    ownerUsername: full.owner.username,
    isMember: Boolean(membership),
    derived: derive(full),
    sheet: sheetExport(full),
  };
}
