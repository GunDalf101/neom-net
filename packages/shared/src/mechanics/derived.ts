import {
  ATTRIBUTES,
  ATTRIBUTE_META,
  DAMAGE_TYPES,
  DEFAULT_CYBERWARE_CAPACITY,
  DEFAULT_SPECIAL_MAX_RANK,
  DEFAULT_SPEED_METERS,
  SKILLS,
  SKILL_META,
  SPECIAL_SKILLS,
  SPECIAL_SKILL_META,
  type AttributeKey,
  type DamageType,
  type SkillKey,
  type SpecialSkillKey,
} from "../constants.js";
import type { ModifierEffect, PassiveEffect } from "../rules/effects.js";
import { abilityModifier, proficiencyBonus, type ProficiencyMultiplier } from "./formulas.js";

// ---------- Inputs ----------

export type EffectSourceKind =
  | "item"
  | "augmentation"
  | "condition"
  | "skillNode"
  | "temporary"
  | "ability"
  | "campaign";

export interface EffectSource {
  id: string;
  kind: EffectSourceKind;
  name: string;
  /** Inactive sources (disabled/damaged cyberware, unequipped items) contribute nothing. */
  active: boolean;
  effects: PassiveEffect[];
  /** Cyberware capacity consumed while installed, even if disabled. */
  capacityCost?: number;
  occupiesCapacity?: boolean;
}

export interface StatOverride {
  id: string;
  target: string;
  value: number;
  reason?: string | null;
}

export interface CampaignRuleSettings {
  specialMaxRank: number;
  specialExpertiseEnabled: boolean;
  nat20AutoSuccess: boolean;
  baseCapacity: number;
  baseSpeed: number;
  /** Optional campaign override for the proficiency bonus table (index = level-1). */
  proficiencyTable?: number[];
  /**
   * When true, players cannot change any character state (sheet, HP, conditions, items, cyberware,
   * progression). They can still view, roll dice and write journal notes. Overrides the flags below.
   */
  playersReadOnly: boolean;
  /**
   * Even in DM-controlled mode, players may manage their own inventory: equip, unequip, use consumables,
   * drop, rename and move items. Cyberware install/removal, quantities, charges and currency stay with the DM.
   */
  playersManageInventory: boolean;
  /** Even in DM-controlled mode, owners may upload or clear their own character's portrait. */
  playersManagePortrait: boolean;
  /** Whether players may edit their own base statistics. */
  playersEditAttributes: boolean;
  playersInstallCyberware: boolean;
  playersLevelUp: boolean;
  /** Default automation mode for rules without an explicit mode. */
  defaultAutomationMode: "automatic" | "assisted" | "manual";
  /** Death saves + temp HP follow 5e by default. */
  tempHpStacks: boolean;
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignRuleSettings = {
  specialMaxRank: DEFAULT_SPECIAL_MAX_RANK,
  specialExpertiseEnabled: true,
  nat20AutoSuccess: false,
  baseCapacity: DEFAULT_CYBERWARE_CAPACITY,
  baseSpeed: DEFAULT_SPEED_METERS,
  playersReadOnly: true,
  playersManageInventory: true,
  playersManagePortrait: true,
  playersEditAttributes: true,
  playersInstallCyberware: true,
  playersLevelUp: false,
  defaultAutomationMode: "automatic",
  tempHpStacks: false,
};

export interface CharacterSnapshot {
  level: number;
  attributes: Record<AttributeKey, number>;
  saveProficiencies: Record<AttributeKey, boolean>;
  skills: Record<SkillKey, ProficiencyMultiplier>;
  specialSkills: Record<SpecialSkillKey, { rank: number; proficiency: ProficiencyMultiplier }>;
  hpMaxBase: number;
  baseSpeed?: number;
  baseCapacity?: number;
  /** Unarmored base AC (default 10); the DM raises it for natural armor or house rules. */
  acBase?: number;
  /** Flat DM adjustment to AC, applied after every other source. */
  acBonus?: number;
  /** Cyberpsychosis points assigned by the DM; installed cyberware load is added automatically. */
  cyberpsychosisPoints?: number;
  sources: EffectSource[];
  overrides: StatOverride[];
  settings: CampaignRuleSettings;
}

// ---------- Outputs ----------

export type BreakdownKind =
  | "base"
  | "attribute"
  | "proficiency"
  | "rank"
  | "modifier"
  | "override"
  | "suppressed";

export interface BreakdownLine {
  label: string;
  value: number;
  kind: BreakdownKind;
  sourceId?: string;
  /** Present when a line did not count (stacking rule, replaced base). */
  suppressedReason?: string;
}

export interface StatValue {
  value: number;
  breakdown: BreakdownLine[];
  override?: { overrideId: string; original: number; reason?: string | null };
}

export interface RollFlag {
  on: string;
  mode: "advantage" | "disadvantage";
  sourceName: string;
  sourceId: string;
  note?: string;
}

export interface ResistanceEntry {
  damageType: DamageType;
  level: "resistance" | "vulnerability" | "immunity";
  sourceName: string;
}

export interface DerivedStats {
  attributes: Record<AttributeKey, StatValue>;
  modifiers: Record<AttributeKey, number>;
  profBonus: StatValue;
  saves: Record<AttributeKey, StatValue & { proficient: boolean }>;
  skills: Record<SkillKey, StatValue & { proficiency: ProficiencyMultiplier }>;
  specialSkills: Record<SpecialSkillKey, StatValue & { rank: number; proficiency: ProficiencyMultiplier }>;
  ac: StatValue;
  initiative: StatValue;
  speed: StatValue;
  maxHp: StatValue;
  capacity: StatValue;
  capacityUsed: number;
  /** Cyberpsychosis threshold: proficiency × level × 5 + Sanity + Augmentation (house rule). */
  cyberpsychosisMax: StatValue;
  /** Current load = DM-assigned points + installed cyberware capacity cost, shown as a percentage of the threshold. */
  cyberpsychosis: { points: number; fromCyberware: number; current: number; max: number; percent: number };
  rollFlags: RollFlag[];
  resistances: ResistanceEntry[];
  senses: { name: string; rangeMeters?: number; sourceName: string }[];
  traits: { name: string; description?: string; sourceName: string }[];
  grantedAbilityIds: string[];
  /** Roll targets with proficiency granted by effects (not by the character sheet). */
  grantedProficiencies: Record<string, "proficient" | "expertise">;
}

// ---------- Implementation ----------

interface ActiveModifier {
  effect: ModifierEffect;
  source: EffectSource;
}

function activeModifiers(sources: EffectSource[], target: string): ActiveModifier[] {
  const out: ActiveModifier[] = [];
  for (const source of sources) {
    if (!source.active) continue;
    for (const effect of source.effects) {
      if (effect.kind === "modifier" && effect.target === target) out.push({ effect, source });
    }
  }
  return out;
}

/**
 * Generic stat composition:
 *   1. base lines (optionally replaced by the highest `setBase` modifier)
 *   2. additive modifiers, with stackGroup de-duplication (highest wins per group)
 *   3. `min` floors
 *   4. DM override (replaces value, original kept in breakdown)
 */
function composeStat(
  target: string,
  baseLines: BreakdownLine[],
  sources: EffectSource[],
  overrides: StatOverride[],
): StatValue {
  const mods = activeModifiers(sources, target);
  const breakdown: BreakdownLine[] = [];

  const setBases = mods.filter((m) => m.effect.op === "setBase");
  if (setBases.length > 0) {
    const best = setBases.reduce((a, b) => (b.effect.value > a.effect.value ? b : a));
    for (const line of baseLines) {
      if (line.kind === "base") {
        breakdown.push({ ...line, kind: "suppressed", suppressedReason: `Replaced by ${best.source.name}` });
      } else {
        breakdown.push(line);
      }
    }
    breakdown.push({
      label: best.effect.label ?? `${best.source.name} (base)`,
      value: best.effect.value,
      kind: "base",
      sourceId: best.source.id,
    });
    for (const m of setBases) {
      if (m !== best) {
        breakdown.push({
          label: m.effect.label ?? `${m.source.name} (base)`,
          value: m.effect.value,
          kind: "suppressed",
          sourceId: m.source.id,
          suppressedReason: "Lower base replaced",
        });
      }
    }
  } else {
    breakdown.push(...baseLines);
  }

  const adds = mods.filter((m) => m.effect.op === "add");
  const groupBest = new Map<string, ActiveModifier>();
  for (const m of adds) {
    const g = m.effect.stackGroup;
    if (!g) continue;
    const cur = groupBest.get(g);
    if (!cur || m.effect.value > cur.effect.value) groupBest.set(g, m);
  }
  for (const m of adds) {
    const g = m.effect.stackGroup;
    const label = m.effect.label ?? m.source.name;
    if (g && groupBest.get(g) !== m) {
      breakdown.push({
        label,
        value: m.effect.value,
        kind: "suppressed",
        sourceId: m.source.id,
        suppressedReason: `Does not stack (${g})`,
      });
    } else {
      breakdown.push({ label, value: m.effect.value, kind: "modifier", sourceId: m.source.id });
    }
  }

  let value = breakdown.filter((l) => l.kind !== "suppressed").reduce((s, l) => s + l.value, 0);

  const mins = mods.filter((m) => m.effect.op === "min");
  for (const m of mins) {
    if (value < m.effect.value) {
      breakdown.push({
        label: `${m.effect.label ?? m.source.name} (minimum ${m.effect.value})`,
        value: m.effect.value - value,
        kind: "modifier",
        sourceId: m.source.id,
      });
      value = m.effect.value;
    }
  }

  const override = overrides.find((o) => o.target === target);
  if (override) {
    const original = value;
    breakdown.push({
      label: `DM override${override.reason ? `: ${override.reason}` : ""}`,
      value: override.value - original,
      kind: "override",
      sourceId: override.id,
    });
    return {
      value: override.value,
      breakdown,
      override: { overrideId: override.id, original, reason: override.reason ?? undefined },
    };
  }
  return { value, breakdown };
}

function grantedProficiencies(sources: EffectSource[]): Record<string, "proficient" | "expertise"> {
  const out: Record<string, "proficient" | "expertise"> = {};
  for (const s of sources) {
    if (!s.active) continue;
    for (const e of s.effects) {
      if (e.kind !== "proficiency") continue;
      const cur = out[e.target];
      if (!cur || (cur === "proficient" && e.level === "expertise")) out[e.target] = e.level;
    }
  }
  return out;
}

function multiplierFor(level: "proficient" | "expertise" | undefined): ProficiencyMultiplier {
  return level === "expertise" ? 2 : level === "proficient" ? 1 : 0;
}

export function computeDerivedStats(snap: CharacterSnapshot): DerivedStats {
  const { sources, overrides, settings } = snap;

  // Attributes
  const attributes = {} as Record<AttributeKey, StatValue>;
  const modifiers = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES) {
    attributes[a] = composeStat(
      `attr.${a}`,
      [{ label: `Base ${ATTRIBUTE_META[a].short}`, value: snap.attributes[a], kind: "base" }],
      sources,
      overrides,
    );
    modifiers[a] = abilityModifier(attributes[a].value);
  }

  // Proficiency bonus
  const tableValue = settings.proficiencyTable?.[Math.max(0, Math.min(19, snap.level - 1))];
  const baseProf = tableValue ?? proficiencyBonus(snap.level);
  const profBonus = composeStat(
    "profBonus",
    [{ label: `Level ${snap.level} proficiency`, value: baseProf, kind: "base" }],
    sources,
    overrides,
  );
  const pb = profBonus.value;

  const granted = grantedProficiencies(sources);

  // Saves
  const saves = {} as DerivedStats["saves"];
  for (const a of ATTRIBUTES) {
    const sheetProf = snap.saveProficiencies[a];
    const grantedLevel = granted[`save.${a}`];
    const proficient = sheetProf || grantedLevel !== undefined;
    const lines: BreakdownLine[] = [
      { label: `${ATTRIBUTE_META[a].short} modifier`, value: modifiers[a], kind: "attribute" },
    ];
    if (proficient) lines.push({ label: "Proficiency", value: pb, kind: "proficiency" });
    saves[a] = { ...composeStat(`save.${a}`, lines, sources, overrides), proficient };
  }

  // Skills
  const skills = {} as DerivedStats["skills"];
  for (const s of SKILLS) {
    const attr = SKILL_META[s].attribute;
    const own = snap.skills[s] ?? 0;
    const mult = Math.max(own, multiplierFor(granted[`skill.${s}`])) as ProficiencyMultiplier;
    const lines: BreakdownLine[] = [
      { label: `${ATTRIBUTE_META[attr].short} modifier`, value: modifiers[attr], kind: "attribute" },
    ];
    if (mult > 0) {
      lines.push({ label: mult === 2 ? "Expertise (×2)" : "Proficiency", value: mult * pb, kind: "proficiency" });
    }
    skills[s] = { ...composeStat(`skill.${s}`, lines, sources, overrides), proficiency: mult };
  }

  // Special skills
  const specialSkills = {} as DerivedStats["specialSkills"];
  for (const k of SPECIAL_SKILLS) {
    const attr = SPECIAL_SKILL_META[k].attribute;
    const own = snap.specialSkills[k] ?? { rank: 0, proficiency: 0 as ProficiencyMultiplier };
    const rank = Math.max(0, Math.min(settings.specialMaxRank, own.rank));
    let mult = Math.max(own.proficiency, multiplierFor(granted[`special.${k}`])) as ProficiencyMultiplier;
    if (!settings.specialExpertiseEnabled && mult === 2) mult = 1;
    const lines: BreakdownLine[] = [
      { label: `${ATTRIBUTE_META[attr].short} modifier`, value: modifiers[attr], kind: "attribute" },
      { label: `Rank ${rank}`, value: rank, kind: "rank" },
    ];
    if (mult > 0) {
      lines.push({ label: mult === 2 ? "Expertise (×2)" : "Proficiency", value: mult * pb, kind: "proficiency" });
    }
    specialSkills[k] = { ...composeStat(`special.${k}`, lines, sources, overrides), rank, proficiency: mult };
  }

  // Combat stats (homebrew additive model, see docs/ARCHITECTURE.md)
  const acLines: BreakdownLine[] = [
    { label: "Base AC", value: snap.acBase ?? 10, kind: "base" },
    { label: "DEX modifier", value: modifiers.dex, kind: "attribute" },
  ];
  if (snap.acBonus) acLines.push({ label: "DM adjustment", value: snap.acBonus, kind: "modifier" });
  const ac = composeStat("ac", acLines, sources, overrides);
  const initiative = composeStat(
    "initiative",
    [{ label: "DEX modifier", value: modifiers.dex, kind: "attribute" }],
    sources,
    overrides,
  );
  const speed = composeStat(
    "speed",
    [{ label: "Base speed", value: snap.baseSpeed ?? settings.baseSpeed, kind: "base" }],
    sources,
    overrides,
  );
  const maxHp = composeStat(
    "maxHp",
    [{ label: "Base max HP", value: snap.hpMaxBase, kind: "base" }],
    sources,
    overrides,
  );
  const capacity = composeStat(
    "capacity",
    [{ label: "Base capacity", value: snap.baseCapacity ?? settings.baseCapacity, kind: "base" }],
    sources,
    overrides,
  );
  const capacityUsed = sources
    .filter((s) => s.occupiesCapacity)
    .reduce((sum, s) => sum + (s.capacityCost ?? 0), 0);

  // Cyberpsychosis (house rule): threshold grows with experience and mental/physical conditioning.
  const cyberpsychosisMax = composeStat(
    "cyberpsychosisMax",
    [
      { label: `Proficiency ${pb} × level ${snap.level} × 5`, value: pb * snap.level * 5, kind: "base" },
      { label: "Sanity", value: specialSkills.sanity.value, kind: "modifier" },
      { label: "Augmentation", value: specialSkills.augmentation.value, kind: "modifier" },
    ],
    sources,
    overrides,
  );
  const psychPoints = Math.max(0, snap.cyberpsychosisPoints ?? 0);
  const psychMax = Math.max(1, cyberpsychosisMax.value);
  const psychCurrent = psychPoints + capacityUsed;
  const cyberpsychosis = { points: psychPoints, fromCyberware: capacityUsed, current: psychCurrent, max: psychMax, percent: Math.round((psychCurrent / psychMax) * 100) };

  // Flags and traits
  const rollFlags: RollFlag[] = [];
  const resistances: ResistanceEntry[] = [];
  const senses: DerivedStats["senses"] = [];
  const traits: DerivedStats["traits"] = [];
  const grantedAbilityIds: string[] = [];
  for (const s of sources) {
    if (!s.active) continue;
    for (const e of s.effects) {
      switch (e.kind) {
        case "advantage":
          rollFlags.push({ on: e.on, mode: e.mode, sourceName: s.name, sourceId: s.id, note: e.note });
          break;
        case "resistance":
          resistances.push({ damageType: e.damageType, level: e.level, sourceName: s.name });
          break;
        case "sense":
          senses.push({ name: e.name, rangeMeters: e.rangeMeters, sourceName: s.name });
          break;
        case "trait":
          traits.push({ name: e.name, description: e.description, sourceName: s.name });
          break;
        case "grantAbility":
          if (!grantedAbilityIds.includes(e.abilityId)) grantedAbilityIds.push(e.abilityId);
          break;
        default:
          break;
      }
    }
  }

  return {
    attributes,
    modifiers,
    profBonus,
    saves,
    skills,
    specialSkills,
    ac,
    initiative,
    speed,
    maxHp,
    capacity,
    capacityUsed,
    cyberpsychosisMax,
    cyberpsychosis,
    rollFlags,
    resistances,
    senses,
    traits,
    grantedAbilityIds,
    grantedProficiencies: granted,
  };
}

/** Effective resistance level after combining all sources: immunity > resistance/vulnerability cancel out. */
export function effectiveResistance(
  resistances: ResistanceEntry[],
  damageType: DamageType,
): "normal" | "resistance" | "vulnerability" | "immunity" {
  const relevant = resistances.filter((r) => r.damageType === damageType);
  if (relevant.some((r) => r.level === "immunity")) return "immunity";
  const res = relevant.some((r) => r.level === "resistance");
  const vul = relevant.some((r) => r.level === "vulnerability");
  if (res && vul) return "normal";
  if (res) return "resistance";
  if (vul) return "vulnerability";
  return "normal";
}

export interface DamageApplication {
  requested: number;
  damageType: DamageType;
  resistance: "normal" | "resistance" | "vulnerability" | "immunity";
  afterResistance: number;
  absorbedByTempHp: number;
  appliedToHp: number;
  hpBefore: number;
  hpAfter: number;
  tempBefore: number;
  tempAfter: number;
  steps: string[];
}

/** 5e-style damage: resistance halves (round down), vulnerability doubles, temp HP absorbs first. */
export function applyDamage(
  state: { hpCurrent: number; hpTemp: number },
  amount: number,
  damageType: DamageType,
  resistances: ResistanceEntry[],
  opts: { ignoreResistance?: boolean } = {},
): DamageApplication {
  const requested = Math.max(0, Math.floor(amount));
  const level = opts.ignoreResistance ? "normal" : effectiveResistance(resistances, damageType);
  const steps: string[] = [`Incoming ${requested} ${damageType} damage`];
  let after = requested;
  if (level === "immunity") {
    after = 0;
    steps.push("Immune: damage reduced to 0");
  } else if (level === "resistance") {
    after = Math.floor(requested / 2);
    steps.push(`Resistance: halved to ${after}`);
  } else if (level === "vulnerability") {
    after = requested * 2;
    steps.push(`Vulnerability: doubled to ${after}`);
  } else if (opts.ignoreResistance) {
    steps.push("Resistances ignored by DM");
  }
  const absorbed = Math.min(state.hpTemp, after);
  if (absorbed > 0) steps.push(`Temporary HP absorbs ${absorbed}`);
  const toHp = after - absorbed;
  const hpAfter = Math.max(0, state.hpCurrent - toHp);
  if (toHp > 0) steps.push(`HP ${state.hpCurrent} → ${hpAfter}`);
  return {
    requested,
    damageType,
    resistance: level,
    afterResistance: after,
    absorbedByTempHp: absorbed,
    appliedToHp: toHp,
    hpBefore: state.hpCurrent,
    hpAfter,
    tempBefore: state.hpTemp,
    tempAfter: state.hpTemp - absorbed,
    steps,
  };
}

export const ALL_DAMAGE_TYPES = DAMAGE_TYPES;
