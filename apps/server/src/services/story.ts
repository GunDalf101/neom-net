import type { JournalEntryDto, JournalInput, MissionDto, MissionInput, MissionResponseSchema, NpcDto, NpcInput } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db.js";
import { forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { playerIsReadOnly } from "./access.js";
import { logEvent } from "./events.js";
import { grantItem } from "./items.js";
import { toJournalDto, toMissionDto, toNpcDto } from "./mappers.js";

// ---------- NPCs ----------

export async function listNpcs(campaignId: string, isDm: boolean): Promise<NpcDto[]> {
  const rows = await prisma.npcDefinition.findMany({ where: isDm ? { campaignId } : { campaignId, visibleToPlayers: true }, orderBy: { name: "asc" } });
  return rows.map(toNpcDto);
}

function npcData(input: NpcInput) {
  return {
    name: input.name,
    description: input.description,
    portraitUrl: input.portraitUrl,
    faction: input.faction,
    attributes: input.attributes,
    hpMax: input.hpMax,
    ac: input.ac,
    speed: input.speed,
    abilities: input.abilities as unknown as Prisma.InputJsonValue,
    effects: input.effects as unknown as Prisma.InputJsonValue,
    ruleIds: input.ruleIds,
    visibleToPlayers: input.visibleToPlayers,
    isEnemy: input.isEnemy,
  };
}

export async function createNpc(campaignId: string, input: NpcInput): Promise<NpcDto> {
  const row = await prisma.npcDefinition.create({ data: { campaignId, ...npcData(input) } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "npcs" });
  return toNpcDto(row);
}

export async function updateNpc(campaignId: string, id: string, input: NpcInput): Promise<NpcDto> {
  const existing = await prisma.npcDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("NPC");
  const row = await prisma.npcDefinition.update({ where: { id }, data: npcData(input) });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "npcs" });
  return toNpcDto(row);
}

export async function deleteNpc(campaignId: string, id: string): Promise<void> {
  const existing = await prisma.npcDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("NPC");
  await prisma.npcDefinition.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "npcs" });
}

// ---------- Missions ----------

const missionInclude = { assignments: true } satisfies Prisma.MissionInclude;

export async function listMissions(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<MissionDto[]> {
  const rows = await prisma.mission.findMany({
    where: viewer.isDm
      ? { campaignId }
      : { campaignId, visibleToPlayers: true, OR: [{ assignedOnly: false }, { assignments: { some: { character: { ownerUserId: viewer.userId } } } }] },
    include: missionInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toMissionDto);
}

async function writeMission(campaignId: string, input: MissionInput, id?: string) {
  const chars = await prisma.character.findMany({ where: { campaignId, id: { in: input.assignedCharacterIds } }, select: { id: true } });
  const validIds = chars.map((c) => c.id);
  const data = {
    name: input.name,
    description: input.description,
    objectives: input.objectives as unknown as Prisma.InputJsonValue,
    status: input.status,
    rewards: input.rewards as unknown as Prisma.InputJsonValue,
    visibleToPlayers: input.visibleToPlayers,
    assignedOnly: input.assignedOnly,
  };
  return prisma.$transaction(async (tx) => {
    const m = id
      ? await tx.mission.update({ where: { id }, data })
      : await tx.mission.create({ data: { campaignId, ...data } });
    await tx.missionAssignment.deleteMany({ where: { missionId: m.id, characterId: { notIn: validIds } } });
    for (const cid of validIds) {
      await tx.missionAssignment.upsert({ where: { missionId_characterId: { missionId: m.id, characterId: cid } }, create: { missionId: m.id, characterId: cid }, update: {} });
    }
    return tx.mission.findUniqueOrThrow({ where: { id: m.id }, include: missionInclude });
  });
}

/** Who may see a mission's public events: everyone, or only the assigned crew (per-owner events). */
function missionAudience(input: MissionInput): "public" | "crew" | "dm" {
  if (!input.visibleToPlayers) return "dm";
  return input.assignedOnly ? "crew" : "public";
}

/** Notifies newly assigned characters' players (always pushed, see push.ts ALWAYS). */
async function notifyAssignments(campaignId: string, dmUserId: string, mission: { id: string; name: string }, newCharacterIds: string[], audience: "public" | "crew" | "dm") {
  if (newCharacterIds.length === 0 || audience === "dm") return;
  const chars = await prisma.character.findMany({ where: { id: { in: newCharacterIds } }, select: { id: true, name: true, ownerUserId: true } });
  for (const c of chars) {
    await logEvent({
      campaignId,
      type: "mission.assigned",
      actorUserId: dmUserId,
      characterId: c.id,
      summary: `Mission "${mission.name}" assigned to ${c.name}`,
      payload: { missionId: mission.id },
      visibility: "owner",
      ownerUserId: c.ownerUserId,
    });
  }
}

/** For crew-only missions, status changes go to each assigned player instead of the whole campaign. */
async function notifyCrew(campaignId: string, dmUserId: string, mission: { id: string; name: string }, characterIds: string[], type: string, summary: string) {
  const chars = await prisma.character.findMany({ where: { id: { in: characterIds } }, select: { id: true, ownerUserId: true } });
  for (const c of chars) await logEvent({ campaignId, type, actorUserId: dmUserId, characterId: c.id, summary, payload: { missionId: mission.id }, visibility: "owner", ownerUserId: c.ownerUserId });
}

export async function createMission(campaignId: string, dmUserId: string, input: MissionInput): Promise<MissionDto> {
  const m = await writeMission(campaignId, input);
  const audience = missionAudience(input);
  if (audience === "public") await logEvent({ campaignId, type: "mission.created", actorUserId: dmUserId, summary: `Mission "${m.name}" posted`, visibility: "public" });
  else await logEvent({ campaignId, type: "mission.created", actorUserId: dmUserId, summary: `Mission "${m.name}" posted${audience === "crew" ? " (crew only)" : " (hidden)"}`, visibility: "dm" });
  await notifyAssignments(campaignId, dmUserId, m, m.assignments.map((a) => a.characterId), audience);
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
  return toMissionDto(m);
}

export async function updateMission(campaignId: string, dmUserId: string, id: string, input: MissionInput): Promise<MissionDto> {
  const existing = await prisma.mission.findFirst({ where: { id, campaignId }, include: missionInclude });
  if (!existing) throw notFound("Mission");
  const m = await writeMission(campaignId, input, id);
  const audience = missionAudience(input);
  const before = new Set(existing.assignments.map((a) => a.characterId));
  const added = m.assignments.map((a) => a.characterId).filter((cid) => !before.has(cid));
  // Becoming visible counts as a fresh assignment for everyone on the crew.
  const revealed = (!existing.visibleToPlayers && input.visibleToPlayers) ? m.assignments.map((a) => a.characterId).filter((cid) => !added.includes(cid)) : [];
  await notifyAssignments(campaignId, dmUserId, m, [...added, ...revealed], audience);
  if (existing.status !== input.status) {
    const summary = `Mission "${m.name}" is now ${input.status}`;
    if (audience === "public") await logEvent({ campaignId, type: "mission.status", actorUserId: dmUserId, summary, visibility: "public" });
    else {
      await logEvent({ campaignId, type: "mission.status", actorUserId: dmUserId, summary, visibility: "dm" });
      if (audience === "crew") await notifyCrew(campaignId, dmUserId, m, m.assignments.map((a) => a.characterId), "mission.status", summary);
    }
  }
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
  return toMissionDto(m);
}

export async function deleteMission(campaignId: string, id: string): Promise<void> {
  const existing = await prisma.mission.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Mission");
  await prisma.mission.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
}

/** Players can tick objectives on missions assigned to their characters. */
export async function toggleObjective(campaignId: string, userId: string, isDm: boolean, missionId: string, objectiveId: string, done: boolean): Promise<MissionDto> {
  const m = await prisma.mission.findFirst({ where: { id: missionId, campaignId }, include: { campaign: true, assignments: { include: { character: { select: { ownerUserId: true } } } } } });
  if (!m) throw notFound("Mission");
  if (playerIsReadOnly(m.campaign, isDm)) throw forbidden("This campaign is DM-controlled: only the Dungeon Master updates missions");
  const mine = m.assignments.filter((a) => a.character.ownerUserId === userId);
  if (!isDm && mine.length === 0) throw forbidden("Mission is not assigned to your character");
  if (!isDm && !mine.some((a) => a.response === "accepted")) throw forbidden(mine.some((a) => a.response === "declined") ? "You declined this mission" : "Accept the mission before working its objectives");
  const objectives = ((m.objectives as { id: string; text: string; done: boolean }[]) ?? []).map((o) => (o.id === objectiveId ? { ...o, done } : o));
  const updated = await prisma.mission.update({ where: { id: missionId }, data: { objectives }, include: missionInclude });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
  return toMissionDto(updated);
}

/** Marks the mission complete and grants its rewards to every assigned character exactly once. */
export async function completeMission(campaignId: string, dmUserId: string, missionId: string): Promise<MissionDto> {
  const m = await prisma.mission.findFirst({ where: { id: missionId, campaignId }, include: missionInclude });
  if (!m) throw notFound("Mission");
  if (m.rewardsGrantedAt) throw ruleViolation("Rewards were already granted for this mission");
  const rewards = (m.rewards as { xp?: number; credits?: number; progressionPoints?: number; itemDefinitionIds?: string[] }) ?? {};
  // Crew who declined the offer are not paid.
  const charIds = m.assignments.filter((a) => a.response !== "declined").map((a) => a.characterId);
  await prisma.$transaction(async (tx) => {
    for (const cid of charIds) {
      await tx.character.update({
        where: { id: cid },
        data: {
          xp: { increment: rewards.xp ?? 0 },
          credits: { increment: rewards.credits ?? 0 },
          progressionPoints: { increment: rewards.progressionPoints ?? 0 },
          version: { increment: 1 },
        },
      });
    }
    await tx.mission.update({ where: { id: missionId }, data: { status: "completed", rewardsGrantedAt: new Date() } });
  });
  for (const cid of charIds) {
    for (const defId of rewards.itemDefinitionIds ?? []) {
      await grantItem(campaignId, dmUserId, { characterId: cid, definitionId: defId, quantity: 1, note: `Mission: ${m.name}` }).catch(() => undefined);
    }
    await logEvent({
      campaignId,
      type: "mission.rewarded",
      actorUserId: dmUserId,
      characterId: cid,
      summary: `Mission "${m.name}" completed: +${rewards.xp ?? 0} XP, +${rewards.credits ?? 0} credits, +${rewards.progressionPoints ?? 0} progression`,
      payload: rewards as Record<string, unknown>,
    });
    emitCharacterUpdated(campaignId, cid);
  }
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
  const refreshed = await prisma.mission.findUniqueOrThrow({ where: { id: missionId }, include: missionInclude });
  return toMissionDto(refreshed);
}

// ---------- Journal ----------

const journalInclude = { author: { select: { username: true } } } satisfies Prisma.JournalEntryInclude;

export async function listJournal(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<JournalEntryDto[]> {
  const where: Prisma.JournalEntryWhereInput = viewer.isDm
    ? { campaignId, OR: [{ visibility: { in: ["campaign", "dm"] } }, { authorUserId: viewer.userId }] }
    : { campaignId, OR: [{ visibility: "campaign" }, { authorUserId: viewer.userId }] };
  const rows = await prisma.journalEntry.findMany({ where, include: journalInclude, orderBy: { updatedAt: "desc" } });
  return rows.map(toJournalDto);
}

export async function createJournal(campaignId: string, userId: string, isDm: boolean, input: JournalInput): Promise<JournalEntryDto> {
  if (input.isLore && !isDm) throw forbidden("Only the DM writes lore entries");
  const row = await prisma.journalEntry.create({
    data: { campaignId, authorUserId: userId, characterId: input.characterId, title: input.title, body: input.body, visibility: input.visibility, isLore: input.isLore },
    include: journalInclude,
  });
  if (input.visibility !== "private") emitToCampaign(campaignId, "content.updated", { campaignId, kind: "journal" });
  return toJournalDto(row);
}

export async function updateJournal(campaignId: string, userId: string, isDm: boolean, id: string, input: JournalInput): Promise<JournalEntryDto> {
  const existing = await prisma.journalEntry.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Journal entry");
  if (existing.authorUserId !== userId && !isDm) throw forbidden("You can only edit your own entries");
  const row = await prisma.journalEntry.update({
    where: { id },
    data: { characterId: input.characterId, title: input.title, body: input.body, visibility: input.visibility, isLore: isDm ? input.isLore : existing.isLore },
    include: journalInclude,
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "journal" });
  return toJournalDto(row);
}

export async function deleteJournal(campaignId: string, userId: string, isDm: boolean, id: string): Promise<void> {
  const existing = await prisma.journalEntry.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Journal entry");
  if (existing.authorUserId !== userId && !isDm) throw forbidden("You can only delete your own entries");
  await prisma.journalEntry.delete({ where: { id } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "journal" });
}

/**
 * A player accepts or declines a mission offered to one of their characters. The DM is told through a
 * dm-visibility event (bell + push). Accepting is required before objectives can be ticked; declining
 * removes the character from the reward list. Answers can be changed until the mission completes.
 */
export async function respondToMission(campaignId: string, userId: string, isDm: boolean, missionId: string, input: z.infer<typeof MissionResponseSchema>): Promise<MissionDto> {
  const m = await prisma.mission.findFirst({ where: { id: missionId, campaignId }, include: { assignments: { include: { character: { select: { id: true, name: true, ownerUserId: true } } } } } });
  if (!m) throw notFound("Mission");
  const a = m.assignments.find((x) => x.characterId === input.characterId);
  if (!a) throw forbidden("That character was not offered this mission");
  if (!isDm && a.character.ownerUserId !== userId) throw forbidden("Not your character");
  if (m.status === "completed" || m.status === "failed") throw ruleViolation(`Mission is already ${m.status}`);
  if (!m.visibleToPlayers && !isDm) throw notFound("Mission");
  await prisma.missionAssignment.update({ where: { missionId_characterId: { missionId, characterId: a.characterId } }, data: { response: input.response, respondedAt: new Date(), note: input.note } });
  const who = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
  await logEvent({
    campaignId,
    type: input.response === "accepted" ? "mission.accepted" : "mission.declined",
    actorUserId: userId,
    characterId: a.characterId,
    summary: `${a.character.name} ${input.response} mission "${m.name}"${input.note ? ` — "${input.note}"` : ""}${isDm ? ` (set by ${who.username})` : ""}`,
    payload: { missionId, characterId: a.characterId, response: input.response, note: input.note },
    visibility: "dm",
  });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
  const refreshed = await prisma.mission.findUniqueOrThrow({ where: { id: missionId }, include: missionInclude });
  return toMissionDto(refreshed);
}
