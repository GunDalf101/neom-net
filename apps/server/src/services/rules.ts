import {
  InstantEffectSchema,
  roll,
  runRules,
  secureDie,
  TemporaryEffectSchema,
  validateRuleGraph,
  type AutomationMode,
  type EngineAction,
  type InstantEffect,
  type PendingActionDto,
  type RuleCandidate,
  type RuleDefinitionDto,
  type RuleExecutionResult,
  type RuleGraph,
  type RuleTraceDto,
  type RuleVersionDto,
  type SimulateRuleInput,
  type TriggerEvent,
  type RuleDefinitionInput,
  executeRule,
  type RuleCharacterState,
  type AugmentationSlot,
  AUGMENTATION_SLOTS,
} from "@neom/shared";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { badRequest, notFound, ruleViolation } from "../errors.js";
import { logger } from "../logger.js";
import { emitCharacterUpdated, emitToCampaign, emitToDm, emitToDmAndUser } from "../realtime/io.js";
import { campaignSettings } from "./access.js";
import {
  applyCondition,
  applyHpAction,
  buildRuleState,
  derive,
  loadFull,
  removeCondition,
  SYSTEM_ACTOR,
  type FullCharacter,
} from "./characters.js";
import { logEvent } from "./events.js";
import { toPendingDto, toRuleDto, toRuleVersionDto, toTraceDto } from "./mappers.js";
import { setItemStatus } from "./items.js";

// ============================================================
// Rule definitions (workshop)
// ============================================================

export async function listRules(campaignId: string): Promise<RuleDefinitionDto[]> {
  const rows = await prisma.ruleDefinition.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" } });
  return rows.map(toRuleDto);
}

export async function createRule(campaignId: string, input: RuleDefinitionInput): Promise<RuleDefinitionDto> {
  const row = await prisma.ruleDefinition.create({
    data: {
      campaignId,
      name: input.name,
      description: input.description,
      automationMode: input.automationMode,
      enabled: input.enabled,
      scope: input.scope,
      draftGraph: input.graph as unknown as Prisma.InputJsonValue,
      draftVersion: 1,
    },
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "rules" });
  return toRuleDto(row);
}

export async function updateRule(campaignId: string, ruleId: string, input: Partial<RuleDefinitionInput>): Promise<RuleDefinitionDto> {
  const row = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!row) throw notFound("Rule");
  const graphChanged = input.graph !== undefined && JSON.stringify(input.graph) !== JSON.stringify(row.draftGraph);
  const updated = await prisma.ruleDefinition.update({
    where: { id: ruleId },
    data: {
      name: input.name,
      description: input.description,
      automationMode: input.automationMode,
      enabled: input.enabled,
      scope: input.scope,
      draftGraph: input.graph as unknown as Prisma.InputJsonValue | undefined,
      // After a publish, the first draft change starts a new version number.
      draftVersion: graphChanged && row.publishedVersion === row.draftVersion ? row.draftVersion + 1 : undefined,
    },
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "rules" });
  return toRuleDto(updated);
}

export async function publishRule(campaignId: string, ruleId: string, note?: string): Promise<RuleDefinitionDto> {
  const row = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!row) throw notFound("Rule");
  const validation = validateRuleGraph(row.draftGraph);
  if (!validation.valid) throw ruleViolation("Rule has validation errors and cannot be published", validation.issues);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.ruleVersion.upsert({
      where: { ruleId_version: { ruleId, version: row.draftVersion } },
      create: { ruleId, version: row.draftVersion, graph: row.draftGraph as Prisma.InputJsonValue, note: note ?? null },
      update: { graph: row.draftGraph as Prisma.InputJsonValue, note: note ?? null },
    });
    return tx.ruleDefinition.update({
      where: { id: ruleId },
      data: { publishedGraph: row.draftGraph as Prisma.InputJsonValue, publishedVersion: row.draftVersion },
    });
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "rules" });
  return toRuleDto(updated);
}

export async function listRuleVersions(campaignId: string, ruleId: string): Promise<RuleVersionDto[]> {
  const row = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!row) throw notFound("Rule");
  const versions = await prisma.ruleVersion.findMany({ where: { ruleId }, orderBy: { version: "desc" } });
  return versions.map(toRuleVersionDto);
}

export async function restoreRuleVersion(campaignId: string, ruleId: string, version: number): Promise<RuleDefinitionDto> {
  const row = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!row) throw notFound("Rule");
  const v = await prisma.ruleVersion.findUnique({ where: { ruleId_version: { ruleId, version } } });
  if (!v) throw notFound("Rule version");
  const latest = await prisma.ruleVersion.findFirst({ where: { ruleId }, orderBy: { version: "desc" } });
  const updated = await prisma.ruleDefinition.update({
    where: { id: ruleId },
    data: { draftGraph: v.graph as Prisma.InputJsonValue, draftVersion: (latest?.version ?? row.draftVersion) + 1 },
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "rules" });
  return toRuleDto(updated);
}

export async function duplicateRule(campaignId: string, ruleId: string): Promise<RuleDefinitionDto> {
  const row = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!row) throw notFound("Rule");
  const copy = await prisma.ruleDefinition.create({
    data: {
      campaignId,
      name: `${row.name} (copy)`,
      description: row.description,
      automationMode: row.automationMode,
      enabled: false,
      scope: row.scope,
      draftGraph: row.draftGraph as Prisma.InputJsonValue,
      draftVersion: 1,
    },
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "rules" });
  return toRuleDto(copy);
}

export async function deleteRule(campaignId: string, ruleId: string): Promise<void> {
  const row = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!row) throw notFound("Rule");
  await prisma.ruleDefinition.delete({ where: { id: ruleId } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "rules" });
}

/** Dry run against a real character (if given) or a synthetic one. Never mutates state. */
export async function simulateRule(campaignId: string, input: SimulateRuleInput): Promise<{ validation: ReturnType<typeof validateRuleGraph>; result: RuleExecutionResult | null; state: RuleCharacterState }> {
  const validation = validateRuleGraph(input.graph);
  let state: RuleCharacterState;
  if (input.characterId) {
    const full = await loadFull(input.characterId);
    if (full.campaignId !== campaignId) throw notFound("Character");
    state = buildRuleState(full, derive(full));
  } else {
    state = {
      hpCurrent: 12,
      hpMax: 12,
      hpTemp: 0,
      attributes: { str: 14, dex: 18, con: 14, int: 16, wis: 12, cha: 10 },
      specialRanks: { augmentation: 0, reflex: 1, adaptability: 0, hacking: 2, sanity: 0, aura: 0 },
      equippedDefinitionIds: [],
      augmentations: [{ slot: "eyes", definitionId: "sim-optics", active: true }],
      conditions: [],
      resources: { hitDice: 1, progressionPoints: 2, credits: 500, inspiration: 0 },
    };
  }
  if (input.stateOverrides) {
    state = { ...state, ...input.stateOverrides, conditions: input.stateOverrides.conditions ?? state.conditions };
  }
  if (!validation.valid) return { validation, result: null, state };
  const result = executeRule({
    ruleId: "simulation",
    ruleName: "Simulation",
    graph: input.graph,
    event: input.event as TriggerEvent,
    state,
    usage: {},
    chance: (p) => secureDie(100) <= p,
  });
  return { validation, result, state };
}

// ============================================================
// Runtime dispatch
// ============================================================

export interface DispatchContext {
  actorUserId: string | null;
  depth: number;
}

interface ScopeKeys {
  encounter: string;
  session: string;
  turn: string;
}

async function scopeKeys(campaignId: string): Promise<ScopeKeys> {
  const [enc, session] = await Promise.all([
    prisma.encounter.findFirst({ where: { campaignId, status: "active" }, select: { id: true, round: true, turnIndex: true } }),
    prisma.liveSession.findFirst({ where: { campaignId, endedAt: null }, select: { id: true } }),
  ]);
  return {
    encounter: enc?.id ?? "none",
    session: session?.id ?? "none",
    turn: enc ? `${enc.id}:${enc.round}:${enc.turnIndex}` : "none",
  };
}

function usageSuffix(scope: string, keys: ScopeKeys): string {
  switch (scope) {
    case "encounter":
      return keys.encounter;
    case "session":
      return keys.session;
    case "turn":
      return keys.turn;
    case "rest":
      return "rest";
    default:
      return "ever";
  }
}

/** Rules that apply to this character right now: campaign-wide + attached to active sources. */
async function candidateRules(full: FullCharacter): Promise<{ candidates: RuleCandidate[]; modes: Map<string, AutomationMode | null> }> {
  const attachedIds = new Set<string>();
  for (const item of full.items) {
    const active = item.status === "installed" || item.status === "equipped";
    if (!active) continue;
    for (const id of (item.definition.ruleIds as string[]) ?? []) attachedIds.add(id);
  }
  for (const c of full.conditions) for (const id of (c.definition.ruleIds as string[]) ?? []) attachedIds.add(id);
  for (const u of full.unlocks) for (const id of (u.node.ruleIds as string[]) ?? []) attachedIds.add(id);

  const rows = await prisma.ruleDefinition.findMany({
    where: {
      campaignId: full.campaignId,
      enabled: true,
      publishedGraph: { not: Prisma.DbNull },
      OR: [{ scope: "campaign" }, { id: { in: [...attachedIds] } }],
    },
    orderBy: { createdAt: "asc" },
  });
  const modes = new Map<string, AutomationMode | null>();
  const candidates: RuleCandidate[] = rows.map((r) => {
    modes.set(r.id, r.automationMode as AutomationMode | null);
    return { id: r.id, name: r.name, graph: r.publishedGraph as unknown as RuleGraph };
  });
  return { candidates, modes };
}

export async function dispatchTrigger(characterId: string, event: TriggerEvent, ctx: DispatchContext): Promise<RuleTraceDto[]> {
  try {
    const full = await loadFull(characterId);
    const { candidates, modes } = await candidateRules(full);
    if (candidates.length === 0) return [];
    const derived = derive(full);
    const state = buildRuleState(full, derived);
    const keys = await scopeKeys(full.campaignId);

    const usageRows = await prisma.ruleUsage.findMany({ where: { characterId, ruleId: { in: candidates.map((c) => c.id) } } });
    const usage: Record<string, Record<string, number>> = {};
    for (const u of usageRows) {
      // stored as `${nodeId}:${scope}:${suffix}`; engine wants `${nodeId}:${scope}` for the current suffix.
      const [nodeId, scope, ...rest] = u.usageKey.split(":");
      if (!nodeId || !scope) continue;
      if (rest.join(":") !== usageSuffix(scope, keys)) continue;
      usage[u.ruleId] = { ...(usage[u.ruleId] ?? {}), [`${nodeId}:${scope}`]: u.uses };
    }

    const results = runRules(candidates, event, state, usage);
    const settings = campaignSettings(full.campaign);
    const traces: RuleTraceDto[] = [];

    for (const result of results) {
      if (!result.triggered) continue;
      const mode: AutomationMode = modes.get(result.ruleId) ?? settings.defaultAutomationMode;
      let status: RuleTraceDto["status"] = "noop";
      if (result.fired) {
        status = mode === "automatic" ? "applied" : mode === "assisted" ? "pending" : "manual";
      }
      const trace = await prisma.ruleTrace.create({
        data: {
          campaignId: full.campaignId,
          ruleId: result.ruleId,
          ruleName: result.ruleName,
          characterId,
          eventType: event.type,
          result: result as unknown as Prisma.InputJsonValue,
          status,
          automationMode: mode,
        },
        include: { character: { select: { name: true } } },
      });

      if (result.fired && mode === "automatic") {
        await applyEngineActions(characterId, result.actions, { ruleId: result.ruleId, ruleName: result.ruleName, actorUserId: ctx.actorUserId, depth: ctx.depth, keys });
      } else if (result.fired && mode === "assisted") {
        const pending = await prisma.pendingAction.create({
          data: {
            campaignId: full.campaignId,
            characterId,
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            traceId: trace.id,
            actions: result.actions as unknown as Prisma.InputJsonValue,
          },
        });
        await logEvent({
          campaignId: full.campaignId,
          type: "rule.pending",
          characterId,
          summary: `${result.ruleName} triggered on ${full.name} — awaiting DM approval`,
          payload: { pendingId: pending.id, ruleId: result.ruleId },
          visibility: "dm",
        });
        emitToDm(full.campaignId, "pending.updated", { campaignId: full.campaignId });
      } else if (result.fired && mode === "manual") {
        await logEvent({
          campaignId: full.campaignId,
          type: "rule.manual",
          characterId,
          summary: `${result.ruleName} would trigger on ${full.name} — manual ruling required`,
          payload: { ruleId: result.ruleId, actions: result.actions },
          visibility: "dm",
        });
      }
      const dto = toTraceDto(trace);
      traces.push(dto);
      emitToDmAndUser(full.campaignId, full.ownerUserId, "rules.traced", dto);
    }
    return traces;
  } catch (err) {
    logger.error({ err, characterId, event: event.type }, "Rule dispatch failed");
    return [];
  }
}

// ============================================================
// Applying engine actions
// ============================================================

interface ApplyContext {
  ruleId?: string | null;
  ruleName: string;
  actorUserId: string | null;
  depth: number;
  keys?: ScopeKeys;
}

export async function applyEngineActions(characterId: string, actions: EngineAction[], ctx: ApplyContext): Promise<void> {
  const full = await loadFull(characterId);
  const keys = ctx.keys ?? (await scopeKeys(full.campaignId));
  for (const action of actions) {
    if (action.kind === "cooldownUse") {
      if (!ctx.ruleId) continue;
      const usageKey = `${action.nodeId}:${action.scope}:${usageSuffix(action.scope, keys)}`;
      await prisma.ruleUsage.upsert({
        where: { ruleId_characterId_usageKey: { ruleId: ctx.ruleId, characterId, usageKey } },
        create: { ruleId: ctx.ruleId, characterId, usageKey, uses: 1 },
        update: { uses: { increment: 1 } },
      });
    } else if (action.kind === "temporary") {
      await createTemporaryEffect(characterId, action.effect, ctx);
    } else {
      await applyInstantEffect(characterId, action.effect, { sourceLabel: ctx.ruleName, depth: ctx.depth, actorUserId: ctx.actorUserId });
    }
  }
  await logEvent({
    campaignId: full.campaignId,
    type: "rule.applied",
    characterId,
    actorUserId: ctx.actorUserId,
    summary: `${ctx.ruleName} applied to ${full.name}`,
    payload: { ruleId: ctx.ruleId ?? null, actionCount: actions.length },
  });
  emitCharacterUpdated(full.campaignId, characterId);
}

async function createTemporaryEffect(characterId: string, effect: Extract<InstantEffect, { kind: "temporaryEffect" }>, ctx: ApplyContext) {
  await prisma.activeEffect.create({
    data: {
      characterId,
      label: effect.label,
      sourceType: ctx.ruleId ? "rule" : "effect",
      sourceId: ctx.ruleId ?? null,
      effects: effect.effects as unknown as Prisma.InputJsonValue,
      durationTurns: effect.durationTurns,
      remainingTurns: effect.durationTurns,
      onExpiry: effect.onExpiry as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
}

export interface InstantContext {
  sourceLabel: string;
  depth: number;
  actorUserId: string | null;
}

function resolveAmount(amount: number | string): { value: number; rolled?: string } {
  if (typeof amount === "number") return { value: amount };
  const r = roll(amount);
  return { value: Math.max(0, r.total), rolled: `${amount} = ${r.total}` };
}

export async function applyInstantEffects(characterId: string, effects: InstantEffect[], ctx: InstantContext): Promise<void> {
  for (const e of effects) await applyInstantEffect(characterId, e, ctx);
}

export async function applyInstantEffect(characterId: string, effect: InstantEffect, ctx: InstantContext): Promise<void> {
  const full = await loadFull(characterId);
  const campaignId = full.campaignId;
  switch (effect.kind) {
    case "damage": {
      const { value, rolled } = resolveAmount(effect.amount);
      await applyHpAction(characterId, SYSTEM_ACTOR, { action: "damage", amount: value, damageType: effect.damageType, ignoreResistance: effect.ignoreResistance, note: rolled }, { sourceLabel: ctx.sourceLabel, depth: ctx.depth });
      return;
    }
    case "heal": {
      const { value, rolled } = resolveAmount(effect.amount);
      await applyHpAction(characterId, SYSTEM_ACTOR, { action: "heal", amount: value, note: rolled }, { sourceLabel: ctx.sourceLabel, depth: ctx.depth });
      return;
    }
    case "tempHp": {
      const { value } = resolveAmount(effect.amount);
      await applyHpAction(characterId, SYSTEM_ACTOR, { action: "addTemp", amount: Math.max(1, value) }, { sourceLabel: ctx.sourceLabel, depth: ctx.depth });
      return;
    }
    case "applyCondition":
      await applyCondition(characterId, SYSTEM_ACTOR, { conditionKey: effect.conditionKey, durationTurns: effect.durationTurns ?? null, level: effect.level }, { sourceLabel: ctx.sourceLabel, depth: ctx.depth });
      return;
    case "removeCondition": {
      if (!full.conditions.some((c) => c.definition.key === effect.conditionKey)) return;
      await removeCondition(characterId, SYSTEM_ACTOR, effect.conditionKey, { sourceLabel: ctx.sourceLabel, depth: ctx.depth });
      return;
    }
    case "consumeResource": {
      const data: Prisma.CharacterUpdateInput = { version: { increment: 1 } };
      let summary = "";
      switch (effect.resource) {
        case "hitDice":
          data.hitDiceUsed = Math.min(full.level, full.hitDiceUsed + effect.amount);
          summary = `${effect.amount} hit dice`;
          break;
        case "progressionPoints":
          data.progressionPoints = Math.max(0, full.progressionPoints - effect.amount);
          summary = `${effect.amount} progression points`;
          break;
        case "credits":
          data.credits = Math.max(0, full.credits - effect.amount);
          summary = `${effect.amount} credits`;
          break;
        case "inspiration":
          data.inspiration = false;
          summary = "inspiration";
          break;
        case "charges":
          return; // charges are consumed by the item use path
      }
      await prisma.character.update({ where: { id: characterId }, data });
      await logEvent({ campaignId, type: "resource.consumed", characterId, actorUserId: ctx.actorUserId, summary: `${full.name} spent ${summary} (${ctx.sourceLabel})` });
      emitCharacterUpdated(campaignId, characterId);
      return;
    }
    case "grantResource": {
      const data: Prisma.CharacterUpdateInput = { version: { increment: 1 } };
      if (effect.resource === "xp") data.xp = { increment: effect.amount };
      if (effect.resource === "credits") data.credits = { increment: effect.amount };
      if (effect.resource === "progressionPoints") data.progressionPoints = { increment: effect.amount };
      if (effect.resource === "inspiration") data.inspiration = true;
      await prisma.character.update({ where: { id: characterId }, data });
      await logEvent({ campaignId, type: "resource.granted", characterId, actorUserId: ctx.actorUserId, summary: `${full.name} gained ${effect.resource === "inspiration" ? "inspiration" : `${effect.amount} ${effect.resource}`} (${ctx.sourceLabel})` });
      emitCharacterUpdated(campaignId, characterId);
      return;
    }
    case "disableAugmentation": {
      const installed = full.items.filter((i) => i.installedSlot && i.status === "installed");
      if (installed.length === 0) return;
      let target = installed[0];
      if (effect.slot === "random") target = installed[secureDie(installed.length) - 1];
      else if ((AUGMENTATION_SLOTS as readonly string[]).includes(effect.slot)) {
        target = installed.find((i) => i.installedSlot === (effect.slot as AugmentationSlot));
      }
      if (!target) return;
      await setItemStatus(characterId, SYSTEM_ACTOR, target.id, "disabled", { sourceLabel: ctx.sourceLabel, depth: ctx.depth });
      return;
    }
    case "notify": {
      await logEvent({
        campaignId,
        type: "notify",
        characterId,
        actorUserId: ctx.actorUserId,
        summary: effect.message,
        payload: { source: ctx.sourceLabel },
        visibility: effect.audience === "dm" ? "dm" : effect.audience === "owner" ? "owner" : "public",
        ownerUserId: full.ownerUserId,
      });
      return;
    }
    case "temporaryEffect":
      await createTemporaryEffect(characterId, effect, { ruleName: ctx.sourceLabel, actorUserId: ctx.actorUserId, depth: ctx.depth });
      emitCharacterUpdated(campaignId, characterId);
      return;
  }
}

// ============================================================
// Pending actions (assisted mode)
// ============================================================

export async function listPending(campaignId: string): Promise<PendingActionDto[]> {
  const rows = await prisma.pendingAction.findMany({
    where: { campaignId, status: "pending" },
    include: { character: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPendingDto);
}

const EngineActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instant"), effect: InstantEffectSchema, nodeId: z.string().default("dm") }),
  z.object({ kind: z.literal("temporary"), effect: TemporaryEffectSchema, nodeId: z.string().default("dm") }),
  z.object({ kind: z.literal("cooldownUse"), usageKey: z.string(), scope: z.string(), nodeId: z.string() }),
]);

export async function resolvePending(
  campaignId: string,
  pendingId: string,
  dmUserId: string,
  decision: "approve" | "reject" | "modify",
  modifiedActions?: unknown[],
  note?: string,
): Promise<PendingActionDto> {
  const row = await prisma.pendingAction.findFirst({ where: { id: pendingId, campaignId }, include: { character: { select: { name: true } } } });
  if (!row) throw notFound("Pending action");
  if (row.status !== "pending") throw badRequest("Already resolved");

  let actions = row.actions as unknown as EngineAction[];
  if (decision === "modify") {
    const parsed = z.array(EngineActionSchema).max(30).safeParse(modifiedActions ?? []);
    if (!parsed.success) throw badRequest("Invalid modified actions", parsed.error.issues);
    actions = parsed.data as unknown as EngineAction[];
  }
  const status = decision === "approve" ? "approved" : decision === "modify" ? "modified" : "rejected";
  if (decision !== "reject") {
    await applyEngineActions(row.characterId, actions, { ruleId: row.ruleId, ruleName: row.ruleName, actorUserId: dmUserId, depth: 1 });
  }
  const updated = await prisma.pendingAction.update({
    where: { id: pendingId },
    data: { status, note: note ?? null, resolvedAt: new Date(), actions: actions as unknown as Prisma.InputJsonValue },
    include: { character: { select: { name: true } } },
  });
  await prisma.ruleTrace.update({ where: { id: row.traceId }, data: { status } });
  await logEvent({
    campaignId,
    type: `rule.${status}`,
    actorUserId: dmUserId,
    characterId: row.characterId,
    summary: `DM ${status} ${row.ruleName} on ${row.character.name}${note ? `: ${note}` : ""}`,
    payload: { pendingId, ruleId: row.ruleId },
  });
  emitToDm(campaignId, "pending.updated", { campaignId });
  return toPendingDto(updated);
}

export async function listTraces(campaignId: string, viewer: { userId: string; isDm: boolean }, limit = 50): Promise<RuleTraceDto[]> {
  const rows = await prisma.ruleTrace.findMany({
    where: viewer.isDm ? { campaignId } : { campaignId, character: { ownerUserId: viewer.userId } },
    include: { character: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, limit),
  });
  return rows.map(toTraceDto);
}

/** DM manually fires a rule (e.g. one with a Manual trigger) on a character. */
export async function triggerRuleManually(campaignId: string, dmUserId: string, characterId: string, ruleId: string): Promise<RuleTraceDto[]> {
  const rule = await prisma.ruleDefinition.findFirst({ where: { id: ruleId, campaignId } });
  if (!rule) throw notFound("Rule");
  if (!rule.publishedGraph) throw ruleViolation("Publish the rule before triggering it");
  const full = await loadFull(characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");
  const derived = derive(full);
  const state = buildRuleState(full, derived);
  const result = executeRule({ ruleId: rule.id, ruleName: rule.name, graph: rule.publishedGraph as unknown as RuleGraph, event: { type: "manual", ruleId: rule.id }, state, usage: {} });
  const trace = await prisma.ruleTrace.create({
    data: {
      campaignId,
      ruleId: rule.id,
      ruleName: rule.name,
      characterId,
      eventType: "manual",
      result: result as unknown as Prisma.InputJsonValue,
      status: result.fired ? "applied" : "noop",
      automationMode: "manual",
    },
    include: { character: { select: { name: true } } },
  });
  if (result.fired) {
    await applyEngineActions(characterId, result.actions, { ruleId: rule.id, ruleName: rule.name, actorUserId: dmUserId, depth: 1 });
  }
  const dto = toTraceDto(trace);
  emitToDmAndUser(campaignId, full.ownerUserId, "rules.traced", dto);
  return [dto];
}
