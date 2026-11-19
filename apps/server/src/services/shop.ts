import type { CharacterView, ShopBuyInput, ShopDto } from "@neom/shared";
import { prisma } from "../db.js";
import { forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { importCatalog, type ImportResult } from "../catalog/catalog.js";
import { getMembership } from "./access.js";
import { loadFull } from "./characters.js";
import { logEvent } from "./events.js";
import { grantItem } from "./items.js";
import { toItemDefinitionDto } from "./mappers.js";

/** The storefront: items for sale (the DM also sees the ones hidden from players). */
export async function getShop(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<ShopDto> {
  const rows = await prisma.itemDefinition.findMany({ where: viewer.isDm ? { campaignId, forSale: true } : { campaignId, forSale: true, visibleToPlayers: true }, orderBy: [{ category: "asc" }, { price: "asc" }] });
  return { items: rows.map(toItemDefinitionDto) };
}

/** Buys from the shop for a character: owner or DM, paid in kamas at the listed price, stock permitting. */
export async function buy(campaignId: string, actor: { userId: string; isDm: boolean }, input: ShopBuyInput): Promise<CharacterView> {
  const full = await loadFull(input.characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");
  if (!actor.isDm && full.ownerUserId !== actor.userId) throw forbidden("You can only shop for your own character");
  const def = await prisma.itemDefinition.findFirst({ where: { id: input.definitionId, campaignId, forSale: true, ...(actor.isDm ? {} : { visibleToPlayers: true }) } });
  if (!def) throw notFound("Shop item");
  if (def.stock !== null && def.stock < input.quantity) throw ruleViolation(def.stock === 0 ? `${def.name} is sold out` : `Only ${def.stock} × ${def.name} left`, { stock: def.stock });
  const unit = def.price;
  const total = unit * input.quantity;
  if (full.credits < total) throw ruleViolation(`Not enough kamas: ${total.toLocaleString()} needed, ${full.credits.toLocaleString()} available`, { total, credits: full.credits });

  await prisma.$transaction(async (tx) => {
    const paid = await tx.character.updateMany({ where: { id: full.id, credits: { gte: total } }, data: { credits: { decrement: total }, version: { increment: 1 } } });
    if (paid.count === 0) throw ruleViolation("Not enough kamas");
    if (def.stock !== null) {
      const stocked = await tx.itemDefinition.updateMany({ where: { id: def.id, stock: { gte: input.quantity } }, data: { stock: { decrement: input.quantity } } });
      if (stocked.count === 0) throw ruleViolation(`${def.name} just sold out`);
    }
  });
  await logEvent({
    campaignId,
    type: "shop.purchase",
    actorUserId: actor.userId,
    characterId: full.id,
    summary: `${full.name} bought ${input.quantity > 1 ? `${input.quantity}× ` : ""}${def.name} for ${total.toLocaleString()} ₭`,
    payload: { definitionId: def.id, quantity: input.quantity, unitPrice: unit, total },
    visibility: "owner",
    ownerUserId: full.ownerUserId,
  });
  if (def.stock !== null) emitToCampaign(campaignId, "content.updated", { campaignId, kind: "shop" });
  const view = await grantItem(campaignId, actor.isDm ? actor.userId : null, { characterId: full.id, definitionId: def.id, quantity: input.quantity, note: `bought for ${total.toLocaleString()} ₭` });
  emitCharacterUpdated(campaignId, full.id);
  return view;
}

/** DM: load (or refresh) the built-in NEOM catalog into this campaign. */
export async function importCatalogInto(campaignId: string, dmUserId: string): Promise<ImportResult> {
  const result = await importCatalog(campaignId);
  await logEvent({ campaignId, type: "shop.catalog", actorUserId: dmUserId, summary: `NEOM catalog imported: ${result.items.created} new items, ${result.items.updated} refreshed, ${result.plans.created} new plans`, visibility: "dm", payload: result as unknown as Record<string, unknown> });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "items" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "shop" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "plans" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "encyclopedia" });
  return result;
}

export async function assertMember(campaignId: string, userId: string) {
  const m = await getMembership(campaignId, userId);
  if (!m) throw forbidden();
  return m;
}
