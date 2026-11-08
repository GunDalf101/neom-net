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

const messageInclude = { from: { select: { username: true } }, to: { select: { username: true } } } as const;

/**
 * Sends one message per recipient so each has its own read state. Recipients: `userIds` ∪ `userId` ∪ the
 * owner of `characterId`; `broadcast` means every member except the sender. Each recipient gets a socket
 * event (the DM room sees everything) and a push notification when away from the table.
 */
export async function sendMessage(campaignId: string, fromUserId: string, input: z.infer<typeof DmMessageSchema>): Promise<MessageDto[]> {
  const recipients = new Set<string>(input.userIds ?? []);
  if (input.userId) recipients.add(input.userId);
  if (input.characterId) {
    const c = await prisma.character.findFirst({ where: { id: input.characterId, campaignId }, select: { ownerUserId: true } });
    if (!c) throw notFound("Character");
    recipients.add(c.ownerUserId);
  }
  if (input.kind === "broadcast") {
    const members = await prisma.campaignMembership.findMany({ where: { campaignId }, select: { userId: true } });
    for (const m of members) recipients.add(m.userId);
  }
  recipients.delete(fromUserId);
  if (recipients.size === 0) throw notFound("Recipient");
  // Only campaign members can be addressed.
  const valid = new Set((await prisma.campaignMembership.findMany({ where: { campaignId, userId: { in: [...recipients] } }, select: { userId: true } })).map((m) => m.userId));
  const targets = [...recipients].filter((id) => valid.has(id));
  if (targets.length === 0) throw notFound("Recipient");
  const from = await prisma.user.findUniqueOrThrow({ where: { id: fromUserId }, select: { username: true } });
  const online = new Set(onlineUserIds(campaignId));
  const out: MessageDto[] = [];
  for (const toUserId of targets) {
    const row = await prisma.message.create({
      data: { campaignId, fromUserId, toUserId, characterId: input.characterId ?? null, kind: input.kind, body: input.message },
      include: messageInclude,
    });
    const dto = toMessageDto(row);
    out.push(dto);
    emitToDmAndUser(campaignId, toUserId, "message.created", dto);
    if (!online.has(toUserId)) {
      void pushToUsers([toUserId], { title: `${from.username} (${input.kind === "broadcast" ? "to everyone" : input.kind})`, body: input.message, url: `/c/${campaignId}`, tag: `message:${campaignId}`, kind: "message" });
    }
  }
  return out;
}

/** Records that the viewer opened their notification bell; events newer than this are unread. */
export async function markNotificationsSeen(campaignId: string, userId: string): Promise<{ seenAt: string }> {
  const now = new Date();
  await prisma.campaignMembership.update({ where: { campaignId_userId: { campaignId, userId } }, data: { notificationsSeenAt: now } });
  return { seenAt: now.toISOString() };
}

/** Marks messages addressed to the viewer as read (all of them when `ids` is omitted). Returns the unread count left. */
export async function markMessagesRead(campaignId: string, userId: string, ids?: string[]): Promise<{ unread: number }> {
  await prisma.message.updateMany({ where: { campaignId, toUserId: userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  const unread = await prisma.message.count({ where: { campaignId, toUserId: userId, readAt: null } });
  emitToUser(userId, "message.read", { campaignId, unread });
  return { unread };
}

export async function listMessages(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<MessageDto[]> {
  const rows = await prisma.message.findMany({
    where: viewer.isDm ? { campaignId } : { campaignId, OR: [{ toUserId: viewer.userId }, { fromUserId: viewer.userId }] },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: 300,
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
