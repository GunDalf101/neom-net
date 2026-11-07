/**
 * Seeds the demo campaign "NEOM//NET — Night City Protocol".
 * Idempotent: re-running removes the previous demo campaign and recreates it.
 *
 * Demo accounts are created with the password from SEED_PASSWORD, or a random one
 * generated and printed once below. No credentials are stored in the repository.
 */
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { ItemDefinitionInput, PassiveEffect, RuleGraph, SkillTreeNodeInput } from "@neom/shared";
import { ensureBuiltinConditions } from "../src/services/conditions.js";

const defaultPrisma = new PrismaClient();

const CAMPAIGN_NAME = "NEOM//NET — Night City Protocol";

const emergencyReflexGraph: RuleGraph = {
  version: 1,
  nodes: [
    { id: "t", type: "trigger.damageReceived", params: {}, position: { x: 40, y: 160 } },
    { id: "c1", type: "cond.hpBelowPercent", params: { percent: 30 }, position: { x: 320, y: 160 } },
    { id: "c2", type: "cond.augInstalled", params: { requireActive: true }, position: { x: 600, y: 160 } },
    { id: "cd", type: "flow.cooldown", params: { scope: "encounter", maxUses: 1 }, position: { x: 880, y: 160 } },
    { id: "d", type: "flow.duration", params: { turns: 3, label: "Emergency Reflex Protocol" }, position: { x: 1160, y: 160 } },
    { id: "e1", type: "effect.modifier", params: { target: "special.reflex", value: 2, label: "Reflex surge" }, position: { x: 1440, y: 80 } },
    { id: "n", type: "effect.notify", params: { message: "Emergency Reflex Protocol engaged: +2 Reflex for 3 turns.", audience: "all" }, position: { x: 1720, y: 80 } },
    { id: "x", type: "effect.applyCondition", params: { conditionKey: "mentalStrain", durationTurns: 2 }, position: { x: 1440, y: 320 } },
  ],
  edges: [
    { id: "e-1", source: "t", sourceHandle: "out", target: "c1", targetHandle: "in" },
    { id: "e-2", source: "c1", sourceHandle: "true", target: "c2", targetHandle: "in" },
    { id: "e-3", source: "c2", sourceHandle: "true", target: "cd", targetHandle: "in" },
    { id: "e-4", source: "cd", sourceHandle: "out", target: "d", targetHandle: "in" },
    { id: "e-5", source: "d", sourceHandle: "out", target: "e1", targetHandle: "in" },
    { id: "e-6", source: "e1", sourceHandle: "out", target: "n", targetHandle: "in" },
    { id: "e-7", source: "d", sourceHandle: "onExpiry", target: "x", targetHandle: "in" },
  ],
};

const adrenalineGraph: RuleGraph = {
  version: 1,
  nodes: [
    { id: "t", type: "trigger.damageReceived", params: {}, position: { x: 40, y: 160 } },
    { id: "c1", type: "cond.hpBelowPercent", params: { percent: 50 }, position: { x: 320, y: 160 } },
    { id: "cd", type: "flow.cooldown", params: { scope: "encounter", maxUses: 1 }, position: { x: 600, y: 160 } },
    { id: "d", type: "flow.duration", params: { turns: 2, label: "Adrenaline Overdrive" }, position: { x: 880, y: 160 } },
    { id: "s", type: "flow.sequence", params: {}, position: { x: 1160, y: 160 } },
    { id: "e1", type: "effect.modifier", params: { target: "speed", value: 3, label: "Adrenaline" }, position: { x: 1440, y: 40 } },
    { id: "e2", type: "effect.advantage", params: { on: "save.dex", mode: "advantage" }, position: { x: 1440, y: 200 } },
    { id: "e3", type: "effect.tempHp", params: { amount: "1d6" }, position: { x: 1440, y: 360 } },
  ],
  edges: [
    { id: "e-1", source: "t", sourceHandle: "out", target: "c1", targetHandle: "in" },
    { id: "e-2", source: "c1", sourceHandle: "true", target: "cd", targetHandle: "in" },
    { id: "e-3", source: "cd", sourceHandle: "out", target: "d", targetHandle: "in" },
    { id: "e-4", source: "d", sourceHandle: "out", target: "s", targetHandle: "in" },
    { id: "e-5", source: "s", sourceHandle: "out1", target: "e1", targetHandle: "in" },
    { id: "e-6", source: "s", sourceHandle: "out2", target: "e2", targetHandle: "in" },
    { id: "e-7", source: "s", sourceHandle: "out3", target: "e3", targetHandle: "in" },
  ],
};

type ItemSeed = Omit<ItemDefinitionInput, "requirements" | "effects" | "useEffects" | "ruleIds" | "tags"> &
  Partial<Pick<ItemDefinitionInput, "requirements" | "effects" | "useEffects" | "ruleIds" | "tags">>;

const items: ItemSeed[] = [
  // ---- Cyberware ----
  {
    name: "Kiroshi Spectral Optics Mk. III",
    description: "Multi-spectrum optical implants with threat-highlighting overlays and low-light amplification.",
    icon: "eye",
    category: "cyberware",
    rarity: "rare",
    price: 4200,
    weight: 0,
    augmentationSlot: "eyes",
    equipmentSlot: null,
    capacityCost: 3,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "modifier", target: "skill.perception", value: 2, op: "add", label: "Spectral Optics" },
      { kind: "sense", name: "Darkvision", rangeMeters: 18 },
      { kind: "advantage", on: "skill.investigation", mode: "advantage", note: "Visual analysis" },
    ],
  },
  {
    name: "Neural Filter",
    description: "Cochlear implant that scrubs sonic attacks and isolates voices in a crowd.",
    icon: "ear",
    category: "cyberware",
    rarity: "common",
    price: 900,
    weight: 0,
    augmentationSlot: "ears",
    equipmentSlot: null,
    capacityCost: 1,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "resistance", damageType: "thunder", level: "resistance" },
      { kind: "trait", name: "Audio Analysis", description: "Can isolate and replay any conversation heard in the last minute." },
    ],
  },
  {
    name: "Synaptic Nexus",
    description: "Military-grade neural co-processor. Thought runs faster than the world around you.",
    icon: "brain",
    category: "cyberware",
    rarity: "legendary",
    price: 18000,
    weight: 0,
    augmentationSlot: "brain",
    equipmentSlot: null,
    capacityCost: 3,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    requirements: [
      { kind: "attribute", attribute: "int", min: 15 },
      { kind: "specialRank", skill: "hacking", min: 2 },
    ],
    effects: [
      { kind: "modifier", target: "special.hacking", value: 3, op: "add", label: "Synaptic Nexus" },
      { kind: "trait", name: "Extra Action", description: "Once per long rest, take one additional action on your turn." },
    ],
  },
  {
    name: "Vocal Modulator",
    description: "Larynx replacement capable of voice mimicry and real-time translation.",
    icon: "mic",
    category: "cyberware",
    rarity: "common",
    price: 1100,
    weight: 0,
    augmentationSlot: "mouth",
    equipmentSlot: null,
    capacityCost: 1,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "modifier", target: "skill.deception", value: 2, op: "add", label: "Voice disguise" },
      { kind: "trait", name: "Multilingual AI", description: "Understand and speak any language with a digital corpus." },
    ],
  },
  {
    name: "Reinforced Arms",
    description: "Titanium-lattice forearms with hydraulic assist. Handshakes become negotiations.",
    icon: "hand-metal",
    category: "cyberware",
    rarity: "rare",
    price: 5600,
    weight: 0,
    augmentationSlot: "arms",
    equipmentSlot: null,
    capacityCost: 2,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    requirements: [{ kind: "attribute", attribute: "str", min: 13 }],
    effects: [
      { kind: "modifier", target: "attr.str", value: 2, op: "add", label: "Reinforced Arms" },
      { kind: "trait", name: "Crushing Grip", description: "Unarmed strikes deal 1d6 bludgeoning damage." },
    ],
  },
  {
    name: "Haptic Interface",
    description: "Fingertip micro-actuators and a hidden data jack.",
    icon: "hand",
    category: "cyberware",
    rarity: "common",
    price: 800,
    weight: 0,
    augmentationSlot: "hands",
    equipmentSlot: null,
    capacityCost: 1,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "modifier", target: "skill.sleightOfHand", value: 1, op: "add", label: "Haptic Interface" },
      { kind: "trait", name: "Device Slot", description: "Jack directly into any device within reach." },
    ],
  },
  {
    name: "Kinetic Stabilizers",
    description: "Gyroscopic leg implants with stored-energy jump assist.",
    icon: "footprints",
    category: "cyberware",
    rarity: "veryRare",
    price: 9800,
    weight: 0,
    augmentationSlot: "legs",
    equipmentSlot: null,
    capacityCost: 2,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    requirements: [{ kind: "attribute", attribute: "dex", min: 14 }],
    effects: [
      { kind: "modifier", target: "speed", value: 3, op: "add", label: "Kinetic Stabilizers" },
      { kind: "trait", name: "Jump Boost", description: "Jump distance tripled; no fall damage from 6 m or less." },
    ],
  },
  {
    name: "Nanoweave Plating",
    description: "Subdermal armor weave. Knives slide, bullets bruise.",
    icon: "shield",
    category: "cyberware",
    rarity: "uncommon",
    price: 3200,
    weight: 0,
    augmentationSlot: "torso",
    equipmentSlot: null,
    capacityCost: 2,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "modifier", target: "ac", value: 1, op: "add", label: "Nanoweave Plating" },
      { kind: "resistance", damageType: "physical", level: "resistance" },
    ],
  },
  {
    name: "Modular Rig",
    description: "Spinal mounting rail with power routing for external devices.",
    icon: "backpack",
    category: "cyberware",
    rarity: "common",
    price: 1500,
    weight: 0,
    augmentationSlot: "back",
    equipmentSlot: null,
    capacityCost: 1,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "modifier", target: "capacity", value: 1, op: "add", label: "Modular Rig power routing" },
      { kind: "trait", name: "Cable Management", description: "Devices mounted on the rig cannot be disarmed or stolen." },
    ],
  },
  {
    name: "Tactical Boots",
    description: "Sound-dampening soles with adaptive tread.",
    icon: "boot",
    category: "cyberware",
    rarity: "common",
    price: 700,
    weight: 0,
    augmentationSlot: "feet",
    equipmentSlot: null,
    capacityCost: 1,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [
      { kind: "modifier", target: "skill.stealth", value: 1, op: "add", label: "Tactical Boots" },
      { kind: "trait", name: "Surefooted", description: "Difficult terrain does not slow you." },
    ],
  },
  // ---- Weapons & armor ----
  {
    name: "Militech M-10AF Lexington",
    description: "Reliable sidearm. Ubiquitous for a reason.",
    icon: "crosshair",
    category: "weapon",
    rarity: "common",
    price: 450,
    weight: 1.2,
    augmentationSlot: null,
    equipmentSlot: "mainHand",
    capacityCost: 0,
    stackable: false,
    maxCharges: null,
    damage: "1d8",
    damageType: "piercing",
    visibleToPlayers: true,
    effects: [{ kind: "trait", name: "Ranged 20/60 m", description: "Semi-automatic. Reload as a bonus action." }],
  },
  {
    name: "Mono-katana",
    description: "Monomolecular edge. It does not so much cut as persuade matter to separate.",
    icon: "sword",
    category: "weapon",
    rarity: "rare",
    price: 3800,
    weight: 1.5,
    augmentationSlot: null,
    equipmentSlot: "mainHand",
    capacityCost: 0,
    stackable: false,
    maxCharges: null,
    damage: "1d10",
    damageType: "slashing",
    visibleToPlayers: true,
    requirements: [{ kind: "attribute", attribute: "dex", min: 14 }],
    effects: [{ kind: "trait", name: "Finesse", description: "Use DEX for attack and damage rolls." }],
  },
  {
    name: "Armored Trench Coat",
    description: "Ballistic-weave lining under weatherproof synth-leather.",
    icon: "shirt",
    category: "armor",
    rarity: "uncommon",
    price: 1200,
    weight: 4,
    augmentationSlot: null,
    equipmentSlot: "armor",
    capacityCost: 0,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [{ kind: "modifier", target: "ac", value: 2, op: "add", stackGroup: "armor", label: "Armored Trench Coat" }],
  },
  {
    name: "Kevlar Vest",
    description: "Light and concealable.",
    icon: "shield-half",
    category: "armor",
    rarity: "common",
    price: 500,
    weight: 2.5,
    augmentationSlot: null,
    equipmentSlot: "armor",
    capacityCost: 0,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [{ kind: "modifier", target: "ac", value: 1, op: "add", stackGroup: "armor", label: "Kevlar Vest" }],
  },
  // ---- Tools & consumables ----
  {
    name: "Netrunner Deck",
    description: "Portable intrusion suite with a dozen pre-loaded daemons.",
    icon: "cpu",
    category: "tool",
    rarity: "uncommon",
    price: 2500,
    weight: 1,
    augmentationSlot: null,
    equipmentSlot: "accessory1",
    capacityCost: 0,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    effects: [{ kind: "modifier", target: "special.hacking", value: 1, op: "add", label: "Netrunner Deck" }],
  },
  {
    name: "Stim Patch",
    description: "Dermal injector. Heals 2d4+2 HP.",
    icon: "syringe",
    category: "consumable",
    rarity: "common",
    price: 60,
    weight: 0.1,
    augmentationSlot: null,
    equipmentSlot: null,
    capacityCost: 0,
    stackable: true,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    useEffects: [{ kind: "heal", amount: "2d4+2" }],
  },
  {
    name: "Neural Purge",
    description: "Flushes hostile code from your implants. Removes the Hacked condition.",
    icon: "zap-off",
    category: "consumable",
    rarity: "uncommon",
    price: 250,
    weight: 0.1,
    augmentationSlot: null,
    equipmentSlot: null,
    capacityCost: 0,
    stackable: true,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    useEffects: [
      { kind: "removeCondition", conditionKey: "hacked" },
      { kind: "notify", message: "Neural Purge: hostile code flushed.", audience: "all" },
    ],
  },
  {
    name: "Trauma Kit",
    description: "Three-charge field kit. Each charge heals 1d8.",
    icon: "briefcase-medical",
    category: "tool",
    rarity: "common",
    price: 300,
    weight: 1,
    augmentationSlot: null,
    equipmentSlot: null,
    capacityCost: 0,
    stackable: false,
    maxCharges: 3,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
    useEffects: [{ kind: "heal", amount: "1d8" }],
  },
  {
    name: "Encrypted Datashard",
    description: "Pulled from a dead courier. Someone wants this very badly.",
    icon: "hard-drive",
    category: "quest",
    rarity: "rare",
    price: 0,
    weight: 0,
    augmentationSlot: null,
    equipmentSlot: null,
    capacityCost: 0,
    stackable: false,
    maxCharges: null,
    damage: null,
    damageType: null,
    visibleToPlayers: true,
  },
];

function tree(branch: SkillTreeNodeInput["key"] extends string ? string : never, nodes: Array<Partial<SkillTreeNodeInput> & { key: string; name: string }>): SkillTreeNodeInput[] {
  void branch;
  return nodes.map((n, i) => ({
    key: n.key,
    name: n.name,
    description: n.description ?? "",
    icon: n.icon ?? "zap",
    maxRank: n.maxRank ?? 1,
    cost: n.cost ?? 1,
    parentKeys: n.parentKeys ?? [],
    requirements: n.requirements ?? [],
    effects: n.effects ?? [],
    ruleIds: n.ruleIds ?? [],
    position: n.position ?? { x: (n.tier ?? 0) * 220, y: i * 110 },
    tier: n.tier ?? 0,
  }));
}

const mod = (target: string, value: number, label?: string): PassiveEffect => ({ kind: "modifier", target, value, op: "add", label });

/** True when the demo campaign already exists (used by SEED_ON_BOOT to seed only once). */
export async function demoCampaignExists(client: PrismaClient = defaultPrisma): Promise<boolean> {
  return (await client.campaign.count({ where: { name: CAMPAIGN_NAME } })) > 0;
}

export async function seedDemo(client: PrismaClient = defaultPrisma): Promise<void> {
  const prisma = client;
  await ensureBuiltinConditions(client);

  const password = process.env.SEED_PASSWORD ?? randomBytes(6).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const dm = await prisma.user.upsert({
    where: { email: "overseer@neom.local" },
    create: { email: "overseer@neom.local", username: "overseer", passwordHash },
    update: { passwordHash },
  });
  const player = await prisma.user.upsert({
    where: { email: "antonio@neom.local" },
    create: { email: "antonio@neom.local", username: "antonio", passwordHash },
    update: { passwordHash },
  });

  const old = await prisma.campaign.findFirst({ where: { name: CAMPAIGN_NAME, ownerId: dm.id } });
  if (old) await prisma.campaign.delete({ where: { id: old.id } });

  const campaign = await prisma.campaign.create({
    data: {
      name: CAMPAIGN_NAME,
      description:
        "2077. The NEOM arcology hums above the old city. Kobolds & Ferkus Co. runs the lower tiers; Netwatch watches everyone else. You are what slips between.",
      ownerId: dm.id,
      inviteCode: "NIGHTCITY",
      settings: { defaultAutomationMode: "automatic", playersReadOnly: true, playersInstallCyberware: true, playersEditAttributes: true },
      members: { create: [{ userId: dm.id, role: "DM" }, { userId: player.id, role: "PLAYER" }] },
    },
  });
  const cid = campaign.id;

  // ---- Items ----
  const defs = new Map<string, string>();
  for (const it of items) {
    const row = await prisma.itemDefinition.create({
      data: {
        campaignId: cid,
        name: it.name,
        description: it.description,
        icon: it.icon,
        imageUrl: null,
        category: it.category,
        rarity: it.rarity,
        price: it.price,
        weight: it.weight,
        requirements: (it.requirements ?? []) as unknown as Prisma.InputJsonValue,
        effects: (it.effects ?? []) as unknown as Prisma.InputJsonValue,
        useEffects: (it.useEffects ?? []) as unknown as Prisma.InputJsonValue,
        augmentationSlot: it.augmentationSlot,
        equipmentSlot: it.equipmentSlot,
        capacityCost: it.capacityCost,
        stackable: it.stackable,
        maxCharges: it.maxCharges,
        damage: it.damage,
        damageType: it.damageType,
        ruleIds: it.ruleIds ?? [],
        tags: it.tags ?? [],
        visibleToPlayers: it.visibleToPlayers,
      },
    });
    defs.set(it.name, row.id);
  }

  // ---- Custom condition ----
  await prisma.conditionDefinition.create({
    data: {
      campaignId: cid,
      key: "overheated",
      name: "Overheated",
      description: "Cyberware running past thermal limits. -1 AC until cooled.",
      color: "amber",
      effects: [mod("ac", -1, "Overheated")] as unknown as Prisma.InputJsonValue,
      ruleIds: [],
    },
  });

  // ---- Rules ----
  const erp = await prisma.ruleDefinition.create({
    data: {
      campaignId: cid,
      name: "Emergency Reflex Protocol",
      description: "When HP falls below 30% and a compatible augmentation is active: +2 Reflex for 3 turns. Once per encounter. Mental strain afterwards.",
      automationMode: "automatic",
      enabled: true,
      scope: "campaign",
      draftGraph: emergencyReflexGraph as unknown as Prisma.InputJsonValue,
      draftVersion: 1,
      publishedGraph: emergencyReflexGraph as unknown as Prisma.InputJsonValue,
      publishedVersion: 1,
      versions: { create: { version: 1, graph: emergencyReflexGraph as unknown as Prisma.InputJsonValue, note: "Initial release" } },
    },
  });
  await prisma.ruleDefinition.create({
    data: {
      campaignId: cid,
      name: "Adrenaline Overdrive",
      description: "Below 50% HP: +3 m speed, advantage on DEX saves and 1d6 temporary HP for 2 turns. Assisted — the DM confirms.",
      automationMode: "assisted",
      enabled: true,
      scope: "campaign",
      draftGraph: adrenalineGraph as unknown as Prisma.InputJsonValue,
      draftVersion: 1,
      publishedGraph: adrenalineGraph as unknown as Prisma.InputJsonValue,
      publishedVersion: 1,
      versions: { create: { version: 1, graph: adrenalineGraph as unknown as Prisma.InputJsonValue, note: "Initial release" } },
    },
  });

  // ---- Abilities ----
  const overclock = await prisma.abilityDefinition.create({
    data: {
      campaignId: cid,
      name: "Overclock",
      description: "Push your implants past spec: gain 5 temporary HP and +2 Hacking for 2 turns, then suffer Mental Strain.",
      icon: "zap",
      actionType: "bonus",
      cost: { resource: "none", amount: 0 },
      usesPer: "encounter",
      maxUses: 1,
      effects: [
        { kind: "tempHp", amount: 5 },
        { kind: "temporaryEffect", label: "Overclock", effects: [mod("special.hacking", 2, "Overclock")], durationTurns: 2, onExpiry: [{ kind: "applyCondition", conditionKey: "mentalStrain", durationTurns: 2 }] },
      ] as unknown as Prisma.InputJsonValue,
      passiveEffects: [],
      ruleIds: [],
    },
  });

  // ---- Skill trees ----
  const trees: Array<{ branch: string; name: string; description: string; nodes: SkillTreeNodeInput[] }> = [
    {
      branch: "augmentation",
      name: "Augmentation",
      description: "Make the chrome part of you.",
      nodes: tree("augmentation", [
        { key: "chromeTolerance", name: "Chrome Tolerance", description: "+1 cyberware capacity per rank.", icon: "battery-charging", maxRank: 2, effects: [mod("capacity", 1, "Chrome Tolerance")], tier: 0 },
        { key: "hydraulicStrength", name: "Hydraulic Strength", description: "+1 STR.", icon: "dumbbell", parentKeys: ["chromeTolerance"], effects: [mod("attr.str", 1, "Hydraulic Strength")], tier: 1, cost: 2 },
        { key: "ironFrame", name: "Iron Frame", description: "+2 max HP per rank.", icon: "heart-pulse", parentKeys: ["chromeTolerance"], maxRank: 3, effects: [mod("maxHp", 2, "Iron Frame")], tier: 1 },
      ]),
    },
    {
      branch: "reflex",
      name: "Reflex",
      description: "Faster than thought.",
      nodes: tree("reflex", [
        { key: "quickDraw", name: "Quick Draw", description: "+1 initiative per rank.", icon: "timer", maxRank: 2, effects: [mod("initiative", 1, "Quick Draw")], tier: 0 },
        { key: "evasiveFootwork", name: "Evasive Footwork", description: "Proficiency in Acrobatics.", icon: "move", parentKeys: ["quickDraw"], effects: [{ kind: "proficiency", target: "skill.acrobatics", level: "proficient" }], tier: 1 },
        { key: "bulletTime", name: "Bullet Time", description: "Advantage on DEX saves.", icon: "gauge", parentKeys: ["evasiveFootwork"], effects: [{ kind: "advantage", on: "save.dex", mode: "advantage", note: "Bullet Time" }], tier: 2, cost: 3, requirements: [{ kind: "specialRank", skill: "reflex", min: 2 }] },
      ]),
    },
    {
      branch: "adaptability",
      name: "Adaptability",
      description: "What doesn't kill you gets logged.",
      nodes: tree("adaptability", [
        { key: "toughened", name: "Toughened", description: "+1 max HP per rank.", icon: "shield-plus", maxRank: 3, effects: [mod("maxHp", 1, "Toughened")], tier: 0 },
        { key: "toxinFilter", name: "Toxin Filter", description: "Resistance to poison damage.", icon: "flask-conical", parentKeys: ["toughened"], effects: [{ kind: "resistance", damageType: "poison", level: "resistance" }], tier: 1 },
        { key: "empHardening", name: "EMP Hardening", description: "Resistance to EMP damage.", icon: "radio", parentKeys: ["toughened"], effects: [{ kind: "resistance", damageType: "emp", level: "resistance" }], tier: 1, cost: 2 },
      ]),
    },
    {
      branch: "hacking",
      name: "Hacking",
      description: "Every lock is a conversation.",
      nodes: tree("hacking", [
        { key: "iceBreaker", name: "Ice Breaker", description: "+1 Hacking per rank.", icon: "unlock", maxRank: 2, effects: [mod("special.hacking", 1, "Ice Breaker")], tier: 0 },
        { key: "ghostProtocol", name: "Ghost Protocol", description: "Proficiency in Stealth.", icon: "ghost", parentKeys: ["iceBreaker"], effects: [{ kind: "proficiency", target: "skill.stealth", level: "proficient" }], tier: 1 },
        { key: "overclock", name: "Overclock", description: "Unlocks the Overclock ability.", icon: "zap", parentKeys: ["iceBreaker"], effects: [{ kind: "grantAbility", abilityId: overclock.id }], tier: 1, cost: 2 },
      ]),
    },
    {
      branch: "sanity",
      name: "Sanity",
      description: "Hold the line inside your own head.",
      nodes: tree("sanity", [
        { key: "centered", name: "Centered", description: "+1 WIS saves per rank.", icon: "brain-circuit", maxRank: 2, effects: [mod("save.wis", 1, "Centered")], tier: 0 },
        { key: "clearSignal", name: "Clear Signal", description: "Proficiency in Insight.", icon: "radar", parentKeys: ["centered"], effects: [{ kind: "proficiency", target: "skill.insight", level: "proficient" }], tier: 1 },
        { key: "unshakable", name: "Unshakable", description: "Resistance to psychic damage.", icon: "anchor", parentKeys: ["clearSignal"], effects: [{ kind: "resistance", damageType: "psychic", level: "resistance" }], tier: 2, cost: 3 },
      ]),
    },
    {
      branch: "aura",
      name: "Aura",
      description: "People remember you. Make sure it's on your terms.",
      nodes: tree("aura", [
        { key: "presence", name: "Presence", description: "+1 Aura per rank.", icon: "sparkles", maxRank: 2, effects: [mod("special.aura", 1, "Presence")], tier: 0 },
        { key: "silverTongue", name: "Silver Tongue", description: "Proficiency in Persuasion.", icon: "message-circle", parentKeys: ["presence"], effects: [{ kind: "proficiency", target: "skill.persuasion", level: "proficient" }], tier: 1 },
        { key: "menace", name: "Menace", description: "Expertise in Intimidation.", icon: "skull", parentKeys: ["presence"], effects: [{ kind: "proficiency", target: "skill.intimidation", level: "expertise" }], tier: 1, cost: 2 },
      ]),
    },
  ];
  for (const t of trees) {
    await prisma.skillTreeDefinition.create({
      data: {
        campaignId: cid,
        branch: t.branch,
        name: t.name,
        description: t.description,
        nodes: {
          create: t.nodes.map((n) => ({
            key: n.key,
            name: n.name,
            description: n.description,
            icon: n.icon,
            maxRank: n.maxRank,
            cost: n.cost,
            parentKeys: n.parentKeys,
            requirements: n.requirements as unknown as Prisma.InputJsonValue,
            effects: n.effects as unknown as Prisma.InputJsonValue,
            ruleIds: n.ruleIds,
            position: n.position,
            tier: n.tier,
          })),
        },
      },
    });
  }

  // ---- Antonio ----
  const antonio = await prisma.character.create({
    data: {
      campaignId: cid,
      ownerUserId: player.id,
      name: "Antonio Ettoro",
      species: "Human",
      characterClass: "Rogue",
      subclass: "Netrunner",
      level: 1,
      xp: 0,
      faction: "Kobolds & Ferkus Co.",
      alignment: "Chaotic Neutral",
      background: "Street Courier",
      biography: "Grew up running packages between the arcology's maintenance tiers. Learned early that a locked door is just a slow conversation.",
      attributes: { str: 14, dex: 18, con: 14, int: 16, wis: 12, cha: 10 },
      saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
      skills: {
        athletics: 0, acrobatics: 1, sleightOfHand: 1, stealth: 2, arcana: 0, history: 0, investigation: 1, nature: 0, religion: 0,
        animalHandling: 0, insight: 0, medicine: 0, perception: 1, survival: 0, deception: 0, intimidation: 0, performance: 0, persuasion: 0,
      },
      specialSkills: {
        augmentation: { rank: 0, proficiency: 0 },
        reflex: { rank: 1, proficiency: 1 },
        adaptability: { rank: 0, proficiency: 0 },
        hacking: { rank: 2, proficiency: 1 },
        sanity: { rank: 0, proficiency: 0 },
        aura: { rank: 0, proficiency: 0 },
      },
      hpCurrent: 12,
      hpMaxBase: 12,
      hpTemp: 0,
      hitDieSize: 8,
      credits: 1500,
      progressionPoints: 3,
    },
  });
  const give = async (name: string, extra: Partial<Prisma.ItemInstanceUncheckedCreateInput> = {}) => {
    const definitionId = defs.get(name);
    if (!definitionId) throw new Error(`missing item ${name}`);
    const def = await prisma.itemDefinition.findUniqueOrThrow({ where: { id: definitionId } });
    return prisma.itemInstance.create({ data: { characterId: antonio.id, definitionId, charges: def.maxCharges, ...extra } });
  };
  await give("Militech M-10AF Lexington", { status: "equipped", equippedSlot: "mainHand" });
  await give("Armored Trench Coat", { status: "equipped", equippedSlot: "armor" });
  await give("Netrunner Deck", { status: "equipped", equippedSlot: "accessory1" });
  await give("Tactical Boots", { status: "installed", installedSlot: "feet" });
  await give("Stim Patch", { quantity: 3 });
  await give("Trauma Kit");
  await give("Encrypted Datashard");

  // ---- NPCs ----
  const enforcer = await prisma.npcDefinition.create({
    data: {
      campaignId: cid,
      name: "K&F Enforcer",
      description: "Corporate muscle in matte-black plate. Polite until they aren't.",
      faction: "Kobolds & Ferkus Co.",
      attributes: { str: 15, dex: 12, con: 14, int: 9, wis: 10, cha: 8 },
      hpMax: 16,
      ac: 15,
      speed: 9,
      abilities: [{ name: "Shock Baton", description: "Melee +4, 1d6+2 lightning. On hit the target must save CON 12 or be Stunned until end of next turn.", effects: [] }],
      effects: [],
      ruleIds: [],
      visibleToPlayers: true,
      isEnemy: true,
    },
  });
  await prisma.npcDefinition.create({
    data: {
      campaignId: cid,
      name: "Scav Drone",
      description: "Repurposed delivery drone with a welding torch and bad intentions.",
      faction: "Scavengers",
      attributes: { str: 8, dex: 16, con: 10, int: 4, wis: 10, cha: 1 },
      hpMax: 8,
      ac: 13,
      speed: 12,
      abilities: [{ name: "Torch", description: "Melee +5, 1d6 fire.", effects: [] }],
      effects: [{ kind: "resistance", damageType: "emp", level: "vulnerability" }],
      ruleIds: [],
      visibleToPlayers: false,
      isEnemy: true,
    },
  });
  await prisma.npcDefinition.create({
    data: {
      campaignId: cid,
      name: "Agent Vey (Netwatch)",
      description: "Handler, fixer, occasional ally. Knows more than she says and says a lot.",
      faction: "Netwatch",
      attributes: { str: 10, dex: 14, con: 12, int: 17, wis: 15, cha: 16 },
      hpMax: 22,
      ac: 14,
      speed: 9,
      abilities: [],
      effects: [],
      ruleIds: [],
      visibleToPlayers: true,
      isEnemy: false,
    },
  });

  // ---- Encounter (planned) ----
  const encounter = await prisma.encounter.create({
    data: { campaignId: cid, name: "Alley Ambush", description: "Two enforcers block the maintenance exit. The datashard is burning a hole in Antonio's pocket.", status: "planned" },
  });
  await prisma.encounterParticipant.create({ data: { encounterId: encounter.id, characterId: antonio.id, name: antonio.name, hpCurrent: 12, hpMax: 12, ac: 16, sortOrder: 0 } });
  for (let i = 1; i <= 2; i++) {
    await prisma.encounterParticipant.create({ data: { encounterId: encounter.id, npcId: enforcer.id, name: `K&F Enforcer ${i}`, hpCurrent: 16, hpMax: 16, ac: 15, sortOrder: i } });
  }

  // ---- Mission & journal ----
  await prisma.mission.create({
    data: {
      campaignId: cid,
      name: "First Contact",
      description: "Deliver the encrypted datashard to Agent Vey at the Neon Garden without K&F finding out it ever left their courier.",
      objectives: [
        { id: "o1", text: "Reach the Neon Garden (Tier 3)", done: false },
        { id: "o2", text: "Avoid or neutralise the K&F patrol", done: false },
        { id: "o3", text: "Hand the shard to Agent Vey", done: false },
      ],
      status: "active",
      rewards: { xp: 300, credits: 800, progressionPoints: 1, itemDefinitionIds: [defs.get("Kiroshi Spectral Optics Mk. III")].filter((x): x is string => Boolean(x)) },
      visibleToPlayers: true,
      assignments: { create: { characterId: antonio.id } },
    },
  });
  await prisma.journalEntry.create({
    data: {
      campaignId: cid,
      authorUserId: dm.id,
      title: "NEOM Arcology — Tier Map",
      body: "Tier 1: Maintenance & reclamation. K&F territory.\nTier 2: Markets, clinics, ripperdocs.\nTier 3: Neon Garden, Netwatch front offices.\nTier 4+: Restricted. Nobody you know has been there and come back chatty.",
      visibility: "campaign",
      isLore: true,
    },
  });
  await prisma.journalEntry.create({
    data: {
      campaignId: cid,
      authorUserId: player.id,
      characterId: antonio.id,
      title: "Note to self",
      body: "The courier was already dead when I got there. Whoever did it left the shard. That's not sloppiness. That's bait.",
      visibility: "private",
      isLore: false,
    },
  });

  await prisma.campaignEvent.create({
    data: { campaignId: cid, type: "campaign.seeded", actorUserId: dm.id, summary: "Demo campaign seeded", payload: { ruleId: erp.id } },
  });

  console.log("");
  console.log("Seeded:", CAMPAIGN_NAME);
  console.log("  Invite code : NIGHTCITY");
  console.log("  DM account  : overseer  (overseer@neom.local)");
  console.log("  Player      : antonio   (antonio@neom.local)");
  console.log(`  Password    : ${password}${process.env.SEED_PASSWORD ? "  (from SEED_PASSWORD)" : "  (generated — re-run the seed to rotate)"}`);
  console.log("");
}

// CLI entry (npm run db:seed). When imported (SEED_ON_BOOT), nothing runs automatically.
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  seedDemo(defaultPrisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => defaultPrisma.$disconnect());
}
