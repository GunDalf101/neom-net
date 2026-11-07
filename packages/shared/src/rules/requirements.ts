import type { AttributeKey, AugmentationSlot, SpecialSkillKey } from "../constants.js";
import { describeRequirement, type Requirement } from "./effects.js";

export interface RequirementContext {
  level: number;
  attributes: Record<AttributeKey, number>;
  specialRanks: Record<SpecialSkillKey, number>;
  unlockedNodes: { key: string; rank: number }[];
  augmentations: { slot: AugmentationSlot; definitionId: string }[];
}

/** Returns a human-readable list of unmet requirements (empty when all pass). */
export function unmetRequirements(requirements: Requirement[], ctx: RequirementContext): string[] {
  const unmet: string[] = [];
  for (const r of requirements) {
    let ok = true;
    switch (r.kind) {
      case "attribute":
        ok = (ctx.attributes[r.attribute] ?? 0) >= r.min;
        break;
      case "specialRank":
        ok = (ctx.specialRanks[r.skill] ?? 0) >= r.min;
        break;
      case "level":
        ok = ctx.level >= r.min;
        break;
      case "skillTreeNode":
        ok = ctx.unlockedNodes.some((n) => n.key === r.nodeKey && n.rank >= r.minRank);
        break;
      case "augmentationInstalled":
        ok = ctx.augmentations.some((a) => (!r.slot || a.slot === r.slot) && (!r.definitionId || a.definitionId === r.definitionId));
        break;
    }
    if (!ok) unmet.push(describeRequirement(r));
  }
  return unmet;
}
