import { describe, expect, it } from "vitest";
import {
  abilityModifier,
  applyDamage,
  computeDerivedStats,
  DEFAULT_CAMPAIGN_SETTINGS,
  levelForXp,
  proficiencyBonus,
  skillModifier,
  specialSkillModifier,
  type CharacterSnapshot,
} from "../src/index.js";

function baseSnapshot(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    level: 1,
    attributes: { str: 14, dex: 18, con: 14, int: 16, wis: 12, cha: 10 },
    saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
    skills: {
      athletics: 0,
      acrobatics: 1,
      sleightOfHand: 1,
      stealth: 2,
      arcana: 0,
      history: 0,
      investigation: 1,
      nature: 0,
      religion: 0,
      animalHandling: 0,
      insight: 0,
      medicine: 0,
      perception: 0,
      survival: 0,
      deception: 0,
      intimidation: 0,
      performance: 0,
      persuasion: 0,
    },
    specialSkills: {
      augmentation: { rank: 0, proficiency: 0 },
      reflex: { rank: 1, proficiency: 1 },
      adaptability: { rank: 0, proficiency: 0 },
      hacking: { rank: 2, proficiency: 1 },
      sanity: { rank: 0, proficiency: 0 },
      aura: { rank: 0, proficiency: 0 },
    },
    hpMaxBase: 12,
    sources: [],
    overrides: [],
    settings: DEFAULT_CAMPAIGN_SETTINGS,
    ...overrides,
  };
}

describe("formulas", () => {
  it("computes ability modifiers", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(18)).toBe(4);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(30)).toBe(10);
  });
  it("scales proficiency bonus by level", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(13)).toBe(5);
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(20)).toBe(6);
  });
  it("applies proficiency and expertise", () => {
    expect(skillModifier(4, 0, 2)).toBe(4);
    expect(skillModifier(4, 1, 2)).toBe(6);
    expect(skillModifier(4, 2, 3)).toBe(10);
  });
  it("adds rank for special skills", () => {
    expect(specialSkillModifier(4, 2, 1, 2)).toBe(8);
  });
  it("maps XP to level", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(6500)).toBe(5);
  });
});

describe("derived stats", () => {
  it("computes Antonio's starting sheet", () => {
    const d = computeDerivedStats(baseSnapshot());
    expect(d.modifiers.dex).toBe(4);
    expect(d.profBonus.value).toBe(2);
    expect(d.ac.value).toBe(14);
    expect(d.initiative.value).toBe(4);
    expect(d.speed.value).toBe(9);
    expect(d.skills.stealth.value).toBe(8); // 4 + 2*2
    expect(d.skills.acrobatics.value).toBe(6);
    expect(d.saves.dex.value).toBe(6);
    expect(d.saves.str.value).toBe(2);
    expect(d.specialSkills.hacking.value).toBe(3 + 2 + 2);
    expect(d.specialSkills.reflex.value).toBe(4 + 1 + 2);
    expect(d.capacity.value).toBe(10);
  });

  it("applies modifiers from active sources only and reports a breakdown", () => {
    const d = computeDerivedStats(
      baseSnapshot({
        sources: [
          { id: "a", kind: "augmentation", name: "Plating", active: true, effects: [{ kind: "modifier", target: "ac", value: 2, op: "add" }], capacityCost: 3, occupiesCapacity: true },
          { id: "b", kind: "augmentation", name: "Broken", active: false, effects: [{ kind: "modifier", target: "ac", value: 5, op: "add" }], capacityCost: 2, occupiesCapacity: true },
        ],
      }),
    );
    expect(d.ac.value).toBe(16);
    expect(d.capacityUsed).toBe(5);
    expect(d.ac.breakdown.map((l) => l.label)).toEqual(["Base AC", "DEX modifier", "Plating"]);
  });

  it("does not stack modifiers sharing a stack group", () => {
    const d = computeDerivedStats(
      baseSnapshot({
        sources: [
          { id: "a", kind: "item", name: "Vest", active: true, effects: [{ kind: "modifier", target: "ac", value: 2, op: "add", stackGroup: "armor" }] },
          { id: "b", kind: "item", name: "Plate", active: true, effects: [{ kind: "modifier", target: "ac", value: 3, op: "add", stackGroup: "armor" }] },
          { id: "c", kind: "item", name: "Shield", active: true, effects: [{ kind: "modifier", target: "ac", value: 1, op: "add" }] },
        ],
      }),
    );
    expect(d.ac.value).toBe(10 + 4 + 3 + 1);
    expect(d.ac.breakdown.find((l) => l.label === "Vest")?.kind).toBe("suppressed");
  });

  it("setBase replaces the base figure", () => {
    const d = computeDerivedStats(
      baseSnapshot({
        sources: [{ id: "a", kind: "item", name: "Exo", active: true, effects: [{ kind: "modifier", target: "ac", value: 13, op: "setBase" }] }],
      }),
    );
    expect(d.ac.value).toBe(13 + 4);
  });

  it("attribute modifiers cascade into skills and saves", () => {
    const d = computeDerivedStats(
      baseSnapshot({
        sources: [{ id: "a", kind: "augmentation", name: "Arms", active: true, effects: [{ kind: "modifier", target: "attr.str", value: 4, op: "add" }] }],
      }),
    );
    expect(d.attributes.str.value).toBe(18);
    expect(d.modifiers.str).toBe(4);
    expect(d.skills.athletics.value).toBe(4);
    expect(d.saves.str.value).toBe(4);
  });

  it("applies DM overrides last and keeps the original", () => {
    const d = computeDerivedStats(baseSnapshot({ overrides: [{ id: "o1", target: "ac", value: 22, reason: "Shield wall" }] }));
    expect(d.ac.value).toBe(22);
    expect(d.ac.override?.original).toBe(14);
    expect(d.ac.breakdown.at(-1)?.kind).toBe("override");
  });

  it("grants proficiency through effects", () => {
    const d = computeDerivedStats(
      baseSnapshot({
        sources: [{ id: "a", kind: "skillNode", name: "Ghost", active: true, effects: [{ kind: "proficiency", target: "skill.perception", level: "expertise" }] }],
      }),
    );
    expect(d.skills.perception.proficiency).toBe(2);
    expect(d.skills.perception.value).toBe(1 + 4);
  });

  it("clamps special skill rank to the campaign max", () => {
    const snap = baseSnapshot();
    snap.specialSkills.hacking = { rank: 9, proficiency: 0 };
    const d = computeDerivedStats({ ...snap, settings: { ...DEFAULT_CAMPAIGN_SETTINGS, specialMaxRank: 5 } });
    expect(d.specialSkills.hacking.rank).toBe(5);
  });
});

describe("damage application", () => {
  it("absorbs with temp HP first", () => {
    const r = applyDamage({ hpCurrent: 12, hpTemp: 5 }, 8, "physical", []);
    expect(r.absorbedByTempHp).toBe(5);
    expect(r.hpAfter).toBe(9);
    expect(r.tempAfter).toBe(0);
  });
  it("halves on resistance, doubles on vulnerability, zero on immunity", () => {
    const res = [{ damageType: "fire" as const, level: "resistance" as const, sourceName: "Coat" }];
    expect(applyDamage({ hpCurrent: 20, hpTemp: 0 }, 9, "fire", res).hpAfter).toBe(16);
    const vul = [{ damageType: "emp" as const, level: "vulnerability" as const, sourceName: "Chrome" }];
    expect(applyDamage({ hpCurrent: 20, hpTemp: 0 }, 5, "emp", vul).hpAfter).toBe(10);
    const imm = [{ damageType: "poison" as const, level: "immunity" as const, sourceName: "Filter" }];
    expect(applyDamage({ hpCurrent: 20, hpTemp: 0 }, 50, "poison", imm).hpAfter).toBe(20);
  });
  it("resistance and vulnerability cancel; DM can ignore resistance", () => {
    const both = [
      { damageType: "fire" as const, level: "resistance" as const, sourceName: "a" },
      { damageType: "fire" as const, level: "vulnerability" as const, sourceName: "b" },
    ];
    expect(applyDamage({ hpCurrent: 20, hpTemp: 0 }, 6, "fire", both).hpAfter).toBe(14);
    const res = [{ damageType: "fire" as const, level: "resistance" as const, sourceName: "a" }];
    expect(applyDamage({ hpCurrent: 20, hpTemp: 0 }, 6, "fire", res, { ignoreResistance: true }).hpAfter).toBe(14);
  });
  it("never drops below zero", () => {
    expect(applyDamage({ hpCurrent: 3, hpTemp: 0 }, 50, "physical", []).hpAfter).toBe(0);
  });
});
