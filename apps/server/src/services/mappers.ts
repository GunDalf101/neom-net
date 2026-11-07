import type {
  AbilityDto,
  ActiveEffectDto,
  AttributeKey,
  CharacterConditionDto,
  CharacterCore,
  DiceRollDto,
  EncounterDto,
  EncounterParticipantDto,
  InstantEffect,
  ItemDefinitionDto,
  ItemInstanceDto,
  JournalEntryDto,
  LiveSessionDto,
  MessageDto,
  MissionDto,
  NpcDto,
  OverrideDto,
  PassiveEffect,
  PendingActionDto,
  Requirement,
  RollRequestDto,
  RollResult,
  RuleDefinitionDto,
  RuleExecutionResult,
  RuleGraph,
  RuleTraceDto,
  RuleVersionDto,
  SkillTreeDto,
  SkillTreeNodeDto,
} from "@neom/shared";
import { validateRuleGraph } from "@neom/shared";
import type { Prisma } from "@prisma/client";

type Json = Prisma.JsonValue;
const arr = <T>(v: Json | null | undefined): T[] => (Array.isArray(v) ? (v as unknown as T[]) : []);
const obj = <T>(v: Json | null | undefined, fallback: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as T) : fallback);
const iso = (d: Date) => d.toISOString();

export function toCharacterCore(c: Prisma.CharacterGetPayload<Record<string, never>>): CharacterCore {
  return {
    id: c.id,
    campaignId: c.campaignId,
    ownerUserId: c.ownerUserId,
    name: c.name,
    species: c.species,
    characterClass: c.characterClass,
    subclass: c.subclass,
    level: c.level,
    xp: c.xp,
    faction: c.faction,
    alignment: c.alignment,
    background: c.background,
    biography: c.biography,
    portraitUrl: c.portraitUrl,
    attributes: c.attributes as unknown as CharacterCore["attributes"],
    saveProficiencies: c.saveProficiencies as unknown as CharacterCore["saveProficiencies"],
    skills: c.skills as unknown as CharacterCore["skills"],
    specialSkills: c.specialSkills as unknown as CharacterCore["specialSkills"],
    hpCurrent: c.hpCurrent,
    hpMaxBase: c.hpMaxBase,
    hpTemp: c.hpTemp,
    baseSpeed: c.baseSpeed,
    acBase: c.acBase,
    acBonus: c.acBonus,
    hitDieSize: c.hitDieSize,
    hitDiceUsed: c.hitDiceUsed,
    inspiration: c.inspiration,
    deathSaveSuccess: c.deathSaveSuccess,
    deathSaveFailure: c.deathSaveFailure,
    credits: c.credits,
    progressionPoints: c.progressionPoints,
    version: c.version,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export function toItemDefinitionDto(d: Prisma.ItemDefinitionGetPayload<Record<string, never>>): ItemDefinitionDto {
  return {
    id: d.id,
    campaignId: d.campaignId,
    name: d.name,
    description: d.description,
    icon: d.icon,
    imageUrl: d.imageUrl,
    category: d.category as ItemDefinitionDto["category"],
    rarity: d.rarity as ItemDefinitionDto["rarity"],
    price: d.price,
    weight: d.weight,
    requirements: arr<Requirement>(d.requirements),
    effects: arr<PassiveEffect>(d.effects),
    useEffects: arr<InstantEffect>(d.useEffects),
    augmentationSlot: d.augmentationSlot as ItemDefinitionDto["augmentationSlot"],
    equipmentSlot: d.equipmentSlot as ItemDefinitionDto["equipmentSlot"],
    capacityCost: d.capacityCost,
    stackable: d.stackable,
    maxCharges: d.maxCharges,
    damage: d.damage,
    damageType: d.damageType as ItemDefinitionDto["damageType"],
    ruleIds: arr<string>(d.ruleIds),
    tags: arr<string>(d.tags),
    visibleToPlayers: d.visibleToPlayers,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function toItemInstanceDto(i: Prisma.ItemInstanceGetPayload<{ include: { definition: true } }>): ItemInstanceDto {
  return {
    id: i.id,
    characterId: i.characterId,
    definitionId: i.definitionId,
    definition: toItemDefinitionDto(i.definition),
    quantity: i.quantity,
    charges: i.charges,
    status: i.status as ItemInstanceDto["status"],
    equippedSlot: i.equippedSlot as ItemInstanceDto["equippedSlot"],
    installedSlot: i.installedSlot as ItemInstanceDto["installedSlot"],
    customName: i.customName,
    customEffects: i.customEffects ? arr<PassiveEffect>(i.customEffects) : null,
    container: i.container,
    createdAt: iso(i.createdAt),
  };
}

export function toCharacterConditionDto(c: Prisma.CharacterConditionGetPayload<{ include: { definition: true } }>): CharacterConditionDto {
  return {
    id: c.id,
    key: c.definition.key,
    name: c.definition.name,
    color: c.definition.color,
    description: c.definition.description,
    effects: arr<PassiveEffect>(c.definition.effects),
    durationTurns: c.durationTurns,
    remainingTurns: c.remainingTurns,
    level: c.level,
    note: c.note,
    sourceLabel: c.sourceLabel,
    appliedAt: iso(c.appliedAt),
  };
}

export function toActiveEffectDto(e: Prisma.ActiveEffectGetPayload<Record<string, never>>): ActiveEffectDto {
  return {
    id: e.id,
    label: e.label,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    effects: arr<PassiveEffect>(e.effects),
    durationTurns: e.durationTurns,
    remainingTurns: e.remainingTurns,
    onExpiry: arr<InstantEffect>(e.onExpiry),
    createdAt: iso(e.createdAt),
  };
}

export function toOverrideDto(o: Prisma.DMOverrideGetPayload<{ include: { createdBy: { select: { username: true } } } }>): OverrideDto {
  return {
    id: o.id,
    campaignId: o.campaignId,
    characterId: o.characterId,
    target: o.target,
    value: o.value,
    reason: o.reason,
    durationTurns: o.durationTurns,
    remainingTurns: o.remainingTurns,
    active: o.active,
    originalValue: o.originalValue,
    createdByName: o.createdBy.username,
    createdAt: iso(o.createdAt),
    revokedAt: o.revokedAt ? iso(o.revokedAt) : null,
  };
}

export function toRollDto(
  r: Prisma.DiceRollGetPayload<{ include: { user: { select: { username: true } }; character: { select: { name: true } } } }>,
): DiceRollDto {
  return {
    id: r.id,
    campaignId: r.campaignId,
    characterId: r.characterId,
    characterName: r.character?.name ?? null,
    userId: r.userId,
    username: r.user.username,
    expression: r.expression,
    category: r.category as DiceRollDto["category"],
    label: r.label,
    mode: r.mode as DiceRollDto["mode"],
    result: r.result as unknown as RollResult,
    total: r.total,
    visibility: r.visibility as DiceRollDto["visibility"],
    dc: r.dc,
    success: r.success,
    createdAt: iso(r.createdAt),
  };
}

export function toRuleDto(r: Prisma.RuleDefinitionGetPayload<Record<string, never>>): RuleDefinitionDto {
  const graph = r.draftGraph as unknown as RuleGraph;
  return {
    id: r.id,
    campaignId: r.campaignId,
    name: r.name,
    description: r.description,
    automationMode: r.automationMode as RuleDefinitionDto["automationMode"],
    enabled: r.enabled,
    scope: r.scope as RuleDefinitionDto["scope"],
    graph,
    validation: validateRuleGraph(graph),
    draftVersion: r.draftVersion,
    publishedVersion: r.publishedVersion,
    publishedGraph: (r.publishedGraph as unknown as RuleGraph | null) ?? null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function toRuleVersionDto(v: Prisma.RuleVersionGetPayload<Record<string, never>>): RuleVersionDto {
  return { id: v.id, ruleId: v.ruleId, version: v.version, graph: v.graph as unknown as RuleGraph, note: v.note, createdAt: iso(v.createdAt) };
}

export function toTraceDto(t: Prisma.RuleTraceGetPayload<{ include: { character: { select: { name: true } } } }>): RuleTraceDto {
  return {
    id: t.id,
    campaignId: t.campaignId,
    ruleId: t.ruleId,
    ruleName: t.ruleName,
    characterId: t.characterId,
    characterName: t.character.name,
    eventType: t.eventType,
    result: t.result as unknown as RuleExecutionResult,
    status: t.status as RuleTraceDto["status"],
    automationMode: t.automationMode as RuleTraceDto["automationMode"],
    createdAt: iso(t.createdAt),
  };
}

export function toPendingDto(p: Prisma.PendingActionGetPayload<{ include: { character: { select: { name: true } } } }>): PendingActionDto {
  return {
    id: p.id,
    campaignId: p.campaignId,
    characterId: p.characterId,
    characterName: p.character.name,
    ruleId: p.ruleId,
    ruleName: p.ruleName,
    traceId: p.traceId,
    actions: arr<unknown>(p.actions),
    status: p.status as PendingActionDto["status"],
    note: p.note,
    createdAt: iso(p.createdAt),
  };
}

export function toParticipantDto(
  p: Prisma.EncounterParticipantGetPayload<{ include: { character: { select: { portraitUrl: true } }; npc: { select: { portraitUrl: true } } } }>,
  forDm: boolean,
): EncounterParticipantDto {
  return {
    id: p.id,
    encounterId: p.encounterId,
    characterId: p.characterId,
    npcId: p.npcId,
    name: p.name,
    portraitUrl: p.character?.portraitUrl ?? p.npc?.portraitUrl ?? null,
    initiative: p.initiative,
    hpCurrent: p.hpCurrent,
    hpMax: p.hpMax,
    ac: p.ac,
    conditions: arr<string>(p.conditions),
    hidden: p.hidden,
    isNpc: !p.characterId,
    sortOrder: p.sortOrder,
    ...(forDm ? { notes: p.notes } : {}),
  };
}

export function toEncounterDto(
  e: Prisma.EncounterGetPayload<{
    include: { participants: { include: { character: { select: { portraitUrl: true } }; npc: { select: { portraitUrl: true } } } } };
  }>,
  forDm: boolean,
): EncounterDto {
  const participants = e.participants
    .filter((p) => forDm || !p.hidden)
    .sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99) || a.sortOrder - b.sortOrder)
    .map((p) => toParticipantDto(p, forDm));
  if (!forDm) {
    for (const p of participants) {
      if (p.isNpc) {
        // Players see NPC HP only as a coarse state via hpCurrent bucket (full/bloodied/down).
        const ratio = p.hpMax > 0 ? p.hpCurrent / p.hpMax : 0;
        p.hpCurrent = ratio <= 0 ? 0 : ratio < 0.5 ? 1 : 2;
        p.hpMax = 2;
      }
    }
  }
  return {
    id: e.id,
    campaignId: e.campaignId,
    name: e.name,
    description: e.description,
    status: e.status as EncounterDto["status"],
    round: e.round,
    turnIndex: e.turnIndex,
    participants,
    createdAt: iso(e.createdAt),
    startedAt: e.startedAt ? iso(e.startedAt) : null,
    endedAt: e.endedAt ? iso(e.endedAt) : null,
  };
}

export function toNpcDto(n: Prisma.NpcDefinitionGetPayload<Record<string, never>>): NpcDto {
  return {
    id: n.id,
    campaignId: n.campaignId,
    name: n.name,
    description: n.description,
    portraitUrl: n.portraitUrl,
    faction: n.faction,
    attributes: n.attributes as unknown as Record<AttributeKey, number>,
    hpMax: n.hpMax,
    ac: n.ac,
    speed: n.speed,
    abilities: arr<NpcDto["abilities"][number]>(n.abilities),
    effects: arr<PassiveEffect>(n.effects),
    ruleIds: arr<string>(n.ruleIds),
    visibleToPlayers: n.visibleToPlayers,
    isEnemy: n.isEnemy,
    createdAt: iso(n.createdAt),
  };
}

export function toMissionDto(m: Prisma.MissionGetPayload<{ include: { assignments: true } }>): MissionDto {
  return {
    id: m.id,
    campaignId: m.campaignId,
    name: m.name,
    description: m.description,
    objectives: arr<MissionDto["objectives"][number]>(m.objectives),
    status: m.status as MissionDto["status"],
    rewards: obj<MissionDto["rewards"]>(m.rewards, { xp: 0, credits: 0, progressionPoints: 0, itemDefinitionIds: [] }),
    assignedCharacterIds: m.assignments.map((a) => a.characterId),
    visibleToPlayers: m.visibleToPlayers,
    rewardsGrantedAt: m.rewardsGrantedAt ? iso(m.rewardsGrantedAt) : null,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
  };
}

export function toJournalDto(j: Prisma.JournalEntryGetPayload<{ include: { author: { select: { username: true } } } }>): JournalEntryDto {
  return {
    id: j.id,
    campaignId: j.campaignId,
    authorUserId: j.authorUserId,
    authorName: j.author.username,
    characterId: j.characterId,
    title: j.title,
    body: j.body,
    visibility: j.visibility as JournalEntryDto["visibility"],
    isLore: j.isLore,
    createdAt: iso(j.createdAt),
    updatedAt: iso(j.updatedAt),
  };
}

export function toSkillTreeNodeDto(n: Prisma.SkillTreeNodeGetPayload<Record<string, never>>): SkillTreeNodeDto {
  return {
    id: n.id,
    treeId: n.treeId,
    key: n.key,
    name: n.name,
    description: n.description,
    icon: n.icon,
    maxRank: n.maxRank,
    cost: n.cost,
    parentKeys: arr<string>(n.parentKeys),
    requirements: arr<Requirement>(n.requirements),
    effects: arr<PassiveEffect>(n.effects),
    ruleIds: arr<string>(n.ruleIds),
    position: obj<{ x: number; y: number }>(n.position, { x: 0, y: 0 }),
    tier: n.tier,
  };
}

export function toSkillTreeDto(t: Prisma.SkillTreeDefinitionGetPayload<{ include: { nodes: true } }>): SkillTreeDto {
  return {
    id: t.id,
    campaignId: t.campaignId,
    branch: t.branch as SkillTreeDto["branch"],
    name: t.name,
    description: t.description,
    nodes: t.nodes.sort((a, b) => a.tier - b.tier || a.key.localeCompare(b.key)).map(toSkillTreeNodeDto),
  };
}

export function toAbilityDto(a: Prisma.AbilityDefinitionGetPayload<Record<string, never>>): AbilityDto {
  return {
    id: a.id,
    campaignId: a.campaignId,
    name: a.name,
    description: a.description,
    icon: a.icon,
    actionType: a.actionType as AbilityDto["actionType"],
    cost: obj<AbilityDto["cost"]>(a.cost, { resource: "none", amount: 0 }),
    usesPer: a.usesPer as AbilityDto["usesPer"],
    maxUses: a.maxUses,
    effects: arr<InstantEffect>(a.effects),
    passiveEffects: arr<PassiveEffect>(a.passiveEffects),
    ruleIds: arr<string>(a.ruleIds),
  };
}

export function toRollRequestDto(r: Prisma.RollRequestGetPayload<{ include: { character: { select: { name: true } } } }>): RollRequestDto {
  return {
    id: r.id,
    campaignId: r.campaignId,
    characterId: r.characterId,
    characterName: r.character.name,
    target: r.target,
    expression: r.expression,
    label: r.label,
    dc: r.dc,
    visibility: r.visibility as RollRequestDto["visibility"],
    status: r.status as RollRequestDto["status"],
    resultRollId: r.resultRollId,
    createdAt: iso(r.createdAt),
  };
}

export function toMessageDto(m: Prisma.MessageGetPayload<{ include: { from: { select: { username: true } } } }>): MessageDto {
  return {
    id: m.id,
    campaignId: m.campaignId,
    fromUserId: m.fromUserId,
    fromName: m.from.username,
    toUserId: m.toUserId,
    characterId: m.characterId,
    kind: m.kind as MessageDto["kind"],
    body: m.body,
    createdAt: iso(m.createdAt),
  };
}

export function toSessionDto(s: Prisma.LiveSessionGetPayload<{ include: { startedBy: { select: { username: true } } } }>): LiveSessionDto {
  return {
    id: s.id,
    campaignId: s.campaignId,
    startedAt: iso(s.startedAt),
    endedAt: s.endedAt ? iso(s.endedAt) : null,
    startedByName: s.startedBy.username,
  };
}
