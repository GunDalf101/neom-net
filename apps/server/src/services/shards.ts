import type { CharacterView, ShardCastInput, ShardDto, ShardInput } from "@neom/shared";
import { prisma } from "../db.js";
import { forbidden, notFound, ruleViolation } from "../errors.js";
import { emitCharacterUpdated, emitToCampaign } from "../realtime/io.js";
import { requireCharacterAccess } from "./access.js";
import { buildView, loadFull } from "./characters.js";
import { logEvent } from "./events.js";
import { toShardDto } from "./mappers.js";

const order = [{ school: "asc" as const }, { tier: "asc" as const }, { sortOrder: "asc" as const }, { name: "asc" as const }];

/**
 * The spellbook. The DM sees everything; a player only sees it if one of their characters is a netrunner
 * (and then only the published shards), so the feature stays invisible to everyone else.
 */
export async function listShards(campaignId: string, viewer: { userId: string; isDm: boolean }): Promise<ShardDto[]> {
  if (!viewer.isDm) {
    const runner = await prisma.character.count({ where: { campaignId, ownerUserId: viewer.userId, isNetrunner: true } });
    if (runner === 0) return [];
  }
  const rows = await prisma.shardDefinition.findMany({ where: viewer.isDm ? { campaignId } : { campaignId, visibleToPlayers: true }, orderBy: order });
  return rows.map(toShardDto);
}

async function assertNameFree(campaignId: string, name: string, exceptId?: string) {
  const clash = await prisma.shardDefinition.findFirst({ where: { campaignId, name, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw ruleViolation(`A shard named "${name}" already exists`);
}

export async function createShard(campaignId: string, input: ShardInput): Promise<ShardDto> {
  await assertNameFree(campaignId, input.name);
  const row = await prisma.shardDefinition.create({ data: { campaignId, ...input } });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "shards" });
  return toShardDto(row);
}

export async function updateShard(campaignId: string, id: string, input: ShardInput): Promise<ShardDto> {
  const existing = await prisma.shardDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Shard");
  await assertNameFree(campaignId, input.name, id);
  const row = await prisma.shardDefinition.update({ where: { id }, data: input });
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "shards" });
  await refreshHolders(campaignId, id);
  return toShardDto(row);
}

export async function deleteShard(campaignId: string, id: string): Promise<void> {
  const existing = await prisma.shardDefinition.findFirst({ where: { id, campaignId } });
  if (!existing) throw notFound("Shard");
  // Forget it on every sheet that knew it.
  const holders = await prisma.character.findMany({ where: { campaignId, shardIds: { array_contains: [id] } }, select: { id: true, shardIds: true } });
  await prisma.$transaction([
    ...holders.map((h) => prisma.character.update({ where: { id: h.id }, data: { shardIds: ((h.shardIds as unknown as string[]) ?? []).filter((x) => x !== id), version: { increment: 1 } } })),
    prisma.shardDefinition.delete({ where: { id } }),
  ]);
  emitToCampaign(campaignId, "content.updated", { campaignId, kind: "shards" });
  for (const h of holders) emitCharacterUpdated(campaignId, h.id);
}

async function refreshHolders(campaignId: string, shardId: string) {
  const holders = await prisma.character.findMany({ where: { campaignId, shardIds: { array_contains: [shardId] } }, select: { id: true } });
  for (const h of holders) emitCharacterUpdated(campaignId, h.id);
}

/** Owner or DM casts a known shard: RAM is spent and the table sees it. Works in DM-controlled campaigns, like a dice roll. */
export async function castShard(characterId: string, userId: string, input: ShardCastInput): Promise<CharacterView> {
  const { character, membership, isOwner } = await requireCharacterAccess(characterId, userId);
  if (!isOwner && !membership.isDm) throw forbidden("You can only cast with your own character");
  if (!character.isNetrunner) throw ruleViolation(`${character.name} is not a netrunner`);
  const shard = await prisma.shardDefinition.findFirst({ where: { id: input.shardId, campaignId: character.campaignId } });
  if (!shard) throw notFound("Shard");
  const known = ((character.shardIds as unknown as string[]) ?? []).includes(shard.id);
  if (!known && !membership.isDm) throw ruleViolation(`${character.name} does not know ${shard.name}`);
  const free = character.ramMax - character.ramUsed;
  if (shard.ramCost > free) throw ruleViolation(`Not enough RAM: ${shard.name} needs ${shard.ramCost}, ${Math.max(0, free)} free`, { ramCost: shard.ramCost, free });
  if (shard.ramCost > 0) {
    const spent = await prisma.character.updateMany({ where: { id: characterId, ramUsed: { lte: character.ramMax - shard.ramCost } }, data: { ramUsed: { increment: shard.ramCost }, version: { increment: 1 } } });
    if (spent.count === 0) throw ruleViolation("Not enough RAM");
  }
  await logEvent({
    campaignId: character.campaignId,
    type: "shard.cast",
    actorUserId: userId,
    characterId,
    summary: `${character.name} ran ${shard.name} (${shard.school}, tier ${shard.tier}${shard.ramCost ? `, ${shard.ramCost} RAM` : ""})${shard.effect ? `: ${shard.effect}` : ""}${input.note ? ` — ${input.note}` : ""}`,
    payload: { shardId: shard.id, name: shard.name, school: shard.school, tier: shard.tier, ramCost: shard.ramCost, effect: shard.effect, range: shard.range, duration: shard.duration },
    visibility: "public",
  });
  emitCharacterUpdated(character.campaignId, characterId);
  return buildView(await loadFull(characterId), { userId, isDm: membership.isDm });
}
