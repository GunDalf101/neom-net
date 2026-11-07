import { z } from "zod";
import { ATTRIBUTES, AUGMENTATION_SLOTS, DAMAGE_TYPES, SPECIAL_SKILLS } from "../constants.js";
import { AmountSchema, RollTargetSchema, StatTargetSchema } from "./effects.js";

/**
 * Declarative rule graph. Nodes carry typed params validated by the node catalog below.
 * Two handle types exist:
 *   - flow: execution order (trigger → conditions/effects/flow control)
 *   - bool: a condition's boolean value fed into logic nodes or a Branch node
 */

export type HandleType = "flow" | "bool";
export type NodeCategory = "trigger" | "condition" | "effect" | "flow";

export interface HandleSpec {
  id: string;
  type: HandleType;
  label: string;
}

export interface NodeSpec {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: HandleSpec[];
  outputs: HandleSpec[];
  params: z.ZodTypeAny;
}

const flowIn: HandleSpec = { id: "in", type: "flow", label: "In" };
const flowOut: HandleSpec = { id: "out", type: "flow", label: "Then" };
const condOutputs: HandleSpec[] = [
  { id: "true", type: "flow", label: "True" },
  { id: "false", type: "flow", label: "False" },
  { id: "value", type: "bool", label: "Value" },
];

const none = z.object({}).strict();

function trigger(type: string, label: string, description: string, params: z.ZodTypeAny = none): NodeSpec {
  return { type, category: "trigger", label, description, inputs: [], outputs: [flowOut], params };
}
function condition(type: string, label: string, description: string, params: z.ZodTypeAny = none, boolInputs: string[] = []): NodeSpec {
  return {
    type,
    category: "condition",
    label,
    description,
    inputs: [flowIn, ...boolInputs.map((id) => ({ id, type: "bool" as const, label: id.toUpperCase() }))],
    outputs: condOutputs,
    params,
  };
}
function effect(type: string, label: string, description: string, params: z.ZodTypeAny): NodeSpec {
  return { type, category: "effect", label, description, inputs: [flowIn], outputs: [flowOut], params };
}

export const NODE_CATALOG: NodeSpec[] = [
  // ---- Triggers ----
  trigger("trigger.damageReceived", "On Damage Received", "Fires after the character takes damage.", z.object({ damageType: z.enum(DAMAGE_TYPES).optional() }).strict()),
  trigger("trigger.healingReceived", "On Healing Received", "Fires after the character is healed."),
  trigger("trigger.hpThreshold", "On HP Threshold", "Fires when HP crosses a percentage of maximum.", z.object({ percent: z.number().int().min(1).max(100), direction: z.enum(["below", "above"]) }).strict()),
  trigger("trigger.itemEquipped", "On Item Equipped", "Fires when an item is equipped.", z.object({ definitionId: z.string().optional() }).strict()),
  trigger("trigger.itemRemoved", "On Item Removed", "Fires when an item is unequipped.", z.object({ definitionId: z.string().optional() }).strict()),
  trigger("trigger.augInstalled", "On Augmentation Installed", "Fires when cyberware is installed.", z.object({ slot: z.enum(AUGMENTATION_SLOTS).optional() }).strict()),
  trigger("trigger.augDisabled", "On Augmentation Disabled", "Fires when cyberware is disabled or damaged.", z.object({ slot: z.enum(AUGMENTATION_SLOTS).optional() }).strict()),
  trigger("trigger.attack", "On Attack", "Fires when the character makes an attack roll."),
  trigger("trigger.skillCheck", "On Skill Check", "Fires when the character rolls a check or save.", z.object({ target: RollTargetSchema.optional() }).strict()),
  trigger("trigger.turnStart", "On Turn Start", "Fires at the start of the character's turn in an encounter."),
  trigger("trigger.turnEnd", "On Turn End", "Fires at the end of the character's turn in an encounter."),
  trigger("trigger.abilityActivated", "On Ability Activated", "Fires when an ability is used.", z.object({ abilityId: z.string().optional() }).strict()),
  trigger("trigger.conditionApplied", "On Condition Applied", "Fires when a condition is applied.", z.object({ conditionKey: z.string().optional() }).strict()),
  trigger("trigger.conditionRemoved", "On Condition Removed", "Fires when a condition is removed.", z.object({ conditionKey: z.string().optional() }).strict()),
  trigger("trigger.manual", "Manual (DM)", "Only fires when the DM triggers it explicitly."),

  // ---- Conditions ----
  condition("cond.hpBelowPercent", "HP Below %", "True when current HP is below a percentage of max.", z.object({ percent: z.number().int().min(1).max(100) }).strict()),
  condition("cond.hpAbovePercent", "HP Above %", "True when current HP is at or above a percentage of max.", z.object({ percent: z.number().int().min(1).max(100) }).strict()),
  condition("cond.attributeAtLeast", "Attribute ≥", "True when an attribute score meets a threshold.", z.object({ attribute: z.enum(ATTRIBUTES), value: z.number().int().min(1).max(30) }).strict()),
  condition("cond.specialRankAtLeast", "Skill Rank ≥", "True when a cyberpunk skill rank meets a threshold.", z.object({ skill: z.enum(SPECIAL_SKILLS), rank: z.number().int().min(0).max(20) }).strict()),
  condition("cond.itemEquipped", "Item Equipped", "True when a specific item definition is equipped.", z.object({ definitionId: z.string().min(1) }).strict()),
  condition("cond.augInstalled", "Augmentation Installed", "True when an augmentation is installed (optionally in a slot or a specific definition).", z.object({ slot: z.enum(AUGMENTATION_SLOTS).optional(), definitionId: z.string().optional(), requireActive: z.boolean().default(true) }).strict()),
  condition("cond.hasCondition", "Has Condition", "True when the character has the condition.", z.object({ conditionKey: z.string().min(1) }).strict()),
  condition("cond.damageTypeIs", "Damage Type Is", "True when the triggering damage matches the type.", z.object({ damageType: z.enum(DAMAGE_TYPES) }).strict()),
  condition("cond.damageAtLeast", "Damage ≥", "True when the triggering damage is at least the amount.", z.object({ amount: z.number().int().min(1).max(10_000) }).strict()),
  condition("cond.resourceAvailable", "Resource Available", "True when the character has enough of a resource.", z.object({ resource: z.enum(["hitDice", "progressionPoints", "credits", "inspiration"]), amount: z.number().int().min(1) }).strict()),
  condition("cond.chance", "Random Chance", "True with the given percentage chance.", z.object({ percent: z.number().int().min(1).max(99) }).strict()),
  condition("cond.and", "AND", "True when both inputs are true.", none, ["a", "b"]),
  condition("cond.or", "OR", "True when either input is true.", none, ["a", "b"]),
  condition("cond.not", "NOT", "Inverts the input.", none, ["a"]),

  // ---- Effects ----
  effect("effect.modifier", "Stat Modifier", "Adds a bonus or penalty to a statistic for the duration.", z.object({ target: StatTargetSchema, value: z.number().int().min(-100).max(100), stackGroup: z.string().max(40).optional(), label: z.string().max(80).optional() }).strict()),
  effect("effect.advantage", "Advantage / Disadvantage", "Grants advantage or disadvantage on a roll type for the duration.", z.object({ on: RollTargetSchema, mode: z.enum(["advantage", "disadvantage"]) }).strict()),
  effect("effect.resistance", "Resistance", "Grants resistance, vulnerability or immunity for the duration.", z.object({ damageType: z.enum(DAMAGE_TYPES), level: z.enum(["resistance", "vulnerability", "immunity"]) }).strict()),
  effect("effect.damage", "Deal Damage", "Deals damage to the character.", z.object({ amount: AmountSchema, damageType: z.enum(DAMAGE_TYPES).default("physical"), ignoreResistance: z.boolean().default(false) }).strict()),
  effect("effect.heal", "Heal", "Restores HP.", z.object({ amount: AmountSchema }).strict()),
  effect("effect.tempHp", "Temporary HP", "Grants temporary HP.", z.object({ amount: AmountSchema }).strict()),
  effect("effect.applyCondition", "Apply Condition", "Applies a condition.", z.object({ conditionKey: z.string().min(1), durationTurns: z.number().int().min(1).max(1000).optional(), level: z.number().int().min(1).max(10).optional() }).strict()),
  effect("effect.removeCondition", "Remove Condition", "Removes a condition.", z.object({ conditionKey: z.string().min(1) }).strict()),
  effect("effect.consumeResource", "Consume Resource", "Spends a resource.", z.object({ resource: z.enum(["hitDice", "progressionPoints", "credits", "charges", "inspiration"]), amount: z.number().int().min(1) }).strict()),
  effect("effect.grantResource", "Grant Resource", "Grants XP, credits, points or inspiration.", z.object({ resource: z.enum(["xp", "progressionPoints", "credits", "inspiration"]), amount: z.number().int().min(1) }).strict()),
  effect("effect.disableAugmentation", "Disable Augmentation", "Disables installed cyberware.", z.object({ slot: z.enum([...AUGMENTATION_SLOTS, "random", "source"]).default("random") }).strict()),
  effect("effect.notify", "Notify", "Sends a message to the table.", z.object({ message: z.string().min(1).max(300), audience: z.enum(["all", "dm", "owner"]).default("all") }).strict()),

  // ---- Flow control ----
  {
    type: "flow.sequence",
    category: "flow",
    label: "Sequence",
    description: "Runs each output in order.",
    inputs: [flowIn],
    outputs: [
      { id: "out1", type: "flow", label: "1" },
      { id: "out2", type: "flow", label: "2" },
      { id: "out3", type: "flow", label: "3" },
      { id: "out4", type: "flow", label: "4" },
    ],
    params: none,
  },
  {
    type: "flow.branch",
    category: "flow",
    label: "Branch",
    description: "Routes by a boolean input from condition nodes.",
    inputs: [flowIn, { id: "condition", type: "bool", label: "Condition" }],
    outputs: [
      { id: "true", type: "flow", label: "True" },
      { id: "false", type: "flow", label: "False" },
    ],
    params: none,
  },
  {
    type: "flow.duration",
    category: "flow",
    label: "Duration",
    description: "Passive effects downstream last this many turns; the expiry branch runs when it ends.",
    inputs: [flowIn],
    outputs: [flowOut, { id: "onExpiry", type: "flow", label: "On Expiry" }],
    params: z.object({ turns: z.number().int().min(1).max(1000), label: z.string().min(1).max(80) }).strict(),
  },
  {
    type: "flow.cooldown",
    category: "flow",
    label: "Cooldown / Uses",
    description: "Limits how often the downstream branch can run.",
    inputs: [flowIn],
    outputs: [flowOut, { id: "exhausted", type: "flow", label: "Exhausted" }],
    params: z.object({ scope: z.enum(["turn", "encounter", "rest", "session", "ever"]), maxUses: z.number().int().min(1).max(100).default(1) }).strict(),
  },
  {
    type: "flow.repeat",
    category: "flow",
    label: "Repeat",
    description: "Runs the downstream branch a fixed number of times (max 5).",
    inputs: [flowIn],
    outputs: [flowOut],
    params: z.object({ times: z.number().int().min(1).max(5) }).strict(),
  },
];

export const NODE_SPECS: Record<string, NodeSpec> = Object.fromEntries(NODE_CATALOG.map((n) => [n.type, n]));
export const TRIGGER_TYPES = NODE_CATALOG.filter((n) => n.category === "trigger").map((n) => n.type);

export const RuleNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  params: z.record(z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
});
export type RuleNode = z.infer<typeof RuleNodeSchema>;

export const RuleEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().min(1),
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  targetHandle: z.string().min(1),
});
export type RuleEdge = z.infer<typeof RuleEdgeSchema>;

export const MAX_GRAPH_NODES = 60;
export const MAX_GRAPH_EDGES = 120;

export const RuleGraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(RuleNodeSchema).max(MAX_GRAPH_NODES),
  edges: z.array(RuleEdgeSchema).max(MAX_GRAPH_EDGES),
});
export type RuleGraph = z.infer<typeof RuleGraphSchema>;

export interface GraphIssue {
  severity: "error" | "warning";
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface GraphValidation {
  valid: boolean;
  issues: GraphIssue[];
  triggerType?: string;
}

const PASSIVE_EFFECT_NODES = new Set(["effect.modifier", "effect.advantage", "effect.resistance"]);

/** Structural + parameter validation. Deterministic, no side effects. */
export function validateRuleGraph(input: unknown): GraphValidation {
  const issues: GraphIssue[] = [];
  const parsed = RuleGraphSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ severity: "error", message: `${i.path.join(".")}: ${i.message}` });
    return { valid: false, issues };
  }
  const graph = parsed.data;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  if (nodeById.size !== graph.nodes.length) issues.push({ severity: "error", message: "Duplicate node ids" });

  const triggers = graph.nodes.filter((n) => NODE_SPECS[n.type]?.category === "trigger");
  if (triggers.length === 0) issues.push({ severity: "error", message: "A rule needs exactly one trigger node" });
  if (triggers.length > 1) issues.push({ severity: "error", message: "Only one trigger node is allowed per rule" });

  for (const n of graph.nodes) {
    const spec = NODE_SPECS[n.type];
    if (!spec) {
      issues.push({ severity: "error", nodeId: n.id, message: `Unknown node type ${n.type}` });
      continue;
    }
    const p = spec.params.safeParse(n.params);
    if (!p.success) {
      for (const i of p.error.issues) {
        issues.push({ severity: "error", nodeId: n.id, message: `${spec.label}: ${i.path.join(".") || "params"} ${i.message}` });
      }
    }
  }

  // Edge validation
  const outgoingFlow = new Map<string, RuleEdge[]>(); // key: node:handle
  const incomingBool = new Map<string, RuleEdge[]>();
  for (const e of graph.edges) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) {
      issues.push({ severity: "error", edgeId: e.id, message: "Edge references a missing node" });
      continue;
    }
    const sSpec = NODE_SPECS[s.type];
    const tSpec = NODE_SPECS[t.type];
    if (!sSpec || !tSpec) continue;
    const out = sSpec.outputs.find((h) => h.id === e.sourceHandle);
    const inp = tSpec.inputs.find((h) => h.id === e.targetHandle);
    if (!out) issues.push({ severity: "error", edgeId: e.id, message: `${sSpec.label} has no output "${e.sourceHandle}"` });
    if (!inp) issues.push({ severity: "error", edgeId: e.id, message: `${tSpec.label} has no input "${e.targetHandle}"` });
    if (out && inp && out.type !== inp.type) {
      issues.push({ severity: "error", edgeId: e.id, message: `Cannot connect ${out.type} output to ${inp.type} input` });
    }
    if (out?.type === "flow") {
      const key = `${e.source}:${e.sourceHandle}`;
      const list = outgoingFlow.get(key) ?? [];
      list.push(e);
      outgoingFlow.set(key, list);
    }
    if (inp?.type === "bool") {
      const key = `${e.target}:${e.targetHandle}`;
      const list = incomingBool.get(key) ?? [];
      list.push(e);
      incomingBool.set(key, list);
    }
  }
  for (const [key, list] of outgoingFlow) {
    if (list.length > 1) {
      const [nodeId] = key.split(":");
      issues.push({ severity: "error", nodeId, message: "A flow output can only connect to one node. Use a Sequence node to fan out." });
    }
  }
  for (const n of graph.nodes) {
    const spec = NODE_SPECS[n.type];
    if (!spec) continue;
    for (const h of spec.inputs) {
      if (h.type !== "bool") continue;
      const list = incomingBool.get(`${n.id}:${h.id}`) ?? [];
      if (list.length === 0) issues.push({ severity: "error", nodeId: n.id, message: `${spec.label}: input "${h.label}" needs a condition connected` });
      if (list.length > 1) issues.push({ severity: "error", nodeId: n.id, message: `${spec.label}: input "${h.label}" has multiple connections` });
    }
  }

  // Cycle detection (flow and bool graphs separately)
  const detectCycle = (type: HandleType): string | undefined => {
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const s = nodeById.get(e.source);
      const spec = s ? NODE_SPECS[s.type] : undefined;
      const out = spec?.outputs.find((h) => h.id === e.sourceHandle);
      if (out?.type !== type) continue;
      const list = adj.get(e.source) ?? [];
      list.push(e.target);
      adj.set(e.source, list);
    }
    const state = new Map<string, 1 | 2>();
    const visit = (id: string): string | undefined => {
      const st = state.get(id);
      if (st === 1) return id;
      if (st === 2) return undefined;
      state.set(id, 1);
      for (const next of adj.get(id) ?? []) {
        const found = visit(next);
        if (found) return found;
      }
      state.set(id, 2);
      return undefined;
    };
    for (const n of graph.nodes) {
      const found = visit(n.id);
      if (found) return found;
    }
    return undefined;
  };
  const flowCycle = detectCycle("flow");
  if (flowCycle) issues.push({ severity: "error", nodeId: flowCycle, message: "Execution cycle detected. Rules must flow in one direction; use Repeat for bounded loops." });
  const boolCycle = detectCycle("bool");
  if (boolCycle) issues.push({ severity: "error", nodeId: boolCycle, message: "Condition value cycle detected" });

  // Reachability from the trigger
  if (triggers.length === 1) {
    const start = triggers[0] as RuleNode;
    const reach = new Set<string>([start.id]);
    const stack = [start.id];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const e of graph.edges) {
        if (e.source !== cur) continue;
        if (!reach.has(e.target)) {
          reach.add(e.target);
          stack.push(e.target);
        }
      }
    }
    const feedsBool = new Set(graph.edges.filter((e) => incomingBool.has(`${e.target}:${e.targetHandle}`)).map((e) => e.source));
    for (const n of graph.nodes) {
      if (!reach.has(n.id) && !feedsBool.has(n.id)) {
        issues.push({ severity: "warning", nodeId: n.id, message: "Node is not connected to the trigger and will never run" });
      }
    }
    // Passive effects outside a Duration node
    const insideDuration = new Set<string>();
    for (const d of graph.nodes.filter((n) => n.type === "flow.duration")) {
      const st = graph.edges.filter((e) => e.source === d.id && e.sourceHandle === "out").map((e) => e.target);
      while (st.length) {
        const cur = st.pop() as string;
        if (insideDuration.has(cur)) continue;
        insideDuration.add(cur);
        for (const e of graph.edges) if (e.source === cur) st.push(e.target);
      }
    }
    for (const n of graph.nodes) {
      if (PASSIVE_EFFECT_NODES.has(n.type) && reach.has(n.id) && !insideDuration.has(n.id)) {
        issues.push({ severity: "warning", nodeId: n.id, message: "Passive effect has no Duration node upstream; it will last until the encounter ends or the DM clears it" });
      }
    }
  }

  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
    triggerType: triggers[0]?.type,
  };
}

/** Human-readable preview of a graph in execution order. */
export function describeRuleGraph(graph: RuleGraph): string[] {
  const lines: string[] = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const trig = graph.nodes.find((n) => NODE_SPECS[n.type]?.category === "trigger");
  if (!trig) return ["(no trigger)"];
  const seen = new Set<string>();
  const walk = (id: string, depth: number, viaLabel?: string) => {
    if (seen.has(id) || depth > 30) return;
    seen.add(id);
    const n = nodeById.get(id);
    if (!n) return;
    const spec = NODE_SPECS[n.type];
    const params = Object.entries(n.params)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(", ");
    lines.push(`${"  ".repeat(depth)}${viaLabel ? `[${viaLabel}] ` : ""}${spec?.label ?? n.type}${params ? ` (${params})` : ""}`);
    const outs = graph.edges.filter((e) => e.source === id);
    for (const e of outs) {
      const h = spec?.outputs.find((o) => o.id === e.sourceHandle);
      if (h?.type === "flow") walk(e.target, depth + 1, h.label);
    }
  };
  walk(trig.id, 0);
  return lines;
}
