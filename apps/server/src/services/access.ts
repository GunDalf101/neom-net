import { CampaignSettingsSchema, DEFAULT_CAMPAIGN_SETTINGS, type CampaignRuleSettings } from "@neom/shared";
import type { Campaign, CampaignRole } from "@prisma/client";
import { prisma, type Db } from "../db.js";
import { forbidden, notFound } from "../errors.js";

export interface Membership {
  campaignId: string;
  userId: string;
  role: CampaignRole;
  isDm: boolean;
}

export async function getMembership(campaignId: string, userId: string, db: Db = prisma): Promise<Membership | null> {
  const m = await db.campaignMembership.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!m) return null;
  return { campaignId, userId, role: m.role, isDm: m.role === "DM" };
}

export async function requireMember(campaignId: string, userId: string, db: Db = prisma): Promise<Membership> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) throw notFound("Campaign");
  const m = await getMembership(campaignId, userId, db);
  if (!m) throw forbidden("You are not a member of this campaign");
  return m;
}

export async function requireDm(campaignId: string, userId: string, db: Db = prisma): Promise<Membership> {
  const m = await requireMember(campaignId, userId, db);
  if (!m.isDm) throw forbidden("Only the Dungeon Master can do that");
  return m;
}

export function campaignSettings(campaign: Pick<Campaign, "settings">): CampaignRuleSettings {
  const parsed = CampaignSettingsSchema.partial().safeParse(campaign.settings ?? {});
  const partial = parsed.success ? parsed.data : {};
  return { ...DEFAULT_CAMPAIGN_SETTINGS, ...partial } as CampaignRuleSettings;
}

/** Returns the character with its campaign, verifying the viewer is a member. */
export async function requireCharacterAccess(characterId: string, userId: string, db: Db = prisma) {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: { campaign: true },
  });
  if (!character) throw notFound("Character");
  const membership = await getMembership(character.campaignId, userId, db);
  if (!membership) throw forbidden("You are not a member of this campaign");
  const isOwner = character.ownerUserId === userId;
  return { character, membership, isOwner, canEdit: isOwner || membership.isDm };
}

/**
 * Edit access: the DM always; the owner only when the campaign does not run in
 * "players are read-only" mode. Every character-mutating route goes through here.
 */
export async function requireCharacterEdit(characterId: string, userId: string, db: Db = prisma) {
  const access = await requireCharacterAccess(characterId, userId, db);
  if (!access.canEdit) throw forbidden("You can only edit your own characters");
  if (!access.membership.isDm && campaignSettings(access.character.campaign).playersReadOnly) {
    throw forbidden("This campaign is DM-controlled: only the Dungeon Master can change characters");
  }
  return access;
}

export function playerIsReadOnly(campaign: Pick<Campaign, "settings">, isDm: boolean): boolean {
  return !isDm && campaignSettings(campaign).playersReadOnly;
}
