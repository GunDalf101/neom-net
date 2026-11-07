import type { AttributeKey, AugmentationSlot, DamageType, SpecialSkillKey } from "../constants.js";
import { secureDie } from "../mechanics/dice.js";
import type { InstantEffect, PassiveEffect, TemporaryEffect } from "./effects.js";
import { NODE_SPECS, type RuleEdge, type RuleGraph, type RuleNode } from "./graph.js";

/**
 * Deterministic, sandboxed interpreter for rule graphs.
 * It never mutates state: it returns the list of actions the server should apply
 * plus a trace the DM can inspect. Randomness is injectable for tests.
 */

export type TriggerEventType =
  | "damageReceived"
  | "healingReceived"
  | "hpThreshold"
  | "itemEquipped"
  | "itemRemoved"
  | "augInstalled"
  | "augDisabled"
  | "attack"
  | "skillCheck"
  | "turnStart"
  | "turnEnd"
  | "abilityActivated"
  | "conditionApplied"
  | "conditionRemoved"
  | "manual";

export interface TriggerEvent {
  type: TriggerEventType;
  damage?: { amount: number; damageType: DamageType };
  healing?: number;
  hp?: { before: number; after: number; max: number };
  definitionId?: string;
  slot?: AugmentationSlot;
  conditionKey?: string;
  abilityId?: string;
  rollTarget?: string;
  /** For manual triggers: restrict to one rule id. */
  ruleId?: string;
}

export interface RuleCharacterState {
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  attributes: Record<AttributeKey, number>;
  specialRanks: Record<SpecialSkillKey, number>;
  equippedDefinitionIds: string[];
  augmentations: { slot: AugmentationSlot; definitionId: string; active: boolean }[];
  conditions: string[];
  resources: { hitDice: number; progressionPoints: number; credits: number; inspiration: number };
}

export interface RuleExecutionInput {
  ruleId: string;
  ruleName: string;
  graph: RuleGraph;
  event: TriggerEvent;
  state: RuleCharacterState;
  /** Usage counters keyed by `${nodeId}:${scope}` for cooldown nodes. */
  usage: Record<string, number>;
  chance?: (percent: number) => boolean;
  maxSteps?: number;
}

export type EngineAction =
  | { kind: "instant"; effect: InstantEffect; nodeId: string }
  | { kind: "temporary"; effect: TemporaryEffect; nodeId: string }
  | { kind: "cooldownUse"; usageKey: string; scope: string; nodeId: string };

export type TraceOutcome = "matched" | "passed" | "blocked" | "applied" | "queued" | "skipped" | "error";

export interface TraceEntry {
  step: number;
  nodeId: string;
  nodeType: string;
  label: string;
  outcome: TraceOutcome;
  detail?: string;
}

export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  /** Trigger node matched the event. */
  triggered: boolean;
  /** At least one action was produced. */
  fired: boolean;
  actions: EngineAction[];
  trace: TraceEntry[];
  stoppedReason?: string;
}

export const DEFAULT_MAX_STEPS = 200;

const TRIGGER_NODE_TO_EVENT: Record<string, TriggerEventType> = {
  "trigger.damageReceived": "damageReceived",
  "trigger.healingReceived": "healingReceived",
  "trigger.hpThreshold": "hpThreshold",
  "trigger.itemEquipped": "itemEquipped",
  "trigger.itemRemoved": "itemRemoved",
  "trigger.augInstalled": "augInstalled",
  "trigger.augDisabled": "augDisabled",
  "trigger.attack": "attack",
  "trigger.skillCheck": "skillCheck",
  "trigger.turnStart": "turnStart",
  "trigger.turnEnd": "turnEnd",
  "trigger.abilityActivated": "abilityActivated",
  "trigger.conditionApplied": "conditionApplied",
  "trigger.conditionRemoved": "conditionRemoved",
  "trigger.manual": "manual",
};

function param<T>(node: RuleNode, key: string): T | undefined {
  return node.params[key] as T | undefined;
}

export function triggerMatches(node: RuleNode, event: TriggerEvent, ruleId: string): { matched: boolean; detail: string } {
  const eventType = TRIGGER_NODE_TO_EVENT[node.type];
  if (!eventType) return { matched: false, detail: "not a trigger" };

  if (node.type === "trigger.hpThreshold") {
    const pct = param<number>(node, "percent") ?? 0;
    const dir = param<"below" | "above">(node, "direction") ?? "below";
    const hp = event.hp;
    if (!hp || hp.max <= 0) return { matched: false, detail: "no HP change in event" };
    const threshold = (pct / 100) * hp.max;
    const crossed =
      dir === "below" ? hp.before >= threshold && hp.after < threshold : hp.before < threshold && hp.after >= threshold;
    return {
      matched: crossed,
      detail: `HP ${hp.before}→${hp.after} vs ${pct}% (${threshold.toFixed(1)}) ${dir}: ${crossed ? "crossed" : "not crossed"}`,
    };
  }
  if (eventType !== event.type) return { matched: false, detail: `event ${event.type} ≠ ${eventType}` };

  if (eventType === "manual" && event.ruleId && event.ruleId !== ruleId) {
    return { matched: false, detail: "manual trigger for a different rule" };
  }
  const checks: [string, unknown, unknown][] = [
    ["damageType", param(node, "damageType"), event.damage?.damageType],
    ["definitionId", param(node, "definitionId"), event.definitionId],
    ["slot", param(node, "slot"), event.slot],
    ["conditionKey", param(node, "conditionKey"), event.conditionKey],
    ["abilityId", param(node, "abilityId"), event.abilityId],
    ["target", param(node, "target"), event.rollTarget],
  ];
  for (const [name, expected, actual] of checks) {
    if (expected !== undefined && expected !== null && expected !== "" && expected !== actual) {
      return { matched: false, detail: `${name} ${String(actual)} ≠ ${String(expected)}` };
    }
  }
  return { matched: true, detail: `event ${event.type}` };
}

interface DurationFrame {
  nodeId: string;
  turns: number;
  label: string;
  passives: PassiveEffect[];
  expiry: InstantEffect[];
}

interface ExecContext {
  input: RuleExecutionInput;
  nodeById: Map<string, RuleNode>;
  edgesBySource: Map<string, RuleEdge[]>;
  edgesByTarget: Map<string, RuleEdge[]>;
  steps: number;
  maxSteps: number;
  trace: TraceEntry[];
  actions: EngineAction[];
  durationStack: DurationFrame[];
  expiryCollect?: InstantEffect[];
  boolMemo: Map<string, boolean>;
  stopped?: string;
}

function label(node: RuleNode): string {
  return NODE_SPECS[node.type]?.label ?? node.type;
}

function pushTrace(ctx: ExecContext, node: RuleNode, outcome: TraceOutcome, detail?: string) {
  ctx.trace.push({ step: ctx.trace.length + 1, nodeId: node.id, nodeType: node.type, label: label(node), outcome, detail });
}

function nextNodes(ctx: ExecContext, nodeId: string, handle: string): RuleNode[] {
  const edges = (ctx.edgesBySource.get(nodeId) ?? []).filter((e) => e.sourceHandle === handle);
  const nodes: RuleNode[] = [];
  for (const e of edges) {
    const n = ctx.nodeById.get(e.target);
    if (n) nodes.push(n);
  }
  return nodes;
}

function evalCondition(ctx: ExecContext, node: RuleNode, depth = 0): { value: boolean; detail: string } {
  const memo = ctx.boolMemo.get(node.id);
  if (memo !== undefined) return { value: memo, detail: "memoized" };
  if (depth > 20) return { value: false, detail: "condition nesting too deep" };
  const { state, event } = ctx.input;
  let value = false;
  let detail = "";

  const boolInput = (handle: string): boolean => {
    const edge = (ctx.edgesByTarget.get(node.id) ?? []).find((e) => e.targetHandle === handle);
    const src = edge ? ctx.nodeById.get(edge.source) : undefined;
    if (!src) return false;
    return evalCondition(ctx, src, depth + 1).value;
  };

  switch (node.type) {
    case "cond.hpBelowPercent": {
      const pct = param<number>(node, "percent") ?? 0;
      const threshold = (pct / 100) * state.hpMax;
      value = state.hpCurrent < threshold;
      detail = `HP ${state.hpCurrent}/${state.hpMax} < ${pct}% (${threshold.toFixed(1)})`;
      break;
    }
    case "cond.hpAbovePercent": {
      const pct = param<number>(node, "percent") ?? 0;
      const threshold = (pct / 100) * state.hpMax;
      value = state.hpCurrent >= threshold;
      detail = `HP ${state.hpCurrent}/${state.hpMax} ≥ ${pct}%`;
      break;
    }
    case "cond.attributeAtLeast": {
      const attr = param<AttributeKey>(node, "attribute") ?? "str";
      const min = param<number>(node, "value") ?? 0;
      value = (state.attributes[attr] ?? 0) >= min;
      detail = `${attr.toUpperCase()} ${state.attributes[attr]} ≥ ${min}`;
      break;
    }
    case "cond.specialRankAtLeast": {
      const skill = param<SpecialSkillKey>(node, "skill") ?? "reflex";
      const min = param<number>(node, "rank") ?? 0;
      value = (state.specialRanks[skill] ?? 0) >= min;
      detail = `${skill} rank ${state.specialRanks[skill]} ≥ ${min}`;
      break;
    }
    case "cond.itemEquipped": {
      const id = param<string>(node, "definitionId") ?? "";
      value = state.equippedDefinitionIds.includes(id);
      detail = `item ${id} ${value ? "equipped" : "not equipped"}`;
      break;
    }
    case "cond.augInstalled": {
      const slot = param<AugmentationSlot>(node, "slot");
      const defId = param<string>(node, "definitionId");
      const requireActive = param<boolean>(node, "requireActive") ?? true;
      const match = state.augmentations.find(
        (a) => (!slot || a.slot === slot) && (!defId || a.definitionId === defId) && (!requireActive || a.active),
      );
      value = Boolean(match);
      detail = match ? `found ${match.definitionId} in ${match.slot}` : "no matching augmentation";
      break;
    }
    case "cond.hasCondition": {
      const key = param<string>(node, "conditionKey") ?? "";
      value = state.conditions.includes(key);
      detail = `${key} ${value ? "present" : "absent"}`;
      break;
    }
    case "cond.damageTypeIs": {
      const t = param<string>(node, "damageType");
      value = event.damage?.damageType === t;
      detail = `damage type ${event.damage?.damageType ?? "none"} vs ${t}`;
      break;
    }
    case "cond.damageAtLeast": {
      const n = param<number>(node, "amount") ?? 0;
      value = (event.damage?.amount ?? 0) >= n;
      detail = `damage ${event.damage?.amount ?? 0} ≥ ${n}`;
      break;
    }
    case "cond.resourceAvailable": {
      const r = param<keyof RuleCharacterState["resources"]>(node, "resource") ?? "credits";
      const n = param<number>(node, "amount") ?? 0;
      value = (state.resources[r] ?? 0) >= n;
      detail = `${r} ${state.resources[r]} ≥ ${n}`;
      break;
    }
    case "cond.chance": {
      const pct = param<number>(node, "percent") ?? 50;
      const fn = ctx.input.chance ?? ((p: number) => secureDie(100) <= p);
      value = fn(pct);
      detail = `${pct}% chance → ${value ? "success" : "fail"}`;
      break;
    }
    case "cond.and":
      value = boolInput("a") && boolInput("b");
      detail = "AND";
      break;
    case "cond.or":
      value = boolInput("a") || boolInput("b");
      detail = "OR";
      break;
    case "cond.not":
      value = !boolInput("a");
      detail = "NOT";
      break;
    default:
      detail = `unknown condition ${node.type}`;
  }
  ctx.boolMemo.set(node.id, value);
  return { value, detail };
}

function effectFromNode(node: RuleNode): { passive?: PassiveEffect; instant?: InstantEffect } {
  const p = node.params as Record<string, unknown>;
  switch (node.type) {
    case "effect.modifier":
      return {
        passive: {
          kind: "modifier",
          target: p.target as string,
          value: p.value as number,
          op: "add",
          stackGroup: p.stackGroup as string | undefined,
          label: p.label as string | undefined,
        },
      };
    case "effect.advantage":
      return { passive: { kind: "advantage", on: p.on as string, mode: p.mode as "advantage" | "disadvantage" } };
    case "effect.resistance":
      return {
        passive: {
          kind: "resistance",
          damageType: p.damageType as DamageType,
          level: p.level as "resistance" | "vulnerability" | "immunity",
        },
      };
    case "effect.damage":
      return {
        instant: {
          kind: "damage",
          amount: p.amount as number | string,
          damageType: (p.damageType as DamageType | undefined) ?? "physical",
          ignoreResistance: Boolean(p.ignoreResistance),
        },
      };
    case "effect.heal":
      return { instant: { kind: "heal", amount: p.amount as number | string } };
    case "effect.tempHp":
      return { instant: { kind: "tempHp", amount: p.amount as number | string } };
    case "effect.applyCondition":
      return {
        instant: {
          kind: "applyCondition",
          conditionKey: p.conditionKey as string,
          durationTurns: p.durationTurns as number | undefined,
          level: p.level as number | undefined,
        },
      };
    case "effect.removeCondition":
      return { instant: { kind: "removeCondition", conditionKey: p.conditionKey as string } };
    case "effect.consumeResource":
      return {
        instant: {
          kind: "consumeResource",
          resource: p.resource as "hitDice" | "progressionPoints" | "credits" | "charges" | "inspiration",
          amount: p.amount as number,
        },
      };
    case "effect.grantResource":
      return {
        instant: {
          kind: "grantResource",
          resource: p.resource as "xp" | "progressionPoints" | "credits" | "inspiration",
          amount: p.amount as number,
        },
      };
    case "effect.disableAugmentation":
      return {
        instant: { kind: "disableAugmentation", slot: (p.slot as AugmentationSlot | "random" | "source" | undefined) ?? "random" },
      };
    case "effect.notify":
      return {
        instant: {
          kind: "notify",
          message: p.message as string,
          audience: (p.audience as "all" | "dm" | "owner" | undefined) ?? "all",
        },
      };
    default:
      return {};
  }
}

function execute(ctx: ExecContext, node: RuleNode): void {
  if (ctx.stopped) return;
  if (++ctx.steps > ctx.maxSteps) {
    ctx.stopped = `Execution limit of ${ctx.maxSteps} steps reached`;
    pushTrace(ctx, node, "error", ctx.stopped);
    return;
  }
  const spec = NODE_SPECS[node.type];
  if (!spec) {
    pushTrace(ctx, node, "error", `Unknown node type ${node.type}`);
    return;
  }
  const follow = (handle: string) => {
    for (const n of nextNodes(ctx, node.id, handle)) execute(ctx, n);
  };

  switch (spec.category) {
    case "trigger":
      follow("out");
      return;
    case "condition": {
      const { value, detail } = evalCondition(ctx, node);
      pushTrace(ctx, node, value ? "passed" : "blocked", detail);
      follow(value ? "true" : "false");
      return;
    }
    case "effect": {
      const { passive, instant } = effectFromNode(node);
      if (passive) {
        const frame = ctx.durationStack[ctx.durationStack.length - 1];
        if (frame) {
          frame.passives.push(passive);
          pushTrace(ctx, node, "queued", `${describe(passive)} for ${frame.turns} turns (${frame.label})`);
        } else {
          ctx.actions.push({
            kind: "temporary",
            nodeId: node.id,
            effect: { kind: "temporaryEffect", label: label(node), effects: [passive], durationTurns: null, onExpiry: [] },
          });
          pushTrace(ctx, node, "applied", `${describe(passive)} until cleared`);
        }
      } else if (instant) {
        if (ctx.expiryCollect) {
          ctx.expiryCollect.push(instant);
          pushTrace(ctx, node, "queued", `${instant.kind} on expiry`);
        } else {
          ctx.actions.push({ kind: "instant", nodeId: node.id, effect: instant });
          pushTrace(ctx, node, "applied", instant.kind);
        }
      } else {
        pushTrace(ctx, node, "error", "Effect node produced nothing");
      }
      follow("out");
      return;
    }
    case "flow":
      switch (node.type) {
        case "flow.sequence":
          pushTrace(ctx, node, "passed");
          for (const h of ["out1", "out2", "out3", "out4"]) follow(h);
          return;
        case "flow.branch": {
          const edge = (ctx.edgesByTarget.get(node.id) ?? []).find((e) => e.targetHandle === "condition");
          const src = edge ? ctx.nodeById.get(edge.source) : undefined;
          const value = src ? evalCondition(ctx, src).value : false;
          pushTrace(ctx, node, value ? "passed" : "blocked", src ? `${label(src)} → ${value}` : "no condition connected");
          follow(value ? "true" : "false");
          return;
        }
        case "flow.duration": {
          const frame: DurationFrame = {
            nodeId: node.id,
            turns: param<number>(node, "turns") ?? 1,
            label: param<string>(node, "label") ?? label(node),
            passives: [],
            expiry: [],
          };
          ctx.durationStack.push(frame);
          follow("out");
          ctx.durationStack.pop();
          const prevCollect = ctx.expiryCollect;
          ctx.expiryCollect = frame.expiry;
          follow("onExpiry");
          ctx.expiryCollect = prevCollect;
          if (frame.passives.length || frame.expiry.length) {
            const effect: TemporaryEffect = {
              kind: "temporaryEffect",
              label: frame.label,
              effects: frame.passives,
              durationTurns: frame.turns,
              onExpiry: frame.expiry,
            };
            if (ctx.expiryCollect) ctx.expiryCollect.push(effect);
            else ctx.actions.push({ kind: "temporary", nodeId: node.id, effect });
            pushTrace(ctx, node, "applied", `${frame.passives.length} passive effect(s), ${frame.expiry.length} on expiry, ${frame.turns} turns`);
          } else {
            pushTrace(ctx, node, "skipped", "no effects inside duration");
          }
          return;
        }
        case "flow.cooldown": {
          const scope = param<string>(node, "scope") ?? "encounter";
          const maxUses = param<number>(node, "maxUses") ?? 1;
          const usageKey = `${node.id}:${scope}`;
          const used = ctx.input.usage[usageKey] ?? 0;
          if (used >= maxUses) {
            pushTrace(ctx, node, "blocked", `${used}/${maxUses} uses per ${scope} already spent`);
            follow("exhausted");
            return;
          }
          ctx.actions.push({ kind: "cooldownUse", usageKey, scope, nodeId: node.id });
          pushTrace(ctx, node, "passed", `use ${used + 1}/${maxUses} per ${scope}`);
          follow("out");
          return;
        }
        case "flow.repeat": {
          const times = Math.min(5, Math.max(1, param<number>(node, "times") ?? 1));
          pushTrace(ctx, node, "passed", `×${times}`);
          for (let i = 0; i < times; i++) follow("out");
          return;
        }
        default:
          pushTrace(ctx, node, "error", `Unknown flow node ${node.type}`);
      }
  }
}

function describe(e: PassiveEffect): string {
  if (e.kind === "modifier") return `${e.target} ${e.value >= 0 ? "+" : ""}${e.value}`;
  if (e.kind === "advantage") return `${e.mode} on ${e.on}`;
  if (e.kind === "resistance") return `${e.level} to ${e.damageType}`;
  return e.kind;
}

export function executeRule(input: RuleExecutionInput): RuleExecutionResult {
  const nodeById = new Map(input.graph.nodes.map((n) => [n.id, n]));
  const edgesBySource = new Map<string, RuleEdge[]>();
  const edgesByTarget = new Map<string, RuleEdge[]>();
  for (const e of input.graph.edges) {
    edgesBySource.set(e.source, [...(edgesBySource.get(e.source) ?? []), e]);
    edgesByTarget.set(e.target, [...(edgesByTarget.get(e.target) ?? []), e]);
  }
  const trigger = input.graph.nodes.find((n) => NODE_SPECS[n.type]?.category === "trigger");
  const base = { ruleId: input.ruleId, ruleName: input.ruleName };
  if (!trigger) {
    return { ...base, triggered: false, fired: false, actions: [], trace: [], stoppedReason: "No trigger node" };
  }
  const ctx: ExecContext = {
    input,
    nodeById,
    edgesBySource,
    edgesByTarget,
    steps: 0,
    maxSteps: input.maxSteps ?? DEFAULT_MAX_STEPS,
    trace: [],
    actions: [],
    durationStack: [],
    boolMemo: new Map(),
  };
  const match = triggerMatches(trigger, input.event, input.ruleId);
  pushTrace(ctx, trigger, match.matched ? "matched" : "skipped", match.detail);
  if (!match.matched) return { ...base, triggered: false, fired: false, actions: [], trace: ctx.trace };
  execute(ctx, trigger);
  return {
    ...base,
    triggered: true,
    fired: ctx.actions.some((a) => a.kind !== "cooldownUse"),
    actions: ctx.actions,
    trace: ctx.trace,
    stoppedReason: ctx.stopped,
  };
}

export interface RuleCandidate {
  id: string;
  name: string;
  graph: RuleGraph;
}

/** Runs every candidate rule against one event. Results are in input order for determinism. */
export function runRules(
  rules: RuleCandidate[],
  event: TriggerEvent,
  state: RuleCharacterState,
  usage: Record<string, Record<string, number>>,
  chance?: (percent: number) => boolean,
): RuleExecutionResult[] {
  return rules.map((r) =>
    executeRule({ ruleId: r.id, ruleName: r.name, graph: r.graph, event, state, usage: usage[r.id] ?? {}, chance }),
  );
}
