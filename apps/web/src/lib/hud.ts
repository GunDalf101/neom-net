import { ATTRIBUTE_META, type AttributeKey, type SpecialSkillKey, type StatValue } from "@neom/shared";

export const ATTR_ICON: Record<AttributeKey, string> = { str: "biceps-flexed", dex: "zap", con: "cross", int: "brain", wis: "eye", cha: "crown" };
export const SPECIAL_ICON: Record<SpecialSkillKey, string> = { augmentation: "bot", reflex: "activity", adaptability: "dna", hacking: "terminal", sanity: "brain-circuit", aura: "sparkles" };

export const attrColor = (a: AttributeKey) => `var(--color-${ATTRIBUTE_META[a].color})`;

/** "10 + 4 (DEX) + 2 (Trench Coat)" style explanation from a breakdown. */
export function breakdownText(stat: StatValue, opts: { unit?: string } = {}): string {
  const lines = stat.breakdown.filter((l) => l.kind !== "suppressed");
  const parts: string[] = [];
  for (const l of lines) {
    const label = l.label
      .replace(/ modifier$/i, "")
      .replace(/^Base (AC|speed|max HP|capacity)$/i, "Base")
      .replace(/^Level \d+ proficiency$/i, "Level");
    if (l.kind === "base") parts.push(`${label === "Base" ? "" : `${label} `}${l.value}${opts.unit ?? ""}`.trim());
    else if (l.kind === "override") parts.push(`→ ${stat.value} (DM)`);
    else parts.push(`${l.value >= 0 ? "+" : "−"} ${Math.abs(l.value)} (${label})`);
  }
  return parts.join("  ");
}
