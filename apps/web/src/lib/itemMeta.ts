import type { ItemDefinitionDto, ItemDefinitionInput } from "@neom/shared";

/** Human labels for the structured catalog data carried in `ItemDefinition.meta`. Unknown keys are shown as-is. */
const LABELS: Record<string, string> = {
  weaponClass: "Class",
  weaponCategory: "Category",
  ammoType: "Ammo",
  rangeFt: "Range",
  fireMode: "Fire mode",
  magazine: "Magazine",
  attachmentSlots: "Attachment slots",
  maxAttachmentTier: "Max attachment tier",
  slotTypes: "Slot types",
  compatTags: "Fits",
  attachmentType: "Attachment type",
  primaryStat: "Primary stat",
  bonus: "Bonus",
  permanentStrain: "Permanent strain",
  activationStrain: "Activation strain",
  maxHpPenalty: "Max HP penalty",
  penalty: "Downside",
  priceMultiplier: "Price",
};
const HIDDEN = new Set(["shimmer", "perMagazine", "special"]);
const ORDER = Object.keys(LABELS);

export function metaRows(d: Pick<ItemDefinitionDto, "meta">): [string, string][] {
  const out: [string, string][] = [];
  const keys = Object.keys(d.meta).sort((a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)));
  for (const k of keys) {
    if (HIDDEN.has(k)) continue;
    const v = d.meta[k];
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    let text: string;
    if (k === "rangeFt") text = `${v} ft`;
    else if (k === "priceMultiplier") text = `×${v} of a standard magazine`;
    else if (k === "maxHpPenalty") text = `−${v}`;
    else if (k === "activationStrain" && Number(v) === 0) continue;
    else if (Array.isArray(v)) text = v.join(", ");
    else if (typeof v === "boolean") text = v ? "yes" : "no";
    else text = String(v);
    out.push([LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), text]);
  }
  return out;
}

/** A definition as the PUT body expects it (the server ignores id / timestamps). */
export function toItemInput(d: ItemDefinitionDto): ItemDefinitionInput {
  return { ...d, imageUrl: d.imageUrl ?? null };
}

/** Shop / inventory section an item belongs to: Shimmer fusions get their own shelf. */
export function shelfOf(d: Pick<ItemDefinitionDto, "category" | "meta">): string {
  if (d.category === "cyberware") return d.meta.shimmer ? "shimmer" : "cyberware";
  if (d.category === "tool" || d.category === "misc" || d.category === "custom" || d.category === "quest") return "gear";
  return d.category;
}

export const SHELF_META: Record<string, { label: string; icon: string }> = {
  weapon: { label: "Weapons", icon: "crosshair" },
  attachment: { label: "Attachments", icon: "puzzle" },
  ammo: { label: "Ammo", icon: "circle-dot" },
  cyberware: { label: "Augments", icon: "cpu" },
  shimmer: { label: "Shimmer", icon: "sparkles" },
  armor: { label: "Armor", icon: "shield" },
  consumable: { label: "Consumables", icon: "syringe" },
  gear: { label: "Gear", icon: "wrench" },
};
export const SHELF_ORDER = ["weapon", "attachment", "ammo", "cyberware", "shimmer", "armor", "consumable", "gear"];
