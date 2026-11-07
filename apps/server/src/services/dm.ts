import type { DmDashboardDto, MessageDto, RollRequestDto } from "@neom/shared";
import { z } from "zod";
import type { DmGrantSchema, DmMessageSchema, RollRequestCreateSchema } from "@neom/shared";
import { prisma } from "../db.js";
import { notFound } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign, emitToDmAndUser, emitToUser, onlineUserIds } from "../realtime/io.js";
import { pushToUsers } from "./push.js";
import { getActiveSession, getCampaign } from "./campaigns.js";
import { fullInclude, loadFull, toSummary } from "./characters.js";
import { listRolls } from "./dice.js";
import { getEncounter } from "./encounters.js";
import { listEvents, logEvent } from "./events.js";
import { toMessageDto, toRollRequestDto } from "./mappers.js";
import { listPending } from "./rules.js";

export async function getDashboard(campaignId: string, dmUserId: string): Promise<DmDashboardDto> {
  const campaign = await getCampaign(campaignId, dmUserId);
  const chars = await prisma.character.findMany({ where: { campaignId }, include: fullInclude, orderBy: { createdAt: "asc" } });
  const online = new Set(onlineUserIds(campaignId));
  const viewer = { userId: dmUserId, isDm: true };
  const [recentRolls, recentEvents, pendingActions, pendingRollRequests, liveSession] = await Promise.all([
    listRolls(campaignId, viewer, 15),
    listEvents(campaignId, viewer, { limit: 30 }),
    listPending(campaignId),
    listRollRequests(campaignId, viewer),
    getActiveSession(campaignId),
  ]);
  const activeEncounter = campaign.activeEncounterId ? await getEncounter(campaignId, campaign.activeEncounterId, true) : null;
  return {
    campaign,
    characters: chars.map((c) => ({ ...toSummary(c), online: online.has(c.ownerUserId) })),
    activeEncounter,
    recentRolls,
    recentEvents,
    pendingActions,
    pendingRollRequests,
    liveSession,
    onlineUserIds: [...online],
  };
}

export async function grantResource(campaignId: string, dmUserId: string, input: z.infer<typeof DmGrantSchema>) {
  const full = await loadFull(input.characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");
  const field = input.resource;
  const current = full[field];
  const next = Math.max(0, current + input.amount);
  await prisma.character.update({ where: { id: full.id }, data: { [field]: next, version: { increment: 1 } } });
  const verb = input.amount >= 0 ? "granted" : "removed";
  await logEvent({
    campaignId,
    type: `resource.${verb}`,
    actorUserId: dmUserId,
    characterId: full.id,
    summary: `DM ${verb} ${Math.abs(input.amount)} ${field === "progressionPoints" ? "progression points" : field.toUpperCase() === "XP" ? "XP" : field} ${input.amount >= 0 ? "to" : "from"} ${full.name}${input.note ? ` — ${input.note}` : ""}`,
    payload: { resource: field, amount: input.amount, before: current, after: next },
  });
  emitCharacterUpdated(campaignId, full.id);
}

export async function sendMessage(campaignId: string, fromUserId: string, input: z.infer<typeof DmMessageSchema>): Promise<MessageDto> {
  let toUserId: string | null = input.userId ?? null;
  if (input.characterId) {
    const c = await prisma.character.findFirst({ where: { id: input.characterId, campaignId }, select: { ownerUserId: true } });
    if (!c) throw notFound("Character");
    toUserId = c.ownerUserId;
  }
  if (input.kind !== "broadcast" && !toUserId) throw notFound("Recipient");
  const row = await prisma.message.create({
    data: { campaignId, fromUserId, toUserId: input.kind === "broadcast" ? null : toUserId, characterId: input.characterId ?? null, kind: input.kind, body: input.message },
    include: { from: { select: { username: true } } },
  });
  const dto = toMessageDto(row);
  if (input.kind === "broadcast") emitToCampaign(campaignId, "message.created", dto);
  else if (toUserId) emitToDmAndUser(campaignId, toUserId, "message.created", dto);
  if (toUserId && toUserId !== fromUserId && !onlineUserIds(campaignId).includes(toUserId)) {
    void pushToUsers([toUserId], { title: `${dto.fromName} (${input.kind})`, body: input.message, url: `/c/${campaignId}`, tag: `message:${campaignId}`, kind: "message" });
  }
  return dto;
}

export async function listMessages(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<MessageDto[]> {
  const rows = await prisma.message.findMany({
    where: viewer.isDm ? { campaignId } : { campaignId, OR: [{ toUserId: viewer.userId }, { fromUserId: viewer.userId }, { kind: "broadcast" }] },
    include: { from: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toMessageDto);
}

export async function createRollRequest(campaignId: string, dmUserId: string, input: z.infer<typeof RollRequestCreateSchema>): Promise<RollRequestDto> {
  const c = await prisma.character.findFirst({ where: { id: input.characterId, campaignId }, select: { ownerUserId: true, name: true } });
  if (!c) throw notFound("Character");
  const row = await prisma.rollRequest.create({
    data: { campaignId, characterId: input.characterId, target: input.target ?? null, expression: input.expression ?? null, label: input.label, dc: input.dc ?? null, visibility: input.visibility },
    include: { character: { select: { name: true } } },
  });
  const dto = toRollRequestDto(row);
  await logEvent({ campaignId, type: "roll.requested", actorUserId: dmUserId, characterId: input.characterId, summary: `DM asked ${c.name} for ${input.label}${input.dc ? ` (DC ${input.dc})` : ""}`, visibility: "owner", ownerUserId: c.ownerUserId });
  emitToUser(c.ownerUserId, "rollRequest.created", dto);
  return dto;
}

export async function listRollRequests(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<RollRequestDto[]> {
  const rows = await prisma.rollRequest.findMany({
    where: viewer.isDm ? { campaignId, status: "pending" } : { campaignId, status: "pending", character: { ownerUserId: viewer.userId } },
    include: { character: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRollRequestDto);
}

export async function cancelRollRequest(campaignId: string, id: string): Promise<void> {
  const row = await prisma.rollRequest.findFirst({ where: { id, campaignId }, include: { character: { select: { ownerUserId: true, name: true } } } });
  if (!row) throw notFound("Roll request");
  const updated = await prisma.rollRequest.update({ where: { id }, data: { status: "cancelled" }, include: { character: { select: { name: true } } } });
  emitToDmAndUser(campaignId, row.character.ownerUserId, "rollRequest.updated", toRollRequestDto(updated));
}
