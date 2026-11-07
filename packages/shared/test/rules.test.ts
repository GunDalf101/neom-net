import { describe, expect, it } from "vitest";
import {
  describeRuleGraph,
  executeRule,
  validateRuleGraph,
  type RuleCharacterState,
  type RuleGraph,
} from "../src/index.js";

/** Emergency Reflex Protocol: damage → HP < 30% → compatible aug active → once/encounter → +2 Reflex for 3 turns, strain on expiry. */
export const emergencyReflexGraph: RuleGraph = {
  version: 1,
  nodes: [
    { id: "t", type: "trigger.damageReceived", params: {}, position: { x: 0, y: 0 } },
    { id: "c1", type: "cond.hpBelowPercent", params: { percent: 30 }, position: { x: 200, y: 0 } },
    { id: "c2", type: "cond.augInstalled", params: { requireActive: true }, position: { x: 400, y: 0 } },
    { id: "cd", type: "flow.cooldown", params: { scope: "encounter", maxUses: 1 }, position: { x: 600, y: 0 } },
    { id: "d", type: "flow.duration", params: { turns: 3, label: "Emergency Reflex Protocol" }, position: { x: 800, y: 0 } },
    { id: "e1", type: "effect.modifier", params: { target: "special.reflex", value: 2, label: "Reflex surge" }, position: { x: 1000, y: 0 } },
    { id: "e2", type: "effect.modifier", params: { target: "speed", value: 3 }, position: { x: 1200, y: 0 } },
    { id: "x", type: "effect.applyCondition", params: { conditionKey: "mentalStrain", durationTurns: 2 }, position: { x: 1000, y: 200 } },
  ],
  edges: [
    { id: "1", source: "t", sourceHandle: "out", target: "c1", targetHandle: "in" },
    { id: "2", source: "c1", sourceHandle: "true", target: "c2", targetHandle: "in" },
    { id: "3", source: "c2", sourceHandle: "true", target: "cd", targetHandle: "in" },
    { id: "4", source: "cd", sourceHandle: "out", target: "d", targetHandle: "in" },
    { id: "5", source: "d", sourceHandle: "out", target: "e1", targetHandle: "in" },
    { id: "6", source: "e1", sourceHandle: "out", target: "e2", targetHandle: "in" },
    { id: "7", source: "d", sourceHandle: "onExpiry", target: "x", targetHandle: "in" },
  ],
};

const state: RuleCharacterState = {
  hpCurrent: 3,
  hpMax: 12,
  hpTemp: 0,
  attributes: { str: 14, dex: 18, con: 14, int: 16, wis: 12, cha: 10 },
  specialRanks: { augmentation: 0, reflex: 1, adaptability: 0, hacking: 2, sanity: 0, aura: 0 },
  equippedDefinitionIds: [],
  augmentations: [{ slot: "eyes", definitionId: "optics", active: true }],
  conditions: [],
  resources: { hitDice: 1, progressionPoints: 0, credits: 0, inspiration: 0 },
};

describe("graph validation", () => {
  it("accepts the demo rule", () => {
    const v = validateRuleGraph(emergencyReflexGraph);
    expect(v.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.triggerType).toBe("trigger.damageReceived");
  });
  it("rejects graphs without a trigger, with bad params, or with cycles", () => {
    const noTrigger = validateRuleGraph({ version: 1, nodes: [{ id: "a", type: "effect.heal", params: { amount: 5 } }], edges: [] });
    expect(noTrigger.valid).toBe(false);
    const badParam = validateRuleGraph({
      version: 1,
      nodes: [
        { id: "t", type: "trigger.manual", params: {} },
        { id: "c", type: "cond.hpBelowPercent", params: { percent: 500 } },
      ],
      edges: [{ id: "e", source: "t", sourceHandle: "out", target: "c", targetHandle: "in" }],
    });
    expect(badParam.issues.some((i) => i.nodeId === "c" && i.severity === "error")).toBe(true);
    const cyc = validateRuleGraph({
      version: 1,
      nodes: [
        { id: "t", type: "trigger.manual", params: {} },
        { id: "a", type: "effect.heal", params: { amount: 1 } },
        { id: "b", type: "effect.heal", params: { amount: 1 } },
      ],
      edges: [
        { id: "1", source: "t", sourceHandle: "out", target: "a", targetHandle: "in" },
        { id: "2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
        { id: "3", source: "b", sourceHandle: "out", target: "a", targetHandle: "in" },
      ],
    });
    expect(cyc.issues.some((i) => i.message.includes("cycle"))).toBe(true);
  });
  it("rejects type-mismatched connections and unconnected bool inputs", () => {
    const v = validateRuleGraph({
      version: 1,
      nodes: [
        { id: "t", type: "trigger.manual", params: {} },
        { id: "b", type: "flow.branch", params: {} },
        { id: "h", type: "effect.heal", params: { amount: 1 } },
      ],
      edges: [
        { id: "1", source: "t", sourceHandle: "out", target: "b", targetHandle: "in" },
        { id: "2", source: "t", sourceHandle: "out", target: "b", targetHandle: "condition" },
        { id: "3", source: "b", sourceHandle: "true", target: "h", targetHandle: "in" },
      ],
    });
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.message.includes("Cannot connect flow output to bool input"))).toBe(true);
  });
  it("produces a readable preview", () => {
    const lines = describeRuleGraph(emergencyReflexGraph);
    expect(lines[0]).toContain("On Damage Received");
    expect(lines.some((l) => l.includes("Duration"))).toBe(true);
  });
});

describe("engine execution", () => {
  const event = { type: "damageReceived" as const, damage: { amount: 6, damageType: "physical" as const }, hp: { before: 9, after: 3, max: 12 } };

  it("fires the demo rule and bundles a timed temporary effect with expiry", () => {
    const r = executeRule({ ruleId: "erp", ruleName: "Emergency Reflex Protocol", graph: emergencyReflexGraph, event, state, usage: {} });
    expect(r.triggered).toBe(true);
    expect(r.fired).toBe(true);
    const temp = r.actions.find((a) => a.kind === "temporary");
    expect(temp?.kind).toBe("temporary");
    if (temp?.kind === "temporary") {
      expect(temp.effect.durationTurns).toBe(3);
      expect(temp.effect.effects).toHaveLength(2);
      expect(temp.effect.onExpiry[0]).toMatchObject({ kind: "applyCondition", conditionKey: "mentalStrain" });
    }
    expect(r.actions.some((a) => a.kind === "cooldownUse")).toBe(true);
    expect(r.trace.map((t) => t.outcome)).toContain("passed");
  });

  it("is blocked when HP is not low enough and explains why", () => {
    const r = executeRule({ ruleId: "erp", ruleName: "ERP", graph: emergencyReflexGraph, event, state: { ...state, hpCurrent: 10 }, usage: {} });
    expect(r.fired).toBe(false);
    const blocked = r.trace.find((t) => t.outcome === "blocked");
    expect(blocked?.nodeId).toBe("c1");
  });

  it("respects the once-per-encounter cooldown", () => {
    const r = executeRule({ ruleId: "erp", ruleName: "ERP", graph: emergencyReflexGraph, event, state, usage: { "cd:encounter": 1 } });
    expect(r.fired).toBe(false);
    expect(r.trace.find((t) => t.nodeId === "cd")?.outcome).toBe("blocked");
  });

  it("requires an active augmentation", () => {
    const r = executeRule({
      ruleId: "erp",
      ruleName: "ERP",
      graph: emergencyReflexGraph,
      event,
      state: { ...state, augmentations: [{ slot: "eyes", definitionId: "optics", active: false }] },
      usage: {},
    });
    expect(r.fired).toBe(false);
  });

  it("does not trigger on unrelated events", () => {
    const r = executeRule({ ruleId: "erp", ruleName: "ERP", graph: emergencyReflexGraph, event: { type: "turnStart" }, state, usage: {} });
    expect(r.triggered).toBe(false);
  });

  it("matches HP threshold triggers only on crossing", () => {
    const g: RuleGraph = {
      version: 1,
      nodes: [
        { id: "t", type: "trigger.hpThreshold", params: { percent: 50, direction: "below" }, position: { x: 0, y: 0 } },
        { id: "n", type: "effect.notify", params: { message: "Bloodied", audience: "all" }, position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "1", source: "t", sourceHandle: "out", target: "n", targetHandle: "in" }],
    };
    const cross = executeRule({ ruleId: "x", ruleName: "x", graph: g, event: { type: "damageReceived", hp: { before: 7, after: 5, max: 12 } }, state, usage: {} });
    expect(cross.fired).toBe(true);
    const noCross = executeRule({ ruleId: "x", ruleName: "x", graph: g, event: { type: "damageReceived", hp: { before: 5, after: 3, max: 12 } }, state, usage: {} });
    expect(noCross.triggered).toBe(false);
  });

  it("evaluates logic nodes through bool edges and a branch", () => {
    const g: RuleGraph = {
      version: 1,
      nodes: [
        { id: "t", type: "trigger.manual", params: {}, position: { x: 0, y: 0 } },
        { id: "a", type: "cond.hasCondition", params: { conditionKey: "hacked" }, position: { x: 0, y: 0 } },
        { id: "b", type: "cond.attributeAtLeast", params: { attribute: "int", value: 15 }, position: { x: 0, y: 0 } },
        { id: "and", type: "cond.and", params: {}, position: { x: 0, y: 0 } },
        { id: "br", type: "flow.branch", params: {}, position: { x: 0, y: 0 } },
        { id: "h", type: "effect.heal", params: { amount: "1d4" }, position: { x: 0, y: 0 } },
        { id: "d", type: "effect.damage", params: { amount: 2, damageType: "neural" }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: "1", source: "t", sourceHandle: "out", target: "br", targetHandle: "in" },
        { id: "2", source: "a", sourceHandle: "value", target: "and", targetHandle: "a" },
        { id: "3", source: "b", sourceHandle: "value", target: "and", targetHandle: "b" },
        { id: "4", source: "and", sourceHandle: "value", target: "br", targetHandle: "condition" },
        { id: "5", source: "br", sourceHandle: "true", target: "h", targetHandle: "in" },
        { id: "6", source: "br", sourceHandle: "false", target: "d", targetHandle: "in" },
      ],
    };
    expect(validateRuleGraph(g).valid).toBe(true);
    const yes = executeRule({ ruleId: "l", ruleName: "l", graph: g, event: { type: "manual" }, state: { ...state, conditions: ["hacked"] }, usage: {} });
    expect(yes.actions[0]).toMatchObject({ kind: "instant", effect: { kind: "heal" } });
    const no = executeRule({ ruleId: "l", ruleName: "l", graph: g, event: { type: "manual" }, state, usage: {} });
    expect(no.actions[0]).toMatchObject({ kind: "instant", effect: { kind: "damage" } });
  });

  it("stops runaway execution at the step limit", () => {
    const nodes = [{ id: "t", type: "trigger.manual", params: {}, position: { x: 0, y: 0 } }];
    const edges = [] as RuleGraph["edges"];
    let prev = "t";
    let prevHandle = "out";
    for (let i = 0; i < 6; i++) {
      const id = `r${i}`;
      nodes.push({ id, type: "flow.repeat", params: { times: 5 }, position: { x: 0, y: 0 } });
      edges.push({ id: `e${i}`, source: prev, sourceHandle: prevHandle, target: id, targetHandle: "in" });
      prev = id;
      prevHandle = "out";
    }
    nodes.push({ id: "h", type: "effect.heal", params: { amount: 1 }, position: { x: 0, y: 0 } });
    edges.push({ id: "eh", source: prev, sourceHandle: "out", target: "h", targetHandle: "in" });
    const r = executeRule({ ruleId: "loop", ruleName: "loop", graph: { version: 1, nodes, edges }, event: { type: "manual" }, state, usage: {}, maxSteps: 100 });
    expect(r.stoppedReason).toContain("limit");
    expect(r.actions.length).toBeLessThan(100);
  });
});
