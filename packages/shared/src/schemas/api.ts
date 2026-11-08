import { z } from "zod";
import {
  ATTRIBUTES,
  AUGMENTATION_SLOTS,
  AUTOMATION_MODES,
  DAMAGE_TYPES,
  EQUIPMENT_SLOTS,
  ITEM_CATEGORIES,
  RARITIES,
  ROLL_CATEGORIES,
  ROLL_VISIBILITIES,
  SKILLS,
  SPECIAL_SKILLS,
} from "../constants.js";
import {
  InstantEffectListSchema,
  PassiveEffectListSchema,
  RequirementListSchema,
  RollTargetSchema,
  StatTargetSchema,
} from "../rules/effects.js";
import { RuleGraphSchema } from "../rules/graph.js";

// ---------- Auth ----------
export const RegisterSchema = z.object({
  email: z.string().email().max(200),
  /** Handle shown to other players. Optional: defaults to the email's local part. */
  username: z
    .string()
    .trim()
    .max(32)
    .regex(/^[a-zA-Z0-9_\-.]*$/, "Handle may only contain letters, numbers, _ - . (no @)")
    .optional(),
  password: z.string().min(4, "Passphrase must be at least 4 characters").max(200),
});
export const LoginSchema = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

// ---------- Campaigns ----------
export const CampaignSettingsSchema = z.object({
  specialMaxRank: z.number().int().min(1).max(20),
  specialExpertiseEnabled: z.boolean(),
  nat20AutoSuccess: z.boolean(),
  baseCapacity: z.number().int().min(0).max(100),
  baseSpeed: z.number().int().min(0).max(100),
  proficiencyTable: z.array(z.number().int().min(0).max(20)).length(20).optional(),
  playersReadOnly: z.boolean(),
  playersManageInventory: z.boolean(),
  playersManagePortrait: z.boolean(),
  playersEditAttributes: z.boolean(),
  playersInstallCyberware: z.boolean(),
  playersLevelUp: z.boolean(),
  defaultAutomationMode: z.enum(AUTOMATION_MODES),
  tempHpStacks: z.boolean(),
});
export const CreateCampaignSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).default(""),
});
export const UpdateCampaignSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(2000).optional(),
  settings: CampaignSettingsSchema.partial().optional(),
});
export const JoinCampaignSchema = z.object({ inviteCode: z.string().min(4).max(32) });

// ---------- Characters ----------
const Prof = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const AttributesSchema = z.object(
  Object.fromEntries(ATTRIBUTES.map((a) => [a, z.number().int().min(1).max(30)])) as Record<
    (typeof ATTRIBUTES)[number],
    z.ZodNumber
  >,
);
export const SaveProficienciesSchema = z.object(
  Object.fromEntries(ATTRIBUTES.map((a) => [a, z.boolean()])) as Record<(typeof ATTRIBUTES)[number], z.ZodBoolean>,
);
export const SkillsSchema = z.object(
  Object.fromEntries(SKILLS.map((s) => [s, Prof])) as Record<(typeof SKILLS)[number], typeof Prof>,
);
const SpecialEntry = z.object({ rank: z.number().int().min(0).max(20), proficiency: Prof });
export const SpecialSkillsSchema = z.object(
  Object.fromEntries(SPECIAL_SKILLS.map((s) => [s, SpecialEntry])) as Record<
    (typeof SPECIAL_SKILLS)[number],
    typeof SpecialEntry
  >,
);

const PortraitSchema = z
  .string()
  .max(1_500_000)
  .refine((v) => v === "" || v.startsWith("data:image/") || /^https?:\/\//.test(v), "Portrait must be an image data URL or http(s) URL")
  .nullable();

export const CharacterIdentitySchema = z.object({
  name: z.string().min(1).max(60),
  species: z.string().max(40),
  characterClass: z.string().max(40),
  subclass: z.string().max(40),
  faction: z.string().max(60),
  alignment: z.string().max(40),
  background: z.string().max(60),
  biography: z.string().max(5000),
  portraitUrl: PortraitSchema,
});

export const CreateCharacterSchema = CharacterIdentitySchema.partial().extend({
  name: z.string().min(1).max(60),
  campaignId: z.string().min(1),
  level: z.number().int().min(1).max(20).optional(),
  attributes: AttributesSchema.optional(),
  hpMaxBase: z.number().int().min(1).max(999).optional(),
  hitDieSize: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]).optional(),
});

export const UpdateCharacterSchema = CharacterIdentitySchema.partial().extend({
  level: z.number().int().min(1).max(20).optional(),
  xp: z.number().int().min(0).max(10_000_000).optional(),
  attributes: AttributesSchema.optional(),
  saveProficiencies: SaveProficienciesSchema.partial().optional(),
  skills: SkillsSchema.partial().optional(),
  specialSkills: SpecialSkillsSchema.partial().optional(),
  hpMaxBase: z.number().int().min(1).max(999).optional(),
  baseSpeed: z.number().int().min(0).max(100).nullable().optional(),
  hitDieSize: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]).optional(),
  /** DM only: unarmored base AC and a flat adjustment. */
  acBase: z.number().int().min(0).max(30).optional(),
  acBonus: z.number().int().min(-20).max(20).optional(),
  /** DM only: cyberpsychosis points (cyberware load is added automatically). */
  cyberpsychosis: z.number().int().min(0).max(999).optional(),
  inspiration: z.boolean().optional(),
  credits: z.number().int().min(0).max(100_000_000).optional(),
  progressionPoints: z.number().int().min(0).max(10_000).optional(),
  /** Optimistic concurrency: reject if the server version differs. */
  expectedVersion: z.number().int().optional(),
});

export const HpActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("damage"),
    amount: z.number().int().min(0).max(10_000),
    damageType: z.enum(DAMAGE_TYPES).default("physical"),
    ignoreResistance: z.boolean().default(false),
    note: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal("heal"), amount: z.number().int().min(0).max(10_000), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("setCurrent"), value: z.number().int().min(0).max(9999) }),
  z.object({ action: z.literal("setMax"), value: z.number().int().min(1).max(999) }),
  z.object({ action: z.literal("addTemp"), amount: z.number().int().min(1).max(999) }),
  z.object({ action: z.literal("clearTemp") }),
  z.object({ action: z.literal("deathSave"), result: z.enum(["success", "failure", "reset"]) }),
  z.object({ action: z.literal("hitDice"), op: z.enum(["spend", "restore", "restoreAll"]), count: z.number().int().min(1).max(20).default(1) }),
  z.object({ action: z.literal("rest"), kind: z.enum(["short", "long"]) }),
]);
export type HpAction = z.infer<typeof HpActionSchema>;
/** What clients send (defaults may be omitted). */
export type HpActionInput = z.input<typeof HpActionSchema>;

export const ApplyConditionSchema = z.object({
  conditionKey: z.string().min(1).max(60),
  durationTurns: z.number().int().min(1).max(1000).nullable().optional(),
  level: z.number().int().min(1).max(10).optional(),
  note: z.string().max(200).optional(),
});

export const ConditionDefinitionInputSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "camelCase key"),
  name: z.string().min(1).max(60),
  description: z.string().max(1000).default(""),
  color: z.string().max(20).default("crimson"),
  effects: PassiveEffectListSchema.default([]),
  ruleIds: z.array(z.string()).max(10).default([]),
});

// ---------- Dice ----------
export const RollRequestSchema = z.object({
  characterId: z.string().optional(),
  expression: z.string().min(1).max(60).optional(),
  /** For skill/save/initiative rolls the server computes the modifier itself. */
  target: RollTargetSchema.optional(),
  category: z.enum(ROLL_CATEGORIES).default("custom"),
  label: z.string().max(80).optional(),
  mode: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
  visibility: z.enum(ROLL_VISIBILITIES).default("public"),
  /** Optional extra flat modifier (situational). */
  bonus: z.number().int().min(-50).max(50).default(0),
  rollRequestId: z.string().optional(),
});

// ---------- Items ----------
export const ItemDefinitionInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(3000).default(""),
  icon: z.string().max(40).default("box"),
  imageUrl: PortraitSchema.optional(),
  category: z.enum(ITEM_CATEGORIES),
  rarity: z.enum(RARITIES).default("common"),
  price: z.number().int().min(0).max(100_000_000).default(0),
  weight: z.number().min(0).max(10_000).default(0),
  requirements: RequirementListSchema.default([]),
  effects: PassiveEffectListSchema.default([]),
  /** Instant effects applied when a consumable is used. */
  useEffects: InstantEffectListSchema.default([]),
  augmentationSlot: z.enum(AUGMENTATION_SLOTS).nullable().default(null),
  equipmentSlot: z.enum(EQUIPMENT_SLOTS).nullable().default(null),
  capacityCost: z.number().int().min(0).max(50).default(0),
  stackable: z.boolean().default(false),
  maxCharges: z.number().int().min(0).max(999).nullable().default(null),
  damage: z.string().max(40).nullable().default(null),
  damageType: z.enum(DAMAGE_TYPES).nullable().default(null),
  ruleIds: z.array(z.string()).max(10).default([]),
  tags: z.array(z.string().max(30)).max(10).default([]),
  visibleToPlayers: z.boolean().default(true),
});

export const GrantItemSchema = z.object({
  characterId: z.string().min(1),
  definitionId: z.string().min(1),
  quantity: z.number().int().min(1).max(999).default(1),
  note: z.string().max(200).optional(),
});

export const ItemActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("equip"), slot: z.enum(EQUIPMENT_SLOTS).optional() }),
  z.object({ action: z.literal("unequip") }),
  z.object({ action: z.literal("install"), slot: z.enum(AUGMENTATION_SLOTS).optional(), replace: z.boolean().default(false) }),
  z.object({ action: z.literal("uninstall") }),
  z.object({ action: z.literal("use"), quantity: z.number().int().min(1).max(99).default(1) }),
  z.object({ action: z.literal("drop"), quantity: z.number().int().min(1).max(999).optional() }),
  z.object({ action: z.literal("setQuantity"), quantity: z.number().int().min(0).max(9999) }),
  z.object({ action: z.literal("setStatus"), status: z.enum(["installed", "damaged", "disabled"]) }),
  z.object({ action: z.literal("setCharges"), charges: z.number().int().min(0).max(999) }),
  z.object({ action: z.literal("rename"), customName: z.string().max(80).nullable() }),
  z.object({ action: z.literal("move"), container: z.string().max(40) }),
]);
export type ItemAction = z.infer<typeof ItemActionSchema>;
export type ItemActionInput = z.input<typeof ItemActionSchema>;

// ---------- Rules ----------
export const RuleDefinitionInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).default(""),
  automationMode: z.enum(AUTOMATION_MODES).nullable().default(null),
  enabled: z.boolean().default(true),
  /** campaign = applies to every character; attached = only when linked from an item/condition/node. */
  scope: z.enum(["campaign", "attached"]).default("campaign"),
  graph: RuleGraphSchema,
});

export const SimulateRuleSchema = z.object({
  graph: RuleGraphSchema,
  characterId: z.string().optional(),
  event: z.object({
    type: z.string(),
    damage: z.object({ amount: z.number().int(), damageType: z.enum(DAMAGE_TYPES) }).optional(),
    healing: z.number().int().optional(),
    hp: z.object({ before: z.number().int(), after: z.number().int(), max: z.number().int() }).optional(),
    definitionId: z.string().optional(),
    slot: z.enum(AUGMENTATION_SLOTS).optional(),
    conditionKey: z.string().optional(),
    abilityId: z.string().optional(),
    rollTarget: z.string().optional(),
  }),
  stateOverrides: z
    .object({
      hpCurrent: z.number().int().optional(),
      hpMax: z.number().int().optional(),
      conditions: z.array(z.string()).optional(),
    })
    .optional(),
});

// ---------- DM actions ----------
export const OverrideInputSchema = z.object({
  characterId: z.string().min(1),
  target: StatTargetSchema,
  value: z.number().int().min(-999).max(999),
  reason: z.string().max(200).optional(),
  durationTurns: z.number().int().min(1).max(1000).nullable().optional(),
});

export const DmGrantSchema = z.object({
  characterId: z.string().min(1),
  resource: z.enum(["xp", "progressionPoints", "credits"]),
  amount: z.number().int().min(-1_000_000).max(1_000_000),
  note: z.string().max(200).optional(),
});

export const DmMessageSchema = z.object({
  characterId: z.string().optional(),
  userId: z.string().optional(),
  message: z.string().min(1).max(2000),
  kind: z.enum(["whisper", "reveal", "broadcast"]).default("whisper"),
});

export const RollRequestCreateSchema = z.object({
  characterId: z.string().min(1),
  target: RollTargetSchema.optional(),
  expression: z.string().max(60).optional(),
  label: z.string().min(1).max(80),
  dc: z.number().int().min(1).max(60).optional(),
  visibility: z.enum(ROLL_VISIBILITIES).default("public"),
});

export const TriggerRuleSchema = z.object({
  characterId: z.string().min(1),
  ruleId: z.string().min(1),
});

export const PendingActionResolveSchema = z.object({
  decision: z.enum(["approve", "reject", "modify"]),
  modifiedActions: z.array(z.unknown()).optional(),
  note: z.string().max(200).optional(),
});

// ---------- Encounters ----------
export const CreateEncounterSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).default(""),
});
export const AddParticipantSchema = z.object({
  characterId: z.string().optional(),
  npcId: z.string().optional(),
  name: z.string().max(80).optional(),
  initiative: z.number().int().min(-20).max(60).optional(),
  hidden: z.boolean().default(false),
  count: z.number().int().min(1).max(10).default(1),
});
export const EncounterActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("previous") }),
  z.object({ action: z.literal("end") }),
  z.object({ action: z.literal("rollInitiative") }),
  z.object({ action: z.literal("setInitiative"), participantId: z.string(), initiative: z.number().int().min(-20).max(60) }),
  z.object({ action: z.literal("removeParticipant"), participantId: z.string() }),
  z.object({ action: z.literal("setHidden"), participantId: z.string(), hidden: z.boolean() }),
  z.object({
    action: z.literal("npcDamage"),
    participantId: z.string(),
    amount: z.number().int().min(-999).max(999),
  }),
  z.object({ action: z.literal("npcCondition"), participantId: z.string(), conditionKey: z.string(), remove: z.boolean().default(false) }),
]);

// ---------- NPCs ----------
export const NpcInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(3000).default(""),
  portraitUrl: PortraitSchema.default(null),
  faction: z.string().max(60).default(""),
  attributes: AttributesSchema.default({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
  hpMax: z.number().int().min(1).max(9999).default(10),
  ac: z.number().int().min(0).max(40).default(10),
  speed: z.number().int().min(0).max(100).default(9),
  abilities: z
    .array(z.object({ name: z.string().max(80), description: z.string().max(1000), effects: InstantEffectListSchema.default([]) }))
    .max(20)
    .default([]),
  effects: PassiveEffectListSchema.default([]),
  ruleIds: z.array(z.string()).max(10).default([]),
  visibleToPlayers: z.boolean().default(false),
  isEnemy: z.boolean().default(true),
});

// ---------- Missions & Journal ----------
export const MissionInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).default(""),
  objectives: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1).max(300), done: z.boolean().default(false) }))
    .max(30)
    .default([]),
  status: z.enum(["available", "active", "completed", "failed"]).default("available"),
  rewards: z
    .object({
      xp: z.number().int().min(0).default(0),
      credits: z.number().int().min(0).default(0),
      progressionPoints: z.number().int().min(0).default(0),
      itemDefinitionIds: z.array(z.string()).max(10).default([]),
    })
    .default({}),
  assignedCharacterIds: z.array(z.string()).max(20).default([]),
  visibleToPlayers: z.boolean().default(true),
});

export const JournalInputSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(20_000).default(""),
  characterId: z.string().nullable().default(null),
  visibility: z.enum(["private", "campaign", "dm"]).default("private"),
  isLore: z.boolean().default(false),
});

// ---------- Skill trees & abilities ----------
export const SkillTreeNodeInputSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  name: z.string().min(1).max(80),
  description: z.string().max(1000).default(""),
  icon: z.string().max(40).default("zap"),
  maxRank: z.number().int().min(1).max(10).default(1),
  cost: z.number().int().min(0).max(50).default(1),
  parentKeys: z.array(z.string()).max(5).default([]),
  requirements: RequirementListSchema.default([]),
  effects: PassiveEffectListSchema.default([]),
  ruleIds: z.array(z.string()).max(10).default([]),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  tier: z.number().int().min(0).max(10).default(0),
});
export const SkillTreeInputSchema = z.object({
  branch: z.enum(SPECIAL_SKILLS),
  name: z.string().min(1).max(80),
  description: z.string().max(1000).default(""),
  nodes: z.array(SkillTreeNodeInputSchema).max(60),
});

export const AbilityInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).default(""),
  icon: z.string().max(40).default("zap"),
  actionType: z.enum(["action", "bonus", "reaction", "free", "passive"]).default("action"),
  cost: z
    .object({ resource: z.enum(["hitDice", "progressionPoints", "credits", "inspiration", "none"]).default("none"), amount: z.number().int().min(0).default(0) })
    .default({}),
  usesPer: z.enum(["turn", "encounter", "rest", "session", "unlimited"]).default("unlimited"),
  maxUses: z.number().int().min(1).max(20).default(1),
  effects: InstantEffectListSchema.default([]),
  passiveEffects: PassiveEffectListSchema.default([]),
  ruleIds: z.array(z.string()).max(10).default([]),
});

export const UnlockNodeSchema = z.object({ nodeId: z.string().min(1) });

/** DM hands a sheet to another campaign member (ownership transfer). */
export const AssignCharacterSchema = z.object({ userId: z.string().min(1) });
/** Portrait only: allowed for owners in DM-controlled mode when `playersManagePortrait` is on. */
export const SetPortraitSchema = z.object({ portraitUrl: PortraitSchema });
/** Create (or with `rotate`, replace) the character's read-only share link. */
export const ShareLinkSchema = z.object({ rotate: z.boolean().default(false) });

// ---------- Export / import ----------
export const CharacterExportSchema = z.object({
  format: z.literal("neom-net/character"),
  version: z.literal(1),
  exportedAt: z.string(),
  character: z.record(z.unknown()),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;
export type RollRequestInput = z.infer<typeof RollRequestSchema>;
export type ItemDefinitionInput = z.infer<typeof ItemDefinitionInputSchema>;
export type GrantItemInput = z.infer<typeof GrantItemSchema>;
export type RuleDefinitionInput = z.infer<typeof RuleDefinitionInputSchema>;
export type OverrideInput = z.infer<typeof OverrideInputSchema>;
export type ConditionDefinitionInput = z.infer<typeof ConditionDefinitionInputSchema>;
export type NpcInput = z.infer<typeof NpcInputSchema>;
export type MissionInput = z.infer<typeof MissionInputSchema>;
export type JournalInput = z.infer<typeof JournalInputSchema>;
export type SkillTreeInput = z.infer<typeof SkillTreeInputSchema>;
export type SkillTreeNodeInput = z.infer<typeof SkillTreeNodeInputSchema>;
export type AbilityInput = z.infer<typeof AbilityInputSchema>;
export type ApplyConditionInput = z.infer<typeof ApplyConditionSchema>;
export type CampaignSettingsInput = z.infer<typeof CampaignSettingsSchema>;
export type EncounterAction = z.infer<typeof EncounterActionSchema>;
export type AddParticipantInput = z.infer<typeof AddParticipantSchema>;
export type SimulateRuleInput = z.infer<typeof SimulateRuleSchema>;
