import { MAX_LEVEL, XP_THRESHOLDS } from "../constants.js";

/** D&D 5e ability modifier. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** D&D 5e proficiency bonus by level (1-20). Levels outside the range are clamped. */
export function proficiencyBonus(level: number): number {
  const lvl = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return 2 + Math.floor((lvl - 1) / 4);
}

export type ProficiencyMultiplier = 0 | 1 | 2;

/** skillModifier = attributeModifier + proficiencyMultiplier × proficiencyBonus */
export function skillModifier(
  attributeModifier: number,
  proficiency: ProficiencyMultiplier,
  profBonus: number,
): number {
  return attributeModifier + proficiency * profBonus;
}

/**
 * Cyberpunk special skill: attributeModifier + rank + proficiency contribution.
 * The proficiency contribution is `multiplier × profBonus` so expertise doubles it when enabled.
 */
export function specialSkillModifier(
  attributeModifier: number,
  rank: number,
  proficiency: ProficiencyMultiplier,
  profBonus: number,
): number {
  return attributeModifier + rank + proficiency * profBonus;
}

/** XP required to reach a level (1-indexed). */
export function xpForLevel(level: number): number {
  const idx = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level))) - 1;
  return XP_THRESHOLDS[idx] ?? 0;
}

/** Level implied by an XP total under the default 5e table. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= (XP_THRESHOLDS[i] ?? 0)) level = i + 1;
  }
  return level;
}

export function formatModifier(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
