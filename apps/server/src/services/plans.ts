import { CYBERWARE_MAINTENANCE, DISTRICTS, DISTRICT_META, PLAN_KIND_META, REQUIRED_PLAN_KINDS, defaultPlanFor, netSalary, planDue, type CharacterView, type District, type MonthlyBillDto, type MonthlyBillResultDto, type PlanDefinitionDto, type PlanDefinitionInput, type PlanSponsorInput, type PlanSubscribeInput, type Rarity } from "@neom/shared";
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
  if (!actor.isDm && (input.discountPercent !== undefined || input.sponsor)) throw forbidden("Only the DM sponsors plans");
  const discountPercent = actor.isDm ? (input.discountPercent ?? 0) : 0;
  const sponsor = actor.isDm ? input.sponsor?.trim() || null : null;
  const upfront = planDue(plan.purchasePrice, discountPercent);
  if (upfront > full.credits) throw ruleViolation(`Not enough kamas: ${plan.name} costs ${upfront.toLocaleString()} ₭ up front, ${full.credits.toLocaleString()} available`, { upfront, credits: full.credits });
  const replaced = full.plans.filter((p) => p.plan.kind === plan.kind);
  await prisma.$transaction(async (tx) => {
    if (upfront > 0) {
      const paid = await tx.character.updateMany({ where: { id: full.id, credits: { gte: upfront } }, data: { credits: { decrement: upfront } } });
      if (paid.count === 0) throw ruleViolation("Not enough kamas");
    }
    if (replaced.length) await tx.characterPlan.deleteMany({ where: { id: { in: replaced.map((p) => p.id) } } });
    await tx.characterPlan.create({ data: { characterId: full.id, planId: plan.id, discountPercent, sponsor } });
    await tx.character.update({ where: { id: full.id }, data: { version: { increment: 1 } } });
  });
  await logEvent({
    campaignId,
    type: "plan.subscribed",
    actorUserId: actor.userId,
    characterId: full.id,
    summary: `${full.name} took ${plan.name} (${plan.kind}, ${planDue(plan.monthlyCost, discountPercent).toLocaleString()} ₭ / month${discountPercent ? ` after ${discountPercent}% ${sponsor ? `paid by ${sponsor}` : "discount"}` : ""}${upfront ? `, ${upfront.toLocaleString()} ₭ paid up front` : ""})${replaced.length ? `, replacing ${replaced.map((p) => p.plan.name).join(", ")}` : ""}`,
    payload: { planId: plan.id, kind: plan.kind, monthlyCost: plan.monthlyCost, discountPercent, sponsor, upfront, replaced: replaced.map((p) => p.planId) },
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
  const kindMeta = PLAN_KIND_META[held.plan.kind as keyof typeof PLAN_KIND_META];
  if (kindMeta?.required && !actor.isDm) throw ruleViolation(`${kindMeta.label} is not optional: switch to another plan instead of cancelling`);
  await prisma.characterPlan.delete({ where: { id: held.id } });
  await prisma.character.update({ where: { id: full.id }, data: { version: { increment: 1 } } });
  await logEvent({ campaignId, type: "plan.cancelled", actorUserId: actor.userId, characterId: full.id, summary: `${full.name} dropped ${held.plan.name}`, payload: { planId: held.planId, kind: held.plan.kind }, visibility: "owner", ownerUserId: full.ownerUserId });
  emitCharacterUpdated(campaignId, full.id);
  return buildView(await loadFull(full.id), { userId: actor.userId, isDm: actor.isDm });
}

/** DM sponsors a plan the character holds: a corpo pays the rent, the fixer covers half the diet, or the deal ends (0%). */
export async function sponsor(campaignId: string, dmUserId: string, input: PlanSponsorInput): Promise<CharacterView> {
  const full = await loadFull(input.characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");
  const held = full.plans.find((p) => p.planId === input.planId);
  if (!held) throw notFound("Subscription");
  const sponsorName = input.sponsor?.trim() || null;
  await prisma.characterPlan.update({ where: { id: held.id }, data: { discountPercent: input.discountPercent, sponsor: input.discountPercent ? sponsorName : null } });
  await prisma.character.update({ where: { id: full.id }, data: { version: { increment: 1 } } });
  const due = planDue(held.plan.monthlyCost, input.discountPercent);
  await logEvent({
    campaignId,
    type: "plan.sponsored",
    actorUserId: dmUserId,
    characterId: full.id,
    summary: input.discountPercent
      ? `${sponsorName ?? "Someone"} now covers ${input.discountPercent}% of ${full.name}'s ${held.plan.name} (${due.toLocaleString()} ₭ / month left to pay)`
      : `${full.name}'s ${held.plan.name} is no longer sponsored (${held.plan.monthlyCost.toLocaleString()} ₭ / month)`,
    payload: { planId: held.planId, discountPercent: input.discountPercent, sponsor: sponsorName, due },
    visibility: "owner",
    ownerUserId: full.ownerUserId,
  });
  emitCharacterUpdated(campaignId, full.id);
  return buildView(await loadFull(full.id), { userId: dmUserId, isDm: true });
}

// ---------- Monthly billing ----------

/** A character pays tax where their housing is; without housing, where they chose to register; Dogtown by default. */
export function districtOf(full: Pick<FullCharacter, "plans" | "taxDistrict">): { district: District; source: MonthlyBillDto["districtSource"] } {
  const housing = full.plans.find((p) => p.plan.kind === "housing" && p.plan.district);
  if (housing) return { district: housing.plan.district as District, source: "housing" };
  if (full.taxDistrict && (DISTRICTS as readonly string[]).includes(full.taxDistrict)) return { district: full.taxDistrict as District, source: "chosen" };
  return { district: "dogtown", source: "default" };
}

type PlanRow = Prisma.PlanDefinitionGetPayload<Record<string, never>>;

/** Visible plans of the campaign, the pool the required-kind defaults are picked from. */
async function catalogPlans(campaignId: string): Promise<PlanRow[]> {
  return prisma.planDefinition.findMany({ where: { campaignId, visibleToPlayers: true } });
}

export function monthlyBill(full: FullCharacter, catalog: PlanRow[]): MonthlyBillDto {
  const { district, source: districtSource } = districtOf(full);
  const taxPercent = DISTRICT_META[district].taxPercent;
  const salaryGross = full.salary;
  const salaryNet = netSalary(salaryGross, taxPercent);
  type Kind = MonthlyBillDto["plans"][number]["kind"];
  const plans: MonthlyBillDto["plans"] = full.plans.map((p) => ({ planId: p.planId, name: p.plan.name, kind: p.plan.kind as Kind, cost: planDue(p.plan.monthlyCost, p.discountPercent), defaulted: false }));
  // Required kinds are never "none": a character without one is billed the cheapest plan of that kind.
  const typed = catalog.map((p) => ({ ...p, kind: p.kind as Kind }));
  for (const kind of REQUIRED_PLAN_KINDS) {
    if (plans.some((p) => p.kind === kind)) continue;
    const fallback = defaultPlanFor(kind, typed);
    if (fallback) plans.push({ planId: fallback.id, name: fallback.name, kind, cost: fallback.monthlyCost, defaulted: true });
  }
  const maintenance = full.items
    .filter((i) => i.installedSlot)
    .map((i) => ({ itemId: i.id, name: i.customName ?? i.definition.name, rarity: i.definition.rarity as Rarity, cost: CYBERWARE_MAINTENANCE[i.definition.rarity as Rarity] ?? 0 }));
  const total = plans.reduce((s, p) => s + p.cost, 0) + maintenance.reduce((s, m) => s + m.cost, 0);
  return { characterId: full.id, characterName: full.name, credits: full.credits, district, districtSource, taxPercent, salaryGross, salaryNet, plans, maintenance, total, balanceAfter: full.credits + salaryNet - total };
}

/** What every character would pay if the month turned now. */
export async function previewMonth(campaignId: string): Promise<MonthlyBillDto[]> {
  const catalog = await catalogPlans(campaignId);
  return (await loadCampaignFull(campaignId)).map((full) => monthlyBill(full, catalog));
}

/**
 * Turns the month: every character is paid their salary net of the district tax, then pays plans and cyberware
 * upkeep. Plans that cannot be paid lapse (most expensive first); unpaid upkeep leaves the chrome glitching
 * (Cyberware Malfunction) until the DM clears it.
 */
export async function billMonth(campaignId: string, dmUserId: string, onlyCharacterId?: string): Promise<MonthlyBillResultDto[]> {
  const results: MonthlyBillResultDto[] = [];
  const catalog = await catalogPlans(campaignId);
  const everyone = await loadCampaignFull(campaignId);
  const targets = onlyCharacterId ? everyone.filter((c) => c.id === onlyCharacterId) : everyone;
  if (onlyCharacterId && targets.length === 0) throw notFound("Character");
  for (const full of targets) {
    const bill = monthlyBill(full, catalog);
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
    // Defaults that survived the cut become real subscriptions (effects apply from now on).
    const defaulted = affordable.filter((p) => p.defaulted);
    await prisma.$transaction(async (tx) => {
      if (lapsed.length) await tx.characterPlan.deleteMany({ where: { characterId: full.id, plan: { name: { in: lapsed } } } });
      for (const p of defaulted) await tx.characterPlan.create({ data: { characterId: full.id, planId: p.planId } });
      await tx.character.update({ where: { id: full.id }, data: { credits: { increment: bill.salaryNet - paid }, version: { increment: 1 } } });
    });
    await logEvent({
      campaignId,
      type: "month.billed",
      actorUserId: dmUserId,
      characterId: full.id,
      summary: `${full.name}: salary ${bill.salaryGross.toLocaleString()} ₭ − ${bill.taxPercent}% ${DISTRICT_META[bill.district].name} tax = +${bill.salaryNet.toLocaleString()} ₭; paid ${paid.toLocaleString()} ₭ (${affordable.length} plan${affordable.length === 1 ? "" : "s"}${upkeep ? `, upkeep ${maintenanceUnpaid ? "UNPAID" : upkeep.toLocaleString() + " ₭"}` : ""})${defaulted.length ? ` — enrolled by default: ${defaulted.map((p) => p.name).join(", ")}` : ""}${lapsed.length ? ` — lapsed: ${lapsed.join(", ")}` : ""}`,
      payload: { ...bill, paid, lapsed, maintenanceUnpaid, defaulted: defaulted.map((p) => p.name) } as unknown as Record<string, unknown>,
      visibility: "owner",
      ownerUserId: full.ownerUserId,
    });
    if (maintenanceUnpaid && bill.maintenance.length) {
      await applyCondition(full.id, SYSTEM_ACTOR, { conditionKey: "cyberwareMalfunction", note: "Upkeep unpaid this month" }, { sourceLabel: "unpaid cyberware upkeep" });
    }
    emitCharacterUpdated(campaignId, full.id);
    results.push({ ...bill, paid, lapsed, maintenanceUnpaid, defaulted: defaulted.map((p) => p.name) });
  }
  if (!onlyCharacterId) await logEvent({ campaignId, type: "month.turned", actorUserId: dmUserId, summary: `A month passed in Neo City: ${results.length} bill${results.length === 1 ? "" : "s"} settled`, visibility: "public" });
  return results;
}
