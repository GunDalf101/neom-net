import { CYBERWARE_MAINTENANCE, DISTRICT_META, netSalary, type CharacterView, type District, type MonthlyBillDto, type MonthlyBillResultDto, type PlanDefinitionDto, type PlanDefinitionInput, type PlanSubscribeInput, type Rarity } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { getActiveSession } from "./campaigns.js";
import { SYSTEM_ACTOR, applyCondition, buildView, loadCampaignFull, loadFull, type FullCharacter } from "./characters.js";
import { logEvent } from "./events.js";
import { toPlanDto } from "./mappers.js";

// ---------- Catalog (DM) ----------

export async function listPlans(campaignId: string, isDm: boolean): Promise<PlanDefinitionDto[]> {
  const rows = await prisma.planDefinition.findMany({ where: isDm ? { campaignId } : { campaignId, visibleToPlayers: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { monthlyCost: "asc" }] });
  return rows.map(toPlanDto);
}

function planData(input: PlanDefinitionInput) {
  return { kind: input.kind, name: input.name, description: input.description, district: input.kind === "housing" ? input.district : null, monthlyCost: input.monthlyCost, purchasePrice: input.purchasePrice, effects: input.effects as unknown as Prisma.InputJsonValue, visibleToPlayers: input.visibleToPlayers, sortOrder: input.sortOrder };
}

export async function createPlan(campaignId: string, input: PlanDefinitionInput): Promise<PlanDefinitionDto> {
  const row = await prisma.planDefinition.create({ data: { campaignId, ...planData(input) } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "plans" });
  return toPlanDto(row);
}

export async function updatePlan(campaignId: string, id: string, input: PlanDefinitionInput): Promise<PlanDefinitionDto> {
  const existing = await prisma.planDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Plan");
  const row = await prisma.planDefinition.update({ where: { id }, data: planData(input) });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "plans" });
  const holders = await prisma.characterPlan.findMany({ where: { planId: id }, select: { characterId: true } });
  for (const h of holders) emitCharacterUpdated(campaignId, h.characterId);
  return toPlanDto(row);
}

export async function deletePlan(campaignId: string, id: string): Promise<void> {
  const existing = await prisma.planDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Plan");
  const holders = await prisma.characterPlan.findMany({ where: { planId: id }, select: { characterId: true } });
  await prisma.planDefinition.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "plans" });
  for (const h of holders) emitCharacterUpdated(campaignId, h.characterId);
}

// ---------- Subscriptions ----------

async function resolveCharacter(campaignId: string, actor: { userId: string; isDm: boolean }, characterId: string): Promise<FullCharacter> {
  const full = await loadFull(characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");
  if (!actor.isDm && full.ownerUserId !== actor.userId) throw forbidden("You can only manage your own character's plans");
  // Plans are downtime business: once the DM starts a live session they are locked for players until it ends.
  if (!actor.isDm && (await getActiveSession(campaignId))) throw forbidden("Plans are locked while the session is live. Change them between sessions.");
  return full;
}

/** Subscribes to a plan, replacing any plan of the same kind. Vehicles are paid for on the spot. */
export async function subscribe(campaignId: string, actor: { userId: string; isDm: boolean }, input: PlanSubscribeInput): Promise<CharacterView> {
  const full = await resolveCharacter(campaignId, actor, input.characterId);
  const plan = await prisma.planDefinition.findFirst({ where: { id: input.planId, campaignId, ...(actor.isDm ? {} : { visibleToPlayers: true }) } });
  if (!plan) throw notFound("Plan");
  if (full.plans.some((p) => p.planId === plan.id)) throw ruleViolation(`${full.name} already has ${plan.name}`);
  const upfront = plan.purchasePrice;
  if (upfront > full.credits) throw ruleViolation(`Not enough kamas: ${plan.name} costs ${upfront.toLocaleString()} ₭ up front, ${full.credits.toLocaleString()} available`, { upfront, credits: full.credits });
  const replaced = full.plans.filter((p) => p.plan.kind === plan.kind);
  await prisma.$transaction(async (tx) => {
    if (upfront > 0) {
      const paid = await tx.character.updateMany({ where: { id: full.id, credits: { gte: upfront } }, data: { credits: { decrement: upfront } } });
      if (paid.count === 0) throw ruleViolation("Not enough kamas");
    }
    if (replaced.length) await tx.characterPlan.deleteMany({ where: { id: { in: replaced.map((p) => p.id) } } });
    await tx.characterPlan.create({ data: { characterId: full.id, planId: plan.id } });
    await tx.character.update({ where: { id: full.id }, data: { version: { increment: 1 } } });
  });
  await logEvent({
    campaignId,
    type: "plan.subscribed",
    actorUserId: actor.userId,
    characterId: full.id,
    summary: `${full.name} took ${plan.name} (${plan.kind}, ${plan.monthlyCost.toLocaleString()} ₭ / month${upfront ? `, ${upfront.toLocaleString()} ₭ paid up front` : ""})${replaced.length ? `, replacing ${replaced.map((p) => p.plan.name).join(", ")}` : ""}`,
    payload: { planId: plan.id, kind: plan.kind, monthlyCost: plan.monthlyCost, upfront, replaced: replaced.map((p) => p.planId) },
    visibility: "owner",
    ownerUserId: full.ownerUserId,
  });
  emitCharacterUpdated(campaignId, full.id);
  return buildView(await loadFull(full.id), { userId: actor.userId, isDm: actor.isDm });
}

export async function unsubscribe(campaignId: string, actor: { userId: string; isDm: boolean }, input: PlanSubscribeInput): Promise<CharacterView> {
  const full = await resolveCharacter(campaignId, actor, input.characterId);
  const held = full.plans.find((p) => p.planId === input.planId);
  if (!held) throw notFound("Subscription");
  await prisma.characterPlan.delete({ where: { id: held.id } });
  await prisma.character.update({ where: { id: full.id }, data: { version: { increment: 1 } } });
  await logEvent({ campaignId, type: "plan.cancelled", actorUserId: actor.userId, characterId: full.id, summary: `${full.name} dropped ${held.plan.name}`, payload: { planId: held.planId, kind: held.plan.kind }, visibility: "owner", ownerUserId: full.ownerUserId });
  emitCharacterUpdated(campaignId, full.id);
  return buildView(await loadFull(full.id), { userId: actor.userId, isDm: actor.isDm });
}

// ---------- Monthly billing ----------

/** A character lives where their housing plan is; Dogtown without one. */
export function districtOf(full: Pick<FullCharacter, "plans">): District {
  const housing = full.plans.find((p) => p.plan.kind === "housing" && p.plan.district);
  return (housing?.plan.district as District | undefined) ?? "dogtown";
}

export function monthlyBill(full: FullCharacter): MonthlyBillDto {
  const district = districtOf(full);
  const taxPercent = DISTRICT_META[district].taxPercent;
  const salaryGross = full.salary;
  const salaryNet = netSalary(salaryGross, taxPercent);
  const plans = full.plans.map((p) => ({ planId: p.planId, name: p.plan.name, kind: p.plan.kind as MonthlyBillDto["plans"][number]["kind"], cost: p.plan.monthlyCost }));
  const maintenance = full.items
    .filter((i) => i.installedSlot)
    .map((i) => ({ itemId: i.id, name: i.customName ?? i.definition.name, rarity: i.definition.rarity as Rarity, cost: CYBERWARE_MAINTENANCE[i.definition.rarity as Rarity] ?? 0 }));
  const total = plans.reduce((s, p) => s + p.cost, 0) + maintenance.reduce((s, m) => s + m.cost, 0);
  return { characterId: full.id, characterName: full.name, credits: full.credits, district, taxPercent, salaryGross, salaryNet, plans, maintenance, total, balanceAfter: full.credits + salaryNet - total };
}

/** What every character would pay if the month turned now. */
export async function previewMonth(campaignId: string): Promise<MonthlyBillDto[]> {
  return (await loadCampaignFull(campaignId)).map(monthlyBill);
}

/**
 * Turns the month: every character is paid their salary net of the district tax, then pays plans and cyberware
 * upkeep. Plans that cannot be paid lapse (most expensive first); unpaid upkeep leaves the chrome glitching
 * (Cyberware Malfunction) until the DM clears it.
 */
export async function billMonth(campaignId: string, dmUserId: string): Promise<MonthlyBillResultDto[]> {
  const results: MonthlyBillResultDto[] = [];
  for (const full of await loadCampaignFull(campaignId)) {
    const bill = monthlyBill(full);
    // Payday first, so the rent comes out of this month's salary.
    let credits = full.credits + bill.salaryNet;
    const lapsed: string[] = [];
    const keep = [...bill.plans].sort((a, b) => a.cost - b.cost);
    const affordable: typeof keep = [];
    // Cheapest plans survive first; drop the dearest until the rest fits.
    let planTotal = keep.reduce((s, p) => s + p.cost, 0);
    const dropOrder = [...keep].reverse();
    for (const p of dropOrder) {
      if (planTotal <= credits) break;
      lapsed.push(p.name);
      planTotal -= p.cost;
    }
    for (const p of keep) if (!lapsed.includes(p.name)) affordable.push(p);
    credits -= planTotal;
    const upkeep = bill.maintenance.reduce((s, m) => s + m.cost, 0);
    const maintenanceUnpaid = upkeep > credits;
    const upkeepPaid = maintenanceUnpaid ? 0 : upkeep;
    credits -= upkeepPaid;
    const paid = planTotal + upkeepPaid;
    await prisma.$transaction(async (tx) => {
      if (lapsed.length) await tx.characterPlan.deleteMany({ where: { characterId: full.id, plan: { name: { in: lapsed } } } });
      await tx.character.update({ where: { id: full.id }, data: { credits: { increment: bill.salaryNet - paid }, version: { increment: 1 } } });
    });
    await logEvent({
      campaignId,
      type: "month.billed",
      actorUserId: dmUserId,
      characterId: full.id,
      summary: `${full.name}: salary ${bill.salaryGross.toLocaleString()} ₭ − ${bill.taxPercent}% ${DISTRICT_META[bill.district].name} tax = +${bill.salaryNet.toLocaleString()} ₭; paid ${paid.toLocaleString()} ₭ (${affordable.length} plan${affordable.length === 1 ? "" : "s"}${upkeep ? `, upkeep ${maintenanceUnpaid ? "UNPAID" : upkeep.toLocaleString() + " ₭"}` : ""})${lapsed.length ? ` — lapsed: ${lapsed.join(", ")}` : ""}`,
      payload: { ...bill, paid, lapsed, maintenanceUnpaid } as unknown as Record<string, unknown>,
      visibility: "owner",
      ownerUserId: full.ownerUserId,
    });
    if (maintenanceUnpaid && bill.maintenance.length) {
      await applyCondition(full.id, SYSTEM_ACTOR, { conditionKey: "cyberwareMalfunction", note: "Upkeep unpaid this month" }, { sourceLabel: "unpaid cyberware upkeep" });
    }
    emitCharacterUpdated(campaignId, full.id);
    results.push({ ...bill, paid, lapsed, maintenanceUnpaid });
  }
  await logEvent({ campaignId, type: "month.turned", actorUserId: dmUserId, summary: `A month passed in Neo City: ${results.length} bill${results.length === 1 ? "" : "s"} settled`, visibility: "public" });
  return results;
}
