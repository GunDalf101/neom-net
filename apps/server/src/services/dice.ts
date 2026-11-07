import {
  d20Expression,
  describeTarget,
  roll,
  type DiceRollDto,
  type RollMode,
  type RollRequestInput,
  type SkillKey,
  type SpecialSkillKey,
  type AttributeKey,
} from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { emitToCampaign, emitToDmAndUser } from "../realtime/io.js";
import { campaignSettings, requireMember } from "./access.js";
import { applyHpAction, derive, loadFull, SYSTEM_ACTOR } from "./characters.js";
import { toRollDto, toRollRequestDto } from "./mappers.js";
import { dispatchTrigger } from "./rules.js";

const rollInclude = { user: { select: { username: true } }, character: { select: { name: true } } } satisfies Prisma.DiceRollInclude;

export async function performRoll(campaignId: string, userId: string, input: RollRequestInput): Promise<DiceRollDto> {
  const membership = await requireMember(campaignId, userId);
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const settings = campaignSettings(campaign);

  let characterId: string | null = input.characterId ?? null;
  let full = characterId ? await loadFull(characterId) : null;
  if (full) {
    if (full.campaignId !== campaignId) throw notFound("Character");
    if (!membership.isDm && full.ownerUserId !== userId) throw forbidden("You can only roll for your own character");
  } else {
    characterId = null;
  }

  let expression = input.expression?.trim() ?? "";
  let label = input.label ?? "";
  let mode: RollMode = input.mode;
  const flagNotes: string[] = [];

  if (input.target) {
    if (!full) throw badRequest("A character is required for skill, save and initiative rolls");
    const derived = derive(full);
    let modifier = 0;
    const [group, key] = input.target.split(".");
    if (group === "skill" && key) modifier = derived.skills[key as SkillKey].value;
    else if (group === "save" && key) modifier = derived.saves[key as AttributeKey].value;
    else if (group === "special" && key) modifier = derived.specialSkills[key as SpecialSkillKey].value;
    else if (input.target === "initiative") modifier = derived.initiative.value;
    else if (input.target === "attack") modifier = derived.profBonus.value + Math.max(derived.modifiers.str, derived.modifiers.dex);
    else if (input.target === "deathSave") modifier = 0;
    modifier += input.bonus;
    expression = d20Expression(modifier);
    if (!label) label = describeTarget(input.target);

    // Automatic advantage/disadvantage from active effects.
    const flags = derived.rollFlags.filter((f) => f.on === input.target);
    const adv = flags.filter((f) => f.mode === "advantage");
    const dis = flags.filter((f) => f.mode === "disadvantage");
    let auto: RollMode = "normal";
    if (adv.length && !dis.length) auto = "advantage";
    if (dis.length && !adv.length) auto = "disadvantage";
    for (const f of flags) flagNotes.push(`${f.mode === "advantage" ? "ADV" : "DIS"}: ${f.sourceName}`);
    if (mode === "normal") mode = auto;
    else if ((mode === "advantage" && dis.length) || (mode === "disadvantage" && adv.length)) mode = "normal";
  } else if (!expression) {
    throw badRequest("Provide a dice expression or a roll target");
  }
  if (!label) label = expression;
  if (flagNotes.length) label = `${label} (${flagNotes.join(", ")})`;

  let result;
  try {
    result = roll(expression, mode);
  } catch (err) {
    throw badRequest((err as Error).message);
  }

  let dc: number | null = null;
  let success: boolean | null = null;
  let rollRequestStatus: { id: string } | null = null;
  if (input.rollRequestId) {
    const req = await prisma.rollRequest.findFirst({ where: { id: input.rollRequestId, campaignId, status: "pending" } });
    if (req) {
      dc = req.dc;
      rollRequestStatus = { id: req.id };
    }
  }
  if (dc !== null) {
    success = result.total >= dc;
    if (settings.nat20AutoSuccess) {
      if (result.isNat20) success = true;
      if (result.isNat1) success = false;
    }
  }

  const row = await prisma.diceRoll.create({
    data: {
      campaignId,
      characterId,
      userId,
      expression: result.expression,
      category: input.category,
      label,
      mode,
      result: result as unknown as Prisma.InputJsonValue,
      total: result.total,
      visibility: input.visibility,
      dc,
      success,
    },
    include: rollInclude,
  });
  const dto = toRollDto(row);

  if (rollRequestStatus) {
    const updated = await prisma.rollRequest.update({
      where: { id: rollRequestStatus.id },
      data: { status: "fulfilled", resultRollId: row.id },
      include: { character: { select: { name: true } } },
    });
    emitToDmAndUser(campaignId, userId, "rollRequest.updated", toRollRequestDto(updated));
  }

  if (input.visibility === "public") emitToCampaign(campaignId, "roll.created", dto);
  else emitToDmAndUser(campaignId, userId, "roll.created", dto);

  if (full && input.target === "deathSave") {
    await resolveDeathSave(full.id, result.total, result.isNat20, result.isNat1);
  }
  if (full && input.target) {
    void dispatchTrigger(full.id, { type: "skillCheck", rollTarget: input.target }, { actorUserId: userId, depth: 1 });
  }
  return dto;
}

async function resolveDeathSave(characterId: string, total: number, nat20: boolean, nat1: boolean) {
  if (nat20) {
    await applyHpAction(characterId, SYSTEM_ACTOR, { action: "deathSave", result: "reset" }, { sourceLabel: "Natural 20" });
    await applyHpAction(characterId, SYSTEM_ACTOR, { action: "heal", amount: 1 }, { sourceLabel: "Natural 20 death save" });
    return;
  }
  if (nat1) {
    await applyHpAction(characterId, SYSTEM_ACTOR, { action: "deathSave", result: "failure" });
    await applyHpAction(characterId, SYSTEM_ACTOR, { action: "deathSave", result: "failure" });
    return;
  }
  await applyHpAction(characterId, SYSTEM_ACTOR, { action: "deathSave", result: total >= 10 ? "success" : "failure" });
}

export async function listRolls(campaignId: string, viewer: { userId: string; isDm: boolean }, limit = 50): Promise<DiceRollDto[]> {
  const rows = await prisma.diceRoll.findMany({
    where: viewer.isDm ? { campaignId } : { campaignId, OR: [{ visibility: "public" }, { userId: viewer.userId }] },
    include: rollInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, limit),
  });
  return rows.map(toRollDto);
}
