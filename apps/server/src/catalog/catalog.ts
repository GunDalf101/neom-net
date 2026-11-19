/**
 * The NEOM//NET catalog: weapons, attachments, ammunition, augments, Shimmer fusions and the economy handbook's
 * plans, converted from the DM's spreadsheets (see docs/catalog). `importCatalog` upserts it into a campaign by
 * (category, name), so it can be re-run after edits without duplicating anything the DM already has.
 */
import { readFileSync } from "node:fs";
import type { PassiveEffect, PlanKind, District } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

interface CatalogItem {
  name: string;
  rarity: string;
  price: number;
  weight: number;
  description: string;
  icon: string;
  tags: string[];
  meta: Record<string, unknown>;
  damage?: string;
  slot?: string;
  capacityCost?: number;
  effects?: PassiveEffect[];
}
interface CatalogPlan {
  kind: PlanKind;
  name: string;
  district?: District;
  monthlyCost: number;
  purchasePrice: number;
  description: string;
  effects: PassiveEffect[];
}
interface Catalog {
  version: number;
  weapons: CatalogItem[];
  attachments: CatalogItem[];
  ammo: CatalogItem[];
  augments: CatalogItem[];
  plans: CatalogPlan[];
  reference: { missionPayouts: string[][]; gangTreasury: string[][] };
}

let cached: Catalog | null = null;
export function loadCatalog(): Catalog {
  if (!cached) cached = JSON.parse(readFileSync(new URL("./neom-catalog.json", import.meta.url), "utf8")) as Catalog;
  return cached;
}

type ItemRow = Omit<Prisma.ItemDefinitionUncheckedCreateInput, "campaignId" | "id">;

function itemRows(c: Catalog): ItemRow[] {
  const base = (it: CatalogItem) => ({
    name: it.name,
    description: it.description,
    icon: it.icon,
    rarity: it.rarity,
    price: it.price,
    weight: it.weight,
    tags: it.tags,
    meta: it.meta as Prisma.InputJsonValue,
    effects: (it.effects ?? []) as unknown as Prisma.InputJsonValue,
    requirements: [] as unknown as Prisma.InputJsonValue,
    useEffects: [] as unknown as Prisma.InputJsonValue,
    ruleIds: [],
    forSale: true,
    visibleToPlayers: true,
  });
  return [
    ...c.weapons.map((w) => ({ ...base(w), category: "weapon", equipmentSlot: "mainHand", damage: w.damage ?? null, damageType: "physical", capacityCost: 0, stackable: false })),
    ...c.attachments.map((a) => ({ ...base(a), category: "attachment", capacityCost: 0, stackable: false })),
    ...c.ammo.map((a) => ({ ...base(a), category: "ammo", capacityCost: 0, stackable: true })),
    ...c.augments.map((a) => ({ ...base(a), category: "cyberware", augmentationSlot: a.slot ?? null, capacityCost: a.capacityCost ?? 0, stackable: false })),
  ];
}

export interface ImportResult {
  items: { created: number; updated: number };
  plans: { created: number; updated: number };
  lore: { created: number };
}

/** Upserts the whole catalog into a campaign. Existing rows keep their id (and so every granted instance). */
export async function importCatalog(campaignId: string): Promise<ImportResult> {
  const c = loadCatalog();
  const result: ImportResult = { items: { created: 0, updated: 0 }, plans: { created: 0, updated: 0 }, lore: { created: 0 } };
  for (const row of itemRows(c)) {
    const existing = await prisma.itemDefinition.findFirst({ where: { campaignId, category: row.category, name: row.name }, select: { id: true } });
    if (existing) {
      await prisma.itemDefinition.update({ where: { id: existing.id }, data: row });
      result.items.updated++;
    } else {
      await prisma.itemDefinition.create({ data: { campaignId, ...row } });
      result.items.created++;
    }
  }
  let order = 0;
  for (const p of c.plans) {
    const data = { kind: p.kind, name: p.name, description: p.description, district: p.district ?? null, monthlyCost: p.monthlyCost, purchasePrice: p.purchasePrice, effects: p.effects as unknown as Prisma.InputJsonValue, visibleToPlayers: true, sortOrder: order++ };
    const existing = await prisma.planDefinition.findFirst({ where: { campaignId, kind: p.kind, name: p.name }, select: { id: true } });
    if (existing) {
      await prisma.planDefinition.update({ where: { id: existing.id }, data });
      result.plans.updated++;
    } else {
      await prisma.planDefinition.create({ data: { campaignId, ...data } });
      result.plans.created++;
    }
  }
  // GM-only reference tables land in the encyclopedia as hidden lore.
  const lore = [
    { name: "GM: mission payouts", body: c.reference.missionPayouts.map((r) => r.join(" · ")).join("\n") },
    { name: "GM: gang treasury", body: c.reference.gangTreasury.map((r) => r.join(": ")).join("\n") },
  ];
  for (const l of lore) {
    const existing = await prisma.encyclopediaEntry.findFirst({ where: { campaignId, kind: "lore", name: l.name }, select: { id: true } });
    if (!existing) {
      await prisma.encyclopediaEntry.create({ data: { campaignId, kind: "lore", name: l.name, body: l.body, visibleToPlayers: false } });
      result.lore.created++;
    }
  }
  return result;
}
