import {
  BUILTIN_CONDITIONS,
  type ConditionDefinitionDto,
  type ConditionDefinitionInput,
  type PassiveEffect,
} from "@neom/shared";
import type { ConditionDefinition, Prisma } from "@prisma/client";
import { prisma, type Db } from "../db.js";
import { conflict, notFound } from "../errors.js";
import { emitToCampaign } from "../realtime/io.js";

/** Default mechanical effects for builtin conditions. Narrative-only conditions have none. */
const BUILTIN_EFFECTS: Record<string, PassiveEffect[]> = {
  blinded: [
    { kind: "advantage", on: "attack", mode: "disadvantage", note: "Blinded" },
    { kind: "advantage", on: "skill.perception", mode: "disadvantage", note: "Sight-based checks" },
  ],
  frightened: [{ kind: "advantage", on: "attack", mode: "disadvantage", note: "Frightened" }],
  poisoned: [{ kind: "advantage", on: "attack", mode: "disadvantage", note: "Poisoned" }],
  restrained: [
    { kind: "modifier", target: "speed", value: -99, op: "add", label: "Restrained" },
    { kind: "advantage", on: "attack", mode: "disadvantage", note: "Restrained" },
    { kind: "advantage", on: "save.dex", mode: "disadvantage", note: "Restrained" },
  ],
  grappled: [{ kind: "modifier", target: "speed", value: -99, op: "add", label: "Grappled" }],
  prone: [{ kind: "advantage", on: "attack", mode: "disadvantage", note: "Prone" }],
  paralyzed: [{ kind: "modifier", target: "speed", value: -99, op: "add", label: "Paralyzed" }],
  stunned: [{ kind: "modifier", target: "speed", value: -99, op: "add", label: "Stunned" }],
  unconscious: [{ kind: "modifier", target: "speed", value: -99, op: "add", label: "Unconscious" }],
  petrified: [{ kind: "resistance", damageType: "physical", level: "resistance" }],
  hacked: [{ kind: "advantage", on: "special.hacking", mode: "disadvantage", note: "Hacked" }],
  cyberwareMalfunction: [{ kind: "modifier", target: "capacity", value: -1, op: "add", label: "Malfunction" }],
  mentalStrain: [{ kind: "advantage", on: "special.sanity", mode: "disadvantage", note: "Mental strain" }],
};

const BUILTIN_COLORS: Record<string, string> = {
  dnd: "crimson",
  cyber: "cyan",
};

const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  blinded: "Can't see; automatically fails sight checks; attacks against have advantage, own attacks disadvantage.",
  charmed: "Can't attack the charmer; charmer has advantage on social checks.",
  deafened: "Can't hear and automatically fails hearing checks.",
  frightened: "Disadvantage on checks and attacks while the source is in sight; can't move closer.",
  grappled: "Speed becomes 0.",
  incapacitated: "Can't take actions or reactions.",
  invisible: "Can't be seen without special senses; attacks have advantage.",
  paralyzed: "Incapacitated, can't move or speak; fails STR/DEX saves; melee hits are crits.",
  petrified: "Turned to stone; incapacitated; resistance to all damage.",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "Can only crawl; disadvantage on attacks; melee attacks against have advantage.",
  restrained: "Speed 0; disadvantage on attacks and DEX saves; attacks against have advantage.",
  stunned: "Incapacitated, can't move; fails STR/DEX saves.",
  unconscious: "Incapacitated, drops what it holds, falls prone; fails STR/DEX saves.",
  exhaustion: "Cumulative levels of fatigue. Track the level on the condition.",
  hacked: "Neural systems compromised. Disadvantage on Hacking checks until purged.",
  cyberwareMalfunction: "Installed systems glitch. Capacity reduced by 1 until repaired.",
  mentalStrain: "Psyche under pressure. Disadvantage on Sanity checks.",
};

export async function ensureBuiltinConditions(db: Db = prisma): Promise<void> {
  for (const c of BUILTIN_CONDITIONS) {
    const existing = await db.conditionDefinition.findFirst({ where: { campaignId: null, key: c.key } });
    if (existing) continue;
    await db.conditionDefinition.create({
      data: {
        campaignId: null,
        key: c.key,
        name: c.name,
        description: BUILTIN_DESCRIPTIONS[c.key] ?? "",
        color: BUILTIN_COLORS[c.group] ?? "crimson",
        effects: (BUILTIN_EFFECTS[c.key] ?? []) as unknown as Prisma.InputJsonValue,
        ruleIds: [],
        builtin: true,
      },
    });
  }
}

export function toConditionDefDto(c: ConditionDefinition): ConditionDefinitionDto {
  return {
    id: c.id,
    campaignId: c.campaignId,
    key: c.key,
    name: c.name,
    description: c.description,
    color: c.color,
    effects: (c.effects as unknown as PassiveEffect[]) ?? [],
    ruleIds: (c.ruleIds as string[]) ?? [],
    builtin: c.builtin,
  };
}

/** Builtin + campaign-specific definitions; a campaign key shadows a builtin key. */
export async function listConditionDefinitions(campaignId: string, db: Db = prisma): Promise<ConditionDefinitionDto[]> {
  const rows = await db.conditionDefinition.findMany({
    where: { OR: [{ campaignId: null }, { campaignId }] },
    orderBy: [{ builtin: "desc" }, { name: "asc" }],
  });
  const byKey = new Map<string, ConditionDefinition>();
  for (const r of rows) {
    const cur = byKey.get(r.key);
    if (!cur || r.campaignId) byKey.set(r.key, r);
  }
  return [...byKey.values()].map(toConditionDefDto);
}

export async function findConditionDefinition(campaignId: string, key: string, db: Db = prisma): Promise<ConditionDefinition> {
  const custom = await db.conditionDefinition.findFirst({ where: { campaignId, key } });
  if (custom) return custom;
  const builtin = await db.conditionDefinition.findFirst({ where: { campaignId: null, key } });
  if (!builtin) throw notFound(`Condition "${key}"`);
  return builtin;
}

export async function createConditionDefinition(campaignId: string, input: ConditionDefinitionInput): Promise<ConditionDefinitionDto> {
  const exists = await prisma.conditionDefinition.findFirst({ where: { campaignId, key: input.key } });
  if (exists) throw conflict(`Condition key "${input.key}" already exists in this campaign`);
  const row = await prisma.conditionDefinition.create({
    data: {
      campaignId,
      key: input.key,
      name: input.name,
      description: input.description,
      color: input.color,
      effects: input.effects as unknown as Prisma.InputJsonValue,
      ruleIds: input.ruleIds,
      builtin: false,
    },
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "conditions" });
  return toConditionDefDto(row);
}

export async function updateConditionDefinition(campaignId: string, id: string, input: ConditionDefinitionInput): Promise<ConditionDefinitionDto> {
  const row = await prisma.conditionDefinition.findFirst({ where: { id, campaignId } });
  if (!row) throw notFound("Condition definition");
  const updated = await prisma.conditionDefinition.update({
    where: { id },
    data: {
      key: input.key,
      name: input.name,
      description: input.description,
      color: input.color,
      effects: input.effects as unknown as Prisma.InputJsonValue,
      ruleIds: input.ruleIds,
    },
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "conditions" });
  return toConditionDefDto(updated);
}

export async function deleteConditionDefinition(campaignId: string, id: string): Promise<void> {
  const row = await prisma.conditionDefinition.findFirst({ where: { id, campaignId } });
  if (!row) throw notFound("Condition definition");
  await prisma.conditionDefinition.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "conditions" });
}
