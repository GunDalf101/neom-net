import { DEFAULT_FACTIONS, REPUTATION_MAX, REPUTATION_MIN, reputationTier, type FactionDto, type FactionInputSchema, type ReputationChangeSchema, type ReputationEntryDto } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db.js";
import { badRequest, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { logEvent } from "./events.js";

type FactionRow = Prisma.FactionGetPayload<Record<string, never>>;

export function toFactionDto(f: FactionRow): FactionDto {
  return { id: f.id, campaignId: f.campaignId, key: f.key, name: f.name, description: f.description, color: f.color, icon: f.icon, isCity: f.isCity, sortOrder: f.sortOrder };
}

/** Installs the default seven once per campaign (marker event), so a DM who deletes them is not fought. */
export async function ensureDefaultFactions(campaignId: string): Promise<void> {
  const count = await prisma.faction.count({ where: { campaignId } });
  if (count > 0) return;
  const seeded = await prisma.campaignEvent.findFirst({ where: { campaignId, type: "factions.seeded" }, select: { id: true } });
  if (seeded) return;
  await prisma.faction.createMany({
    data: DEFAULT_FACTIONS.map((f, i) => ({ campaignId, key: f.key, name: f.name, description: f.description, color: f.color, icon: f.icon, isCity: f.isCity, sortOrder: i })),
    skipDuplicates: true,
  });
  await logEvent({ campaignId, type: "factions.seeded", summary: `Default factions installed (${DEFAULT_FACTIONS.map((f) => f.name).join(", ")}); edit them from the Reputation page`, visibility: "dm" });
}

export async function listFactions(campaignId: string): Promise<FactionDto[]> {
  await ensureDefaultFactions(campaignId);
  const rows = await prisma.faction.findMany({ where: { campaignId }, orderBy: [{ isCity: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(toFactionDto);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "faction";

export async function createFaction(campaignId: string, dmUserId: string, input: z.infer<typeof FactionInputSchema>): Promise<FactionDto> {
  await ensureDefaultFactions(campaignId);
  let key = slug(input.name);
  if (await prisma.faction.findUnique({ where: { campaignId_key: { campaignId, key } } })) key = `${key}_${Date.now().toString(36).slice(-4)}`;
  const max = await prisma.faction.aggregate({ where: { campaignId }, _max: { sortOrder: true } });
  const row = await prisma.faction.create({ data: { campaignId, key, ...input, sortOrder: input.sortOrder || (max._max.sortOrder ?? 0) + 1 } });
  await logEvent({ campaignId, type: "faction.created", actorUserId: dmUserId, summary: `Faction "${row.name}" added`, visibility: "dm" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "factions" });
  return toFactionDto(row);
}

export async function updateFaction(campaignId: string, dmUserId: string, id: string, input: z.infer<typeof FactionInputSchema>): Promise<FactionDto> {
  const existing = await prisma.faction.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Faction");
  const row = await prisma.faction.update({ where: { id }, data: input });
  await logEvent({ campaignId, type: "faction.updated", actorUserId: dmUserId, summary: `Faction "${row.name}" updated`, visibility: "dm" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "factions" });
  return toFactionDto(row);
}

export async function deleteFaction(campaignId: string, dmUserId: string, id: string): Promise<void> {
  const existing = await prisma.faction.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Faction");
  await prisma.faction.delete({ where: { id } });
  await logEvent({ campaignId, type: "faction.deleted", actorUserId: dmUserId, summary: `Faction "${existing.name}" removed`, visibility: "dm" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "factions" });
}

/** Every faction with the character's standing (0 when never touched). */
export async function getReputation(campaignId: string, characterId: string): Promise<ReputationEntryDto[]> {
  const factions = await listFactions(campaignId);
  const rows = await prisma.reputation.findMany({ where: { characterId } });
  const byFaction = new Map(rows.map((r) => [r.factionId, r]));
  return factions.map((f) => {
    const r = byFaction.get(f.id);
    const value = r?.value ?? 0;
    return { faction: f, value, tier: reputationTier(value), updatedAt: r ? r.updatedAt.toISOString() : null };
  });
}

const clamp = (n: number) => Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, n));

/** DM only (checked by the route). Logs an owner-visible event so the player is notified. */
export async function changeReputation(campaignId: string, dmUserId: string, characterId: string, input: z.infer<typeof ReputationChangeSchema>): Promise<ReputationEntryDto[]> {
  const character = await prisma.character.findFirst({ where: { id: characterId, campaignId }, select: { id: true, name: true, ownerUserId: true } });
  if (!character) throw notFound("Character");
  const faction = await prisma.faction.findFirst({ where: { id: input.factionId, campaignId } });
  if (!faction) throw badRequest("Unknown faction");
  const current = (await prisma.reputation.findUnique({ where: { characterId_factionId: { characterId, factionId: faction.id } } }))?.value ?? 0;
  const next = clamp(input.value !== undefined ? input.value : current + (input.delta ?? 0));
  if (next === current) throw ruleViolation(`${faction.name} standing is already ${current}`);
  await prisma.reputation.upsert({
    where: { characterId_factionId: { characterId, factionId: faction.id } },
    create: { campaignId, characterId, factionId: faction.id, value: next },
    update: { value: next },
  });
  const diff = next - current;
  const from = reputationTier(current);
  const to = reputationTier(next);
  await logEvent({
    campaignId,
    type: "reputation.changed",
    actorUserId: dmUserId,
    characterId,
    summary: `${character.name}'s standing with ${faction.name}: ${current} → ${next} (${diff > 0 ? "+" : ""}${diff})${from !== to ? `, now ${to}` : ""}${input.reason ? ` — ${input.reason}` : ""}`,
    payload: { factionId: faction.id, faction: faction.name, from: current, to: next, delta: diff, tierFrom: from, tierTo: to, reason: input.reason },
    visibility: "owner",
    ownerUserId: character.ownerUserId,
  });
  emitCharacterUpdated(campaignId, characterId);
  return getReputation(campaignId, characterId);
}
