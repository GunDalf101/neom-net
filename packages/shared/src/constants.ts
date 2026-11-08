/** Core game vocabulary shared by client and server. */

export const ATTRIBUTES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number];

export const ATTRIBUTE_META: Record<
  AttributeKey,
  { name: string; short: string; special: SpecialSkillKey; color: string }
> = {
  str: { name: "Strength", short: "STR", special: "augmentation", color: "crimson" },
  dex: { name: "Dexterity", short: "DEX", special: "reflex", color: "amber" },
  con: { name: "Constitution", short: "CON", special: "adaptability", color: "lime" },
  int: { name: "Intelligence", short: "INT", special: "hacking", color: "cyan" },
  wis: { name: "Wisdom", short: "WIS", special: "sanity", color: "magenta" },
  cha: { name: "Charisma", short: "CHA", special: "aura", color: "violet" },
};

export const SKILLS = [
  "athletics",
  "acrobatics",
  "sleightOfHand",
  "stealth",
  "arcana",
  "history",
  "investigation",
  "nature",
  "religion",
  "animalHandling",
  "insight",
  "medicine",
  "perception",
  "survival",
  "deception",
  "intimidation",
  "performance",
  "persuasion",
] as const;
export type SkillKey = (typeof SKILLS)[number];

export const SKILL_META: Record<SkillKey, { name: string; attribute: AttributeKey }> = {
  athletics: { name: "Athletics", attribute: "str" },
  acrobatics: { name: "Acrobatics", attribute: "dex" },
  sleightOfHand: { name: "Sleight of Hand", attribute: "dex" },
  stealth: { name: "Stealth", attribute: "dex" },
  arcana: { name: "Reverse Engineering", attribute: "int" },
  history: { name: "History", attribute: "int" },
  investigation: { name: "Investigation", attribute: "int" },
  nature: { name: "Nature", attribute: "int" },
  religion: { name: "Religion", attribute: "int" },
  animalHandling: { name: "Hardware Handling", attribute: "wis" },
  insight: { name: "Insight", attribute: "wis" },
  medicine: { name: "Medicine", attribute: "wis" },
  perception: { name: "Perception", attribute: "wis" },
  survival: { name: "Survival", attribute: "wis" },
  deception: { name: "Deception", attribute: "cha" },
  intimidation: { name: "Intimidation", attribute: "cha" },
  performance: { name: "Performance", attribute: "cha" },
  persuasion: { name: "Persuasion", attribute: "cha" },
};

export const SPECIAL_SKILLS = [
  "augmentation",
  "reflex",
  "adaptability",
  "hacking",
  "sanity",
  "aura",
] as const;
export type SpecialSkillKey = (typeof SPECIAL_SKILLS)[number];

export const SPECIAL_SKILL_META: Record<
  SpecialSkillKey,
  { name: string; attribute: AttributeKey; description: string }
> = {
  augmentation: {
    name: "Augmentation",
    attribute: "str",
    description: "Physical augmentation mastery, enhanced power, and mechanical body integration.",
  },
  reflex: {
    name: "Reflex",
    attribute: "dex",
    description: "Reaction speed, reflex enhancement, and precision movement.",
  },
  adaptability: {
    name: "Adaptability",
    attribute: "con",
    description: "Physical resilience, biological adaptation, and tolerance of implants.",
  },
  hacking: {
    name: "Hacking",
    attribute: "int",
    description: "Network intrusion, cyberwarfare, and electronic systems manipulation.",
  },
  sanity: {
    name: "Sanity",
    attribute: "wis",
    description: "Psychological stability, resistance to mental strain, and perceptual control.",
  },
  aura: {
    name: "Aura",
    attribute: "cha",
    description: "Presence, social influence, intimidation, and personal magnetism.",
  },
};

export const AUGMENTATION_SLOTS = [
  "eyes",
  "brain",
  "ears",
  "mouth",
  "hands",
  "arms",
  "legs",
  "torso",
  "back",
  "feet",
] as const;
export type AugmentationSlot = (typeof AUGMENTATION_SLOTS)[number];

export const AUGMENTATION_SLOT_META: Record<AugmentationSlot, { name: string }> = {
  eyes: { name: "Eyes" },
  brain: { name: "Brain" },
  ears: { name: "Ears" },
  mouth: { name: "Mouth" },
  hands: { name: "Hands" },
  arms: { name: "Arms" },
  legs: { name: "Legs" },
  torso: { name: "Torso" },
  back: { name: "Back" },
  feet: { name: "Feet" },
};

export const EQUIPMENT_SLOTS = ["mainHand", "offHand", "armor", "accessory1", "accessory2"] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const ITEM_CATEGORIES = [
  "weapon",
  "armor",
  "cyberware",
  "consumable",
  "tool",
  "misc",
  "quest",
  "custom",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_META: Record<Rarity, { name: string }> = {
  common: { name: "Common" },
  uncommon: { name: "Uncommon" },
  rare: { name: "Rare" },
  veryRare: { name: "Very Rare" },
  legendary: { name: "Legendary" },
  artifact: { name: "Artifact" },
};

export const DAMAGE_TYPES = [
  "physical",
  "piercing",
  "slashing",
  "bludgeoning",
  "fire",
  "cold",
  "lightning",
  "acid",
  "poison",
  "psychic",
  "thunder",
  "force",
  "radiant",
  "necrotic",
  "emp",
  "neural",
  "cyber",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const ITEM_STATUSES = ["stored", "equipped", "installed", "damaged", "disabled"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Builtin conditions. Campaigns can add custom ones. */
export const BUILTIN_CONDITIONS = [
  { key: "blinded", name: "Blinded", group: "dnd" },
  { key: "charmed", name: "Charmed", group: "dnd" },
  { key: "deafened", name: "Deafened", group: "dnd" },
  { key: "frightened", name: "Frightened", group: "dnd" },
  { key: "grappled", name: "Grappled", group: "dnd" },
  { key: "incapacitated", name: "Incapacitated", group: "dnd" },
  { key: "invisible", name: "Invisible", group: "dnd" },
  { key: "paralyzed", name: "Paralyzed", group: "dnd" },
  { key: "petrified", name: "Petrified", group: "dnd" },
  { key: "poisoned", name: "Poisoned", group: "dnd" },
  { key: "prone", name: "Prone", group: "dnd" },
  { key: "restrained", name: "Restrained", group: "dnd" },
  { key: "stunned", name: "Stunned", group: "dnd" },
  { key: "unconscious", name: "Unconscious", group: "dnd" },
  { key: "exhaustion", name: "Exhaustion", group: "dnd" },
  { key: "hacked", name: "Hacked", group: "cyber" },
  { key: "cyberwareMalfunction", name: "Cyberware Malfunction", group: "cyber" },
  { key: "mentalStrain", name: "Mental Strain", group: "cyber" },
] as const;
export type BuiltinConditionKey = (typeof BUILTIN_CONDITIONS)[number]["key"];

export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export const ROLL_CATEGORIES = [
  "skill",
  "save",
  "initiative",
  "attack",
  "damage",
  "healing",
  "ability",
  "custom",
  "deathSave",
] as const;
export type RollCategory = (typeof ROLL_CATEGORIES)[number];

export const ROLL_VISIBILITIES = ["public", "private", "whisper"] as const;
export type RollVisibility = (typeof ROLL_VISIBILITIES)[number];

export const AUTOMATION_MODES = ["automatic", "assisted", "manual"] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
] as const;

export const MAX_LEVEL = 20;

export const HIT_DIE_SIZES = [6, 8, 10, 12] as const;
export type HitDieSize = (typeof HIT_DIE_SIZES)[number];

/** 5e hit die by class. Custom or unknown classes fall back to d8. */
export const CLASS_HIT_DIE: Record<string, HitDieSize> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  artificer: 8,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
};

/** Looks the class up by its first word, so "Rogue // Netrunner" and "Fighter (Solo)" both resolve. */
export function hitDieForClass(characterClass: string | undefined | null): HitDieSize {
  const key = (characterClass ?? "").trim().toLowerCase().split(/[^a-z]+/)[0] ?? "";
  return CLASS_HIT_DIE[key] ?? 8;
}

/** Base cyberware capacity before modifiers. Campaign-configurable. */
export const DEFAULT_CYBERWARE_CAPACITY = 10;
export const DEFAULT_SPEED_METERS = 9;
export const DEFAULT_SPECIAL_MAX_RANK = 5;

// ---------- Reputation ----------
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

export interface DefaultFaction {
  key: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  isCity: boolean;
}

/** Installed into every campaign the first time factions are requested; the DM can edit or remove them. */
export const DEFAULT_FACTIONS: readonly DefaultFaction[] = [
  { key: "neonCity", name: "Neon City", description: "The city itself: law, corps, media and the street's opinion of you.", color: "cyan", icon: "building-2", isCity: true },
  { key: "sandBrokers", name: "Sand Brokers", description: "Information and smuggling brokers of the dust tiers. Everything has a price, including silence.", color: "amber", icon: "hourglass", isCity: false },
  { key: "metalWings", name: "Metal Wings", description: "Airborne couriers and mercenaries. Fast, loyal to contracts, allergic to betrayal.", color: "blue", icon: "feather", isCity: false },
  { key: "shimmerBloods", name: "Shimmer Bloods", description: "Bio-mod street gang. Chrome is for cowards; they grow their weapons.", color: "crimson", icon: "droplets", isCity: false },
  { key: "ms1337", name: "MS 1337", description: "Netrunner collective. If it has a signal, they already own a copy.", color: "lime", icon: "terminal", isCity: false },
  { key: "chromaticDragons", name: "Chromatic Dragons", description: "Heavy-chrome enforcers with a flair for colour-coded violence.", color: "violet", icon: "flame", isCity: false },
  { key: "vvz", name: "VVZ", description: "A syndicate nobody can spell out. Their favours come due at the worst moment.", color: "magenta", icon: "radio", isCity: false },
];

export type ReputationTier = "hunted" | "hostile" | "unfriendly" | "neutral" | "friendly" | "allied" | "family";

/** Seven bands across −100..+100 so the number has a meaning at the table. */
export function reputationTier(value: number): ReputationTier {
  if (value <= -85) return "hunted";
  if (value <= -50) return "hostile";
  if (value <= -15) return "unfriendly";
  if (value < 15) return "neutral";
  if (value < 50) return "friendly";
  if (value < 85) return "allied";
  return "family";
}

export const REPUTATION_TIER_META: Record<ReputationTier, { label: string; hint: string }> = {
  hunted: { label: "Hunted", hint: "Shoot on sight; bounties posted." },
  hostile: { label: "Hostile", hint: "Attacked when convenient; no dealings." },
  unfriendly: { label: "Unfriendly", hint: "Watched, overcharged, doors close." },
  neutral: { label: "Neutral", hint: "Just another face." },
  friendly: { label: "Friendly", hint: "Discounts, tips, a warning now and then." },
  allied: { label: "Allied", hint: "Backup, safehouses, favours owed both ways." },
  family: { label: "Family", hint: "Their fight is your fight." },
};
