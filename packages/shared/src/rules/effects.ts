import { z } from "zod";
import {
  ATTRIBUTES,
  AUGMENTATION_SLOTS,
  DAMAGE_TYPES,
  SKILLS,
  SPECIAL_SKILLS,
} from "../constants.js";

/**
 * Stat targets a modifier may address. Stored as strings so new targets can be added
 * without a schema migration; validated with the regex below.
 *
 *   attr.<str|dex|con|int|wis|cha>      attribute score
 *   save.<attr>                         saving throw bonus
 *   skill.<skillKey>                    standard skill bonus
 *   special.<specialKey>                cyberpunk skill bonus
 *   ac | initiative | speed | maxHp | capacity | profBonus
 */
export const STAT_TARGET_RE = new RegExp(
  `^(attr\\.(${ATTRIBUTES.join("|")})|save\\.(${ATTRIBUTES.join("|")})|skill\\.(${SKILLS.join("|")})|special\\.(${SPECIAL_SKILLS.join("|")})|ac|initiative|speed|maxHp|capacity|profBonus)$`,
);

export const StatTargetSchema = z.string().regex(STAT_TARGET_RE, "Unknown stat target");
export type StatTarget = z.infer<typeof StatTargetSchema>;

export const ROLL_TARGET_RE = new RegExp(
  `^(save\\.(${ATTRIBUTES.join("|")})|skill\\.(${SKILLS.join("|")})|special\\.(${SPECIAL_SKILLS.join("|")})|initiative|attack|deathSave)$`,
);
export const RollTargetSchema = z.string().regex(ROLL_TARGET_RE, "Unknown roll target");

/** Numeric amount: fixed number or dice expression. */
export const AmountSchema = z.union([
  z.number().int().min(-10_000).max(10_000),
  z.string().min(1).max(40),
]);
export type Amount = z.infer<typeof AmountSchema>;

// ---------- Passive effects (persist while the source is active) ----------

export const ModifierEffectSchema = z.object({
  kind: z.literal("modifier"),
  target: StatTargetSchema,
  value: z.number().int().min(-100).max(100),
  /** add (default) stacks; setBase replaces the base figure (e.g. armor sets AC base to 13); min enforces a floor. */
  op: z.enum(["add", "setBase", "min"]).default("add"),
  /** Modifiers sharing a stackGroup on the same target do not stack: only the highest applies. */
  stackGroup: z.string().max(40).optional(),
  label: z.string().max(80).optional(),
});

export const ProficiencyEffectSchema = z.object({
  kind: z.literal("proficiency"),
  target: RollTargetSchema,
  level: z.enum(["proficient", "expertise"]),
});

export const AdvantageEffectSchema = z.object({
  kind: z.literal("advantage"),
  on: RollTargetSchema,
  mode: z.enum(["advantage", "disadvantage"]),
  note: z.string().max(120).optional(),
});

export const ResistanceEffectSchema = z.object({
  kind: z.literal("resistance"),
  damageType: z.enum(DAMAGE_TYPES),
  level: z.enum(["resistance", "vulnerability", "immunity"]),
});

export const SenseEffectSchema = z.object({
  kind: z.literal("sense"),
  name: z.string().min(1).max(40),
  rangeMeters: z.number().int().min(0).max(1000).optional(),
});

export const TraitEffectSchema = z.object({
  kind: z.literal("trait"),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
});

export const GrantAbilityEffectSchema = z.object({
  kind: z.literal("grantAbility"),
  abilityId: z.string().min(1),
});

export const PassiveEffectSchema = z.discriminatedUnion("kind", [
  ModifierEffectSchema,
  ProficiencyEffectSchema,
  AdvantageEffectSchema,
  ResistanceEffectSchema,
  SenseEffectSchema,
  TraitEffectSchema,
  GrantAbilityEffectSchema,
]);
export type PassiveEffect = z.infer<typeof PassiveEffectSchema>;
export type ModifierEffect = z.infer<typeof ModifierEffectSchema>;

// ---------- Instant effects (one-shot state changes) ----------

export const DamageEffectSchema = z.object({
  kind: z.literal("damage"),
  amount: AmountSchema,
  damageType: z.enum(DAMAGE_TYPES).default("physical"),
  ignoreResistance: z.boolean().default(false),
});
export const HealEffectSchema = z.object({ kind: z.literal("heal"), amount: AmountSchema });
export const TempHpEffectSchema = z.object({ kind: z.literal("tempHp"), amount: AmountSchema });
export const ApplyConditionEffectSchema = z.object({
  kind: z.literal("applyCondition"),
  conditionKey: z.string().min(1).max(60),
  durationTurns: z.number().int().min(1).max(1000).optional(),
  level: z.number().int().min(1).max(10).optional(),
});
export const RemoveConditionEffectSchema = z.object({
  kind: z.literal("removeCondition"),
  conditionKey: z.string().min(1).max(60),
});
export const ConsumeResourceEffectSchema = z.object({
  kind: z.literal("consumeResource"),
  resource: z.enum(["hitDice", "progressionPoints", "credits", "charges", "inspiration"]),
  amount: z.number().int().min(1).max(100_000),
});
export const GrantResourceEffectSchema = z.object({
  kind: z.literal("grantResource"),
  resource: z.enum(["xp", "progressionPoints", "credits", "inspiration"]),
  amount: z.number().int().min(1).max(1_000_000),
});
export const DisableAugmentationEffectSchema = z.object({
  kind: z.literal("disableAugmentation"),
  slot: z.enum([...AUGMENTATION_SLOTS, "random", "source"]).default("random"),
});
export const NotifyEffectSchema = z.object({
  kind: z.literal("notify"),
  message: z.string().min(1).max(300),
  audience: z.enum(["all", "dm", "owner"]).default("all"),
});
export const TemporaryEffectSchema = z.object({
  kind: z.literal("temporaryEffect"),
  label: z.string().min(1).max(80),
  effects: z.array(PassiveEffectSchema).max(20),
  /** null = lasts until the encounter ends or the DM clears it. */
  durationTurns: z.number().int().min(1).max(1000).nullable(),
  /** Instant effects applied when the temporary effect expires. */
  onExpiry: z.array(z.lazy(() => InstantEffectSchema)).max(10).default([]),
});

export const InstantEffectSchema: z.ZodType<InstantEffect> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    DamageEffectSchema,
    HealEffectSchema,
    TempHpEffectSchema,
    ApplyConditionEffectSchema,
    RemoveConditionEffectSchema,
    ConsumeResourceEffectSchema,
    GrantResourceEffectSchema,
    DisableAugmentationEffectSchema,
    NotifyEffectSchema,
    TemporaryEffectSchema,
  ]),
) as unknown as z.ZodType<InstantEffect>;

export type InstantEffect =
  | z.infer<typeof DamageEffectSchema>
  | z.infer<typeof HealEffectSchema>
  | z.infer<typeof TempHpEffectSchema>
  | z.infer<typeof ApplyConditionEffectSchema>
  | z.infer<typeof RemoveConditionEffectSchema>
  | z.infer<typeof ConsumeResourceEffectSchema>
  | z.infer<typeof GrantResourceEffectSchema>
  | z.infer<typeof DisableAugmentationEffectSchema>
  | z.infer<typeof NotifyEffectSchema>
  | TemporaryEffect;

export interface TemporaryEffect {
  kind: "temporaryEffect";
  label: string;
  effects: PassiveEffect[];
  durationTurns: number | null;
  onExpiry: InstantEffect[];
}

export const PassiveEffectListSchema = z.array(PassiveEffectSchema).max(30);
export const InstantEffectListSchema = z.array(InstantEffectSchema).max(30);

// ---------- Requirements (for items, augmentations, skill nodes) ----------

export const RequirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attribute"), attribute: z.enum(ATTRIBUTES), min: z.number().int().min(1).max(30) }),
  z.object({ kind: z.literal("specialRank"), skill: z.enum(SPECIAL_SKILLS), min: z.number().int().min(0).max(20) }),
  z.object({ kind: z.literal("level"), min: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("skillTreeNode"), nodeKey: z.string().min(1).max(60), minRank: z.number().int().min(1).default(1) }),
  z.object({ kind: z.literal("augmentationInstalled"), slot: z.enum(AUGMENTATION_SLOTS).optional(), definitionId: z.string().optional() }),
]);
export type Requirement = z.infer<typeof RequirementSchema>;
export const RequirementListSchema = z.array(RequirementSchema).max(10);

export function describeRequirement(r: Requirement): string {
  switch (r.kind) {
    case "attribute":
      return `${r.attribute.toUpperCase()} ${r.min}+`;
    case "specialRank":
      return `${r.skill} rank ${r.min}+`;
    case "level":
      return `Level ${r.min}+`;
    case "skillTreeNode":
      return `Node ${r.nodeKey}${r.minRank > 1 ? ` rank ${r.minRank}` : ""}`;
    case "augmentationInstalled":
      return r.slot ? `Augmentation in ${r.slot}` : "An installed augmentation";
  }
}

export function describePassiveEffect(e: PassiveEffect): string {
  switch (e.kind) {
    case "modifier": {
      const sign = e.value >= 0 ? "+" : "";
      const op = e.op === "setBase" ? "base " : e.op === "min" ? "min " : "";
      return `${op}${describeTarget(e.target)} ${sign}${e.value}`;
    }
    case "proficiency":
      return `${e.level === "expertise" ? "Expertise" : "Proficiency"} in ${describeTarget(e.target)}`;
    case "advantage":
      return `${e.mode === "advantage" ? "Advantage" : "Disadvantage"} on ${describeTarget(e.on)}${e.note ? ` (${e.note})` : ""}`;
    case "resistance":
      return `${e.level[0]?.toUpperCase()}${e.level.slice(1)} to ${e.damageType}`;
    case "sense":
      return e.rangeMeters ? `${e.name} ${e.rangeMeters} m` : e.name;
    case "trait":
      return e.name;
    case "grantAbility":
      return `Grants ability ${e.abilityId}`;
  }
}

export function describeTarget(target: string): string {
  const [group, key] = target.split(".");
  const pretty = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  if (!key) {
    return (
      {
        ac: "Armor Class",
        initiative: "Initiative",
        speed: "Speed",
        maxHp: "Max HP",
        capacity: "Cyberware Capacity",
        profBonus: "Proficiency Bonus",
        attack: "Attack rolls",
        deathSave: "Death saves",
      }[group ?? ""] ?? target
    );
  }
  switch (group) {
    case "attr":
      return key.toUpperCase();
    case "save":
      return `${key.toUpperCase()} saves`;
    case "skill":
    case "special":
      return pretty(key);
    default:
      return target;
  }
}
