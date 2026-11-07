import {
  unmetRequirements,
  type CharacterView,
  type GrantItemInput,
  type InstantEffect,
  type ItemAction,
  type ItemDefinitionDto,
  type ItemDefinitionInput,
  type Requirement,
  type AugmentationSlot,
  type EquipmentSlot,
  type AttributeKey,
  type SpecialSkillKey,
  ATTRIBUTES,
  SPECIAL_SKILLS,
} from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { campaignSettings, getMembership } from "./access.js";
import { buildView, derive, loadFull, type Actor, type FullCharacter, type MutationContext } from "./characters.js";
import { logEvent } from "./events.js";
import { toItemDefinitionDto } from "./mappers.js";
import { applyInstantEffects, dispatchTrigger } from "./rules.js";

// ---------- Definitions ----------

export async function listItemDefinitions(campaignId: string, isDm: boolean): Promise<ItemDefinitionDto[]> {
  const rows = await prisma.itemDefinition.findMany({
    where: isDm ? { campaignId } : { campaignId, visibleToPlayers: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map(toItemDefinitionDto);
}

function definitionData(input: ItemDefinitionInput) {
  if (input.category === "cyberware" && !input.augmentationSlot) throw badRequest("Cyberware needs an augmentation slot");
  return {
    name: input.name,
    description: input.description,
    icon: input.icon,
    imageUrl: input.imageUrl ?? null,
    category: input.category,
    rarity: input.rarity,
    price: input.price,
    weight: input.weight,
    requirements: input.requirements as unknown as Prisma.InputJsonValue,
    effects: input.effects as unknown as Prisma.InputJsonValue,
    useEffects: input.useEffects as unknown as Prisma.InputJsonValue,
    augmentationSlot: input.augmentationSlot,
    equipmentSlot: input.equipmentSlot,
    capacityCost: input.capacityCost,
    stackable: input.stackable,
    maxCharges: input.maxCharges,
    damage: input.damage,
    damageType: input.damageType,
    ruleIds: input.ruleIds,
    tags: input.tags,
    visibleToPlayers: input.visibleToPlayers,
  };
}

export async function createItemDefinition(campaignId: string, input: ItemDefinitionInput): Promise<ItemDefinitionDto> {
  const row = await prisma.itemDefinition.create({ data: { campaignId, ...definitionData(input) } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "items" });
  return toItemDefinitionDto(row);
}

export async function updateItemDefinition(campaignId: string, id: string, input: ItemDefinitionInput): Promise<ItemDefinitionDto> {
  const existing = await prisma.itemDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Item definition");
  const row = await prisma.itemDefinition.update({ where: { id }, data: definitionData(input) });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "items" });
  // Owners of instances see changed stats immediately.
  const owners = await prisma.itemInstance.findMany({ where: { definitionId: id }, select: { characterId: true }, distinct: ["characterId"] });
  for (const o of owners) emitCharacterUpdated(campaignId, o.characterId);
  return toItemDefinitionDto(row);
}

export async function deleteItemDefinition(campaignId: string, id: string): Promise<void> {
  const existing = await prisma.itemDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Item definition");
  await prisma.itemDefinition.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "items" });
}

// ---------- Granting ----------

export async function grantItem(campaignId: string, dmUserId: string | null, input: GrantItemInput): Promise<CharacterView> {
  const def = await prisma.itemDefinition.findFirst({ where: { id: input.definitionId, campaignId } });
  if (!def) throw notFound("Item definition");
  const full = await loadFull(input.characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");

  await prisma.$transaction(async (tx) => {
    const existing = def.stackable
      ? await tx.itemInstance.findFirst({ where: { characterId: full.id, definitionId: def.id, status: "stored" } })
      : null;
    if (existing) {
      await tx.itemInstance.update({ where: { id: existing.id }, data: { quantity: { increment: input.quantity } } });
    } else if (def.stackable) {
      await tx.itemInstance.create({ data: { characterId: full.id, definitionId: def.id, quantity: input.quantity, charges: def.maxCharges } });
    } else {
      for (let i = 0; i < input.quantity; i++) {
        await tx.itemInstance.create({ data: { characterId: full.id, definitionId: def.id, quantity: 1, charges: def.maxCharges } });
      }
    }
    await tx.character.update({ where: { id: full.id }, data: { version: { increment: 1 } } });
  });
  await logEvent({
    campaignId,
    type: "item.granted",
    actorUserId: dmUserId,
    characterId: full.id,
    summary: `${full.name} received ${input.quantity > 1 ? `${input.quantity}× ` : ""}${def.name}${input.note ? ` — ${input.note}` : ""}`,
    payload: { definitionId: def.id, quantity: input.quantity },
  });
  emitCharacterUpdated(campaignId, full.id);
  const refreshed = await loadFull(full.id);
  return buildView(refreshed, { userId: dmUserId ?? full.ownerUserId, isDm: true });
}

// ---------- Instance actions ----------

function requirementContext(full: FullCharacter) {
  const derived = derive(full);
  const attributes = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES) attributes[a] = derived.attributes[a].value;
  const specialRanks = {} as Record<SpecialSkillKey, number>;
  for (const s of SPECIAL_SKILLS) specialRanks[s] = derived.specialSkills[s].rank;
  return {
    derived,
    ctx: {
      level: full.level,
      attributes,
      specialRanks,
      unlockedNodes: full.unlocks.map((u) => ({ key: u.node.key, rank: u.rank })),
      augmentations: full.items.filter((i) => i.installedSlot).map((i) => ({ slot: i.installedSlot as AugmentationSlot, definitionId: i.definitionId })),
    },
  };
}

async function resolve(characterId: string, actor: Actor) {
  const full = await loadFull(characterId);
  let isDm = true;
  if (actor.userId) {
    const m = await getMembership(full.campaignId, actor.userId);
    if (!m) throw forbidden();
    isDm = m.isDm;
    if (!isDm && full.ownerUserId !== actor.userId) throw forbidden("Not your character");
    if (!isDm && campaignSettings(full.campaign).playersReadOnly) throw forbidden("This campaign is DM-controlled: only the Dungeon Master can change characters");
  }
  return { full, isDm };
}

export async function performItemAction(characterId: string, actor: Actor, itemId: string, action: ItemAction, ctx: MutationContext = {}): Promise<CharacterView> {
  const { full, isDm } = await resolve(characterId, actor);
  const item = full.items.find((i) => i.id === itemId);
  if (!item) throw notFound("Item");
  const def = item.definition;
  const settings = campaignSettings(full.campaign);
  const name = item.customName ?? def.name;
  const base = { campaignId: full.campaignId, actorUserId: actor.userId, characterId };
  const depth = ctx.depth ?? 0;

  switch (action.action) {
    case "equip": {
      const slot = action.slot ?? def.equipmentSlot ?? (def.category === "weapon" ? "mainHand" : def.category === "armor" ? "armor" : null);
      if (!slot) throw ruleViolation(`${def.name} cannot be equipped`);
      if (item.installedSlot) throw ruleViolation("Installed cyberware cannot be equipped");
      const { ctx: rctx } = requirementContext(full);
      const unmet = unmetRequirements((def.requirements as unknown as Requirement[]) ?? [], rctx);
      if (unmet.length && !isDm) throw ruleViolation(`Requirements not met: ${unmet.join(", ")}`, { unmet });
      await prisma.$transaction(async (tx) => {
        await tx.itemInstance.updateMany({ where: { characterId, equippedSlot: slot as EquipmentSlot }, data: { equippedSlot: null, status: "stored" } });
        await tx.itemInstance.update({ where: { id: item.id }, data: { equippedSlot: slot as EquipmentSlot, status: "equipped" } });
        await tx.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      });
      await logEvent({ ...base, type: "item.equipped", summary: `${full.name} equipped ${name}${unmet.length ? " (DM waived requirements)" : ""}`, payload: { itemId, slot } });
      emitCharacterUpdated(full.campaignId, characterId);
      if (depth < 3) await dispatchTrigger(characterId, { type: "itemEquipped", definitionId: def.id }, { actorUserId: actor.userId, depth: depth + 1 });
      break;
    }
    case "unequip": {
      if (!item.equippedSlot && item.status !== "equipped") throw ruleViolation("Item is not equipped");
      await prisma.itemInstance.update({ where: { id: item.id }, data: { equippedSlot: null, status: "stored" } });
      await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      await logEvent({ ...base, type: "item.unequipped", summary: `${full.name} unequipped ${name}`, payload: { itemId } });
      emitCharacterUpdated(full.campaignId, characterId);
      if (depth < 3) await dispatchTrigger(characterId, { type: "itemRemoved", definitionId: def.id }, { actorUserId: actor.userId, depth: depth + 1 });
      break;
    }
    case "install": {
      if (!isDm && !settings.playersInstallCyberware) throw forbidden("Only the DM installs cyberware in this campaign");
      const slot = (action.slot ?? def.augmentationSlot) as AugmentationSlot | null;
      if (!slot || def.category !== "cyberware") throw ruleViolation(`${def.name} is not installable cyberware`);
      if (def.augmentationSlot && slot !== def.augmentationSlot) throw ruleViolation(`${def.name} must be installed in the ${def.augmentationSlot} slot`);
      if (item.installedSlot) throw ruleViolation("Already installed");
      const { derived, ctx: rctx } = requirementContext(full);
      const unmet = unmetRequirements((def.requirements as unknown as Requirement[]) ?? [], rctx);
      if (unmet.length && !isDm) throw ruleViolation(`Requirements not met: ${unmet.join(", ")}`, { unmet });
      const occupant = full.items.find((i) => i.installedSlot === slot);
      if (occupant && !action.replace) throw ruleViolation(`${slot} already holds ${occupant.customName ?? occupant.definition.name}. Choose replace to swap it.`, { occupantId: occupant.id });
      const freed = occupant ? occupant.definition.capacityCost : 0;
      const projected = derived.capacityUsed - freed + def.capacityCost;
      if (projected > derived.capacity.value) {
        throw ruleViolation(`Insufficient cyberware capacity: ${projected}/${derived.capacity.value} after install`, { used: derived.capacityUsed, cost: def.capacityCost, capacity: derived.capacity.value });
      }
      await prisma.$transaction(async (tx) => {
        if (occupant) await tx.itemInstance.update({ where: { id: occupant.id }, data: { installedSlot: null, status: "stored" } });
        // Non-stackable: split one unit out of a stack if needed.
        if (item.quantity > 1) {
          await tx.itemInstance.update({ where: { id: item.id }, data: { quantity: { decrement: 1 } } });
          await tx.itemInstance.create({ data: { characterId, definitionId: def.id, quantity: 1, charges: item.charges, installedSlot: slot, status: "installed" } });
        } else {
          await tx.itemInstance.update({ where: { id: item.id }, data: { installedSlot: slot, status: "installed", equippedSlot: null } });
        }
        await tx.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      });
      await logEvent({
        ...base,
        type: "augmentation.installed",
        summary: `${full.name} installed ${name} (${slot})${occupant ? `, replacing ${occupant.customName ?? occupant.definition.name}` : ""}${unmet.length ? " — DM waived requirements" : ""}`,
        payload: { itemId, slot, capacityCost: def.capacityCost, replacedItemId: occupant?.id ?? null, waived: unmet },
      });
      emitCharacterUpdated(full.campaignId, characterId);
      if (depth < 3) await dispatchTrigger(characterId, { type: "augInstalled", slot, definitionId: def.id }, { actorUserId: actor.userId, depth: depth + 1 });
      break;
    }
    case "uninstall": {
      if (!isDm && !settings.playersInstallCyberware) throw forbidden("Only the DM removes cyberware in this campaign");
      if (!item.installedSlot) throw ruleViolation("Not installed");
      const slot = item.installedSlot as AugmentationSlot;
      await prisma.itemInstance.update({ where: { id: item.id }, data: { installedSlot: null, status: "stored" } });
      await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      await logEvent({ ...base, type: "augmentation.removed", summary: `${full.name} removed ${name} from ${slot}`, payload: { itemId, slot } });
      emitCharacterUpdated(full.campaignId, characterId);
      if (depth < 3) await dispatchTrigger(characterId, { type: "itemRemoved", slot, definitionId: def.id }, { actorUserId: actor.userId, depth: depth + 1 });
      break;
    }
    case "use": {
      const useEffects = (def.useEffects as unknown as InstantEffect[]) ?? [];
      const usesCharges = def.maxCharges !== null;
      if (usesCharges) {
        if ((item.charges ?? 0) < action.quantity) throw ruleViolation(`Not enough charges (${item.charges ?? 0} left)`);
        await prisma.itemInstance.update({ where: { id: item.id }, data: { charges: { decrement: action.quantity } } });
      } else if (def.category === "consumable") {
        if (item.quantity < action.quantity) throw ruleViolation(`Only ${item.quantity} left`);
        if (item.quantity === action.quantity) await prisma.itemInstance.delete({ where: { id: item.id } });
        else await prisma.itemInstance.update({ where: { id: item.id }, data: { quantity: { decrement: action.quantity } } });
      } else if (useEffects.length === 0) {
        throw ruleViolation(`${def.name} has no use effect`);
      }
      await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      await logEvent({ ...base, type: "item.used", summary: `${full.name} used ${name}${action.quantity > 1 ? ` ×${action.quantity}` : ""}`, payload: { itemId, quantity: action.quantity } });
      emitCharacterUpdated(full.campaignId, characterId);
      for (let i = 0; i < action.quantity; i++) {
        await applyInstantEffects(characterId, useEffects, { sourceLabel: name, depth: depth + 1, actorUserId: actor.userId });
      }
      break;
    }
    case "drop": {
      const qty = action.quantity ?? item.quantity;
      if (qty > item.quantity) throw ruleViolation(`Only ${item.quantity} available`);
      if (item.installedSlot) throw ruleViolation("Uninstall before dropping");
      if (qty === item.quantity) await prisma.itemInstance.delete({ where: { id: item.id } });
      else await prisma.itemInstance.update({ where: { id: item.id }, data: { quantity: { decrement: qty } } });
      await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      await logEvent({ ...base, type: "item.dropped", summary: `${full.name} dropped ${qty > 1 ? `${qty}× ` : ""}${name}`, payload: { itemId, quantity: qty } });
      break;
    }
    case "setQuantity": {
      if (!isDm) throw forbidden("Only the DM sets quantities directly");
      if (action.quantity === 0) await prisma.itemInstance.delete({ where: { id: item.id } });
      else await prisma.itemInstance.update({ where: { id: item.id }, data: { quantity: action.quantity } });
      await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      await logEvent({ ...base, type: "item.quantity", summary: `${name} quantity set to ${action.quantity} for ${full.name}`, payload: { itemId, quantity: action.quantity } });
      break;
    }
    case "setStatus": {
      if (!isDm) throw forbidden("Only the DM changes cyberware status");
      return setItemStatus(characterId, actor, itemId, action.status, ctx);
    }
    case "setCharges": {
      if (!isDm) throw forbidden("Only the DM sets charges directly");
      await prisma.itemInstance.update({ where: { id: item.id }, data: { charges: action.charges } });
      await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
      await logEvent({ ...base, type: "item.charges", summary: `${name} charges set to ${action.charges} for ${full.name}`, payload: { itemId, charges: action.charges } });
      break;
    }
    case "rename": {
      await prisma.itemInstance.update({ where: { id: item.id }, data: { customName: action.customName } });
      break;
    }
    case "move": {
      await prisma.itemInstance.update({ where: { id: item.id }, data: { container: action.container } });
      break;
    }
  }
  emitCharacterUpdated(full.campaignId, characterId);
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
}

/** Changes an installed augmentation's status (installed / damaged / disabled). Used by the DM and by rules. */
export async function setItemStatus(characterId: string, actor: Actor, itemId: string, status: "installed" | "damaged" | "disabled", ctx: MutationContext = {}): Promise<CharacterView> {
  const { full, isDm } = await resolve(characterId, actor);
  const item = full.items.find((i) => i.id === itemId);
  if (!item) throw notFound("Item");
  if (!item.installedSlot) throw ruleViolation("Only installed cyberware has a status");
  const prev = item.status;
  await prisma.itemInstance.update({ where: { id: item.id }, data: { status } });
  await prisma.character.update({ where: { id: characterId }, data: { version: { increment: 1 } } });
  const name = item.customName ?? item.definition.name;
  await logEvent({
    campaignId: full.campaignId,
    type: "augmentation.status",
    actorUserId: actor.userId,
    characterId,
    summary: `${full.name}'s ${name} is now ${status}${ctx.sourceLabel ? ` — ${ctx.sourceLabel}` : ""}`,
    payload: { itemId, from: prev, to: status },
  });
  emitCharacterUpdated(full.campaignId, characterId);
  if (prev === "installed" && status !== "installed" && (ctx.depth ?? 0) < 3) {
    await dispatchTrigger(characterId, { type: "augDisabled", slot: item.installedSlot as AugmentationSlot, definitionId: item.definitionId }, { actorUserId: actor.userId, depth: (ctx.depth ?? 0) + 1 });
  }
  const refreshed = await loadFull(characterId);
  return buildView(refreshed, { userId: actor.userId ?? full.ownerUserId, isDm });
}
