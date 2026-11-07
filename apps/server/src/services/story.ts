import type { JournalEntryDto, JournalInput, MissionDto, MissionInput, NpcDto, NpcInput } from "@neom/shared";
import type { Prisma } from "@prisma/client";
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
    where: viewer.isDm ? { campaignId } : { campaignId, visibleToPlayers: true },
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

export async function createMission(campaignId: string, dmUserId: string, input: MissionInput): Promise<MissionDto> {
  const m = await writeMission(campaignId, input);
  await logEvent({ campaignId, type: "mission.created", actorUserId: dmUserId, summary: `Mission "${m.name}" posted`, visibility: input.visibleToPlayers ? "public" : "dm" });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "missions" });
  return toMissionDto(m);
}

export async function updateMission(campaignId: string, dmUserId: string, id: string, input: MissionInput): Promise<MissionDto> {
  const existing = await prisma.mission.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Mission");
  const m = await writeMission(campaignId, input, id);
  if (existing.status !== input.status) {
    await logEvent({ campaignId, type: "mission.status", actorUserId: dmUserId, summary: `Mission "${m.name}" is now ${input.status}`, visibility: input.visibleToPlayers ? "public" : "dm" });
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
  if (!isDm && !m.assignments.some((a) => a.character.ownerUserId === userId)) throw forbidden("Mission is not assigned to your character");
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
  const charIds = m.assignments.map((a) => a.characterId);
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
