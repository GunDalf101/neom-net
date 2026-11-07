import { type OverrideDto, type OverrideInput } from "@neom/shared";
import { prisma } from "../db.js";
import { notFound } from "../errors.js";
import { emitCharacterUpdated } from "../realtime/io.js";
import { derive, loadFull } from "./characters.js";
import { logEvent } from "./events.js";
import { toOverrideDto } from "./mappers.js";

const include = { createdBy: { select: { username: true } } } as const;

function statValue(derived: ReturnType<typeof derive>, target: string): number {
  const [group, key] = target.split(".");
  if (group === "attr" && key) return derived.attributes[key as keyof typeof derived.attributes].value;
  if (group === "save" && key) return derived.saves[key as keyof typeof derived.saves].value;
  if (group === "skill" && key) return derived.skills[key as keyof typeof derived.skills].value;
  if (group === "special" && key) return derived.specialSkills[key as keyof typeof derived.specialSkills].value;
  switch (target) {
    case "ac":
      return derived.ac.value;
    case "initiative":
      return derived.initiative.value;
    case "speed":
      return derived.speed.value;
    case "maxHp":
      return derived.maxHp.value;
    case "capacity":
      return derived.capacity.value;
    case "profBonus":
      return derived.profBonus.value;
  }
  return 0;
}

export async function createOverride(campaignId: string, dmUserId: string, input: OverrideInput): Promise<OverrideDto> {
  const full = await loadFull(input.characterId);
  if (full.campaignId !== campaignId) throw notFound("Character");
  // Original value is the calculation *without* any override on this target.
  const withoutThis = { ...full, overrides: full.overrides.filter((o) => o.target !== input.target) };
  const original = statValue(derive(withoutThis), input.target);

  const row = await prisma.$transaction(async (tx) => {
    await tx.dMOverride.updateMany({
      where: { characterId: input.characterId, target: input.target, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    const created = await tx.dMOverride.create({
      data: {
        campaignId,
        characterId: input.characterId,
        target: input.target,
        value: input.value,
        reason: input.reason ?? null,
        durationTurns: input.durationTurns ?? null,
        remainingTurns: input.durationTurns ?? null,
        originalValue: original,
        createdById: dmUserId,
      },
      include,
    });
    await tx.character.update({ where: { id: input.characterId }, data: { version: { increment: 1 } } });
    return created;
  });
  await logEvent({
    campaignId,
    type: "override.set",
    actorUserId: dmUserId,
    characterId: input.characterId,
    summary: `DM overrode ${full.name}'s ${input.target}: ${original} → ${input.value}${input.reason ? ` (${input.reason})` : ""}${input.durationTurns ? ` for ${input.durationTurns} turns` : ""}`,
    payload: { overrideId: row.id, target: input.target, original, value: input.value },
  });
  emitCharacterUpdated(campaignId, input.characterId);
  return toOverrideDto(row);
}

export async function revokeOverride(campaignId: string, dmUserId: string, overrideId: string): Promise<OverrideDto> {
  const row = await prisma.dMOverride.findFirst({ where: { id: overrideId, campaignId }, include: { ...include, character: { select: { name: true } } } });
  if (!row) throw notFound("Override");
  const updated = await prisma.dMOverride.update({ where: { id: overrideId }, data: { active: false, revokedAt: new Date() }, include });
  await prisma.character.update({ where: { id: row.characterId }, data: { version: { increment: 1 } } });
  await logEvent({
    campaignId,
    type: "override.revoked",
    actorUserId: dmUserId,
    characterId: row.characterId,
    summary: `DM lifted the override on ${row.character.name}'s ${row.target} (back to calculated value)`,
    payload: { overrideId, target: row.target },
    reversesEventId: null,
  });
  emitCharacterUpdated(campaignId, row.characterId);
  return toOverrideDto(updated);
}

export async function listOverrides(campaignId: string, includeInactive = false): Promise<OverrideDto[]> {
  const rows = await prisma.dMOverride.findMany({
    where: includeInactive ? { campaignId } : { campaignId, active: true },
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(toOverrideDto);
}
