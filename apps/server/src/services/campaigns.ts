import { randomBytes } from "node:crypto";
import type { CampaignDto, CampaignSummaryDto, CreateCampaignInput, LiveSessionDto, UpdateCampaignInput } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { emitToCampaign, onlineUserIds } from "../realtime/io.js";
import { campaignSettings, requireDm, requireMember } from "./access.js";
import { logEvent } from "./events.js";
import { toSessionDto } from "./mappers.js";

function inviteCode(): string {
  return randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
}

export async function listCampaigns(userId: string): Promise<CampaignSummaryDto[]> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId },
    include: {
      campaign: {
        include: {
          _count: { select: { members: true, characters: true } },
          sessions: { where: { endedAt: null }, select: { id: true }, take: 1 },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
  return memberships.map((m) => ({
    id: m.campaign.id,
    name: m.campaign.name,
    description: m.campaign.description,
    ownerId: m.campaign.ownerId,
    role: m.role,
    memberCount: m.campaign._count.members,
    characterCount: m.campaign._count.characters,
    createdAt: m.campaign.createdAt.toISOString(),
    liveSessionId: m.campaign.sessions[0]?.id ?? null,
  }));
}

export async function createCampaign(userId: string, input: CreateCampaignInput): Promise<CampaignDto> {
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      description: input.description,
      ownerId: userId,
      inviteCode: inviteCode(),
      settings: {},
      members: { create: { userId, role: "DM" } },
    },
  });
  await logEvent({ campaignId: campaign.id, type: "campaign.created", actorUserId: userId, summary: `Campaign "${campaign.name}" initialised` });
  return getCampaign(campaign.id, userId);
}

export async function joinCampaign(userId: string, code: string): Promise<CampaignDto> {
  const campaign = await prisma.campaign.findUnique({ where: { inviteCode: code.trim().toUpperCase() } });
  if (!campaign) throw notFound("Campaign with that invite code");
  const existing = await prisma.campaignMembership.findUnique({ where: { campaignId_userId: { campaignId: campaign.id, userId } } });
  if (!existing) {
    await prisma.campaignMembership.create({ data: { campaignId: campaign.id, userId, role: "PLAYER" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    await logEvent({ campaignId: campaign.id, type: "member.joined", actorUserId: userId, summary: `${user.username} connected to the campaign` });
    emitToCampaign(campaign.id, "campaign.updated", { campaignId: campaign.id });
  }
  return getCampaign(campaign.id, userId);
}

export async function getCampaign(campaignId: string, userId: string): Promise<CampaignDto> {
  const membership = await requireMember(campaignId, userId);
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      members: { include: { user: { select: { username: true } } }, orderBy: { joinedAt: "asc" } },
      _count: { select: { members: true, characters: true } },
      sessions: { where: { endedAt: null }, select: { id: true }, take: 1 },
      encounters: { where: { status: "active" }, select: { id: true }, take: 1 },
    },
  });
  const online = new Set(onlineUserIds(campaignId));
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    ownerId: campaign.ownerId,
    role: membership.role,
    memberCount: campaign._count.members,
    characterCount: campaign._count.characters,
    createdAt: campaign.createdAt.toISOString(),
    liveSessionId: campaign.sessions[0]?.id ?? null,
    activeEncounterId: campaign.encounters[0]?.id ?? null,
    settings: campaignSettings(campaign),
    members: campaign.members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      online: online.has(m.userId),
    })),
    notificationsSeenAt: campaign.members.find((m) => m.userId === userId)?.notificationsSeenAt?.toISOString() ?? null,
    ...(membership.isDm ? { inviteCode: campaign.inviteCode } : {}),
  };
}

export async function updateCampaign(campaignId: string, userId: string, input: UpdateCampaignInput): Promise<CampaignDto> {
  await requireDm(campaignId, userId);
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const mergedSettings = { ...campaignSettings(campaign), ...(input.settings ?? {}) };
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      name: input.name,
      description: input.description,
      settings: mergedSettings as unknown as Prisma.InputJsonValue,
    },
  });
  await logEvent({ campaignId, type: "campaign.updated", actorUserId: userId, summary: "Campaign settings updated", visibility: "dm", payload: input as Record<string, unknown> });
  emitToCampaign(campaignId, "campaign.updated", { campaignId });
  // Settings affect derived stats of every character.
  const chars = await prisma.character.findMany({ where: { campaignId }, select: { id: true } });
  for (const c of chars) emitToCampaign(campaignId, "character.updated", { campaignId, characterId: c.id });
  return getCampaign(campaignId, userId);
}

export async function regenerateInvite(campaignId: string, userId: string): Promise<CampaignDto> {
  await requireDm(campaignId, userId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { inviteCode: inviteCode() } });
  return getCampaign(campaignId, userId);
}

export async function removeMember(campaignId: string, dmUserId: string, targetUserId: string): Promise<void> {
  await requireDm(campaignId, dmUserId);
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.ownerId === targetUserId) throw badRequest("The owner cannot be removed");
  await prisma.campaignMembership.delete({ where: { campaignId_userId: { campaignId, userId: targetUserId } } });
  emitToCampaign(campaignId, "campaign.updated", { campaignId });
}

// ---------- Live sessions ----------

export async function getActiveSession(campaignId: string): Promise<LiveSessionDto | null> {
  const s = await prisma.liveSession.findFirst({ where: { campaignId, endedAt: null }, include: { startedBy: { select: { username: true } } } });
  return s ? toSessionDto(s) : null;
}

export async function startSession(campaignId: string, userId: string): Promise<LiveSessionDto> {
  await requireDm(campaignId, userId);
  const existing = await getActiveSession(campaignId);
  if (existing) return existing;
  const s = await prisma.liveSession.create({ data: { campaignId, startedById: userId }, include: { startedBy: { select: { username: true } } } });
  const dto = toSessionDto(s);
  await logEvent({ campaignId, type: "session.started", actorUserId: userId, summary: "Live session started" });
  emitToCampaign(campaignId, "session.updated", { campaignId, session: dto });
  return dto;
}

export async function endSession(campaignId: string, userId: string): Promise<void> {
  await requireDm(campaignId, userId);
  await prisma.liveSession.updateMany({ where: { campaignId, endedAt: null }, data: { endedAt: new Date() } });
  await logEvent({ campaignId, type: "session.ended", actorUserId: userId, summary: "Live session ended" });
  emitToCampaign(campaignId, "session.updated", { campaignId, session: null });
}
