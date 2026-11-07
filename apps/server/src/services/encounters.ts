import { abilityModifier, roll, type AddParticipantInput, type EncounterAction, type EncounterDto, type AttributeKey } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, notFound, ruleViolation } from "../errors.js";
import { emitToCampaign } from "../realtime/io.js";
import { derive, loadFull, tickCharacterTurn } from "./characters.js";
import { performRoll } from "./dice.js";
import { logEvent } from "./events.js";
import { toEncounterDto } from "./mappers.js";
import { dispatchTrigger } from "./rules.js";

const include = {
  participants: {
    include: { character: { select: { portraitUrl: true } }, npc: { select: { portraitUrl: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.EncounterInclude;

async function load(campaignId: string, encounterId: string) {
  const e = await prisma.encounter.findFirst({ where: { id: encounterId, campaignId }, include });
  if (!e) throw notFound("Encounter");
  return e;
}

/** Player-character participants mirror the live character sheet. */
async function syncCharacterParticipants(encounterId: string) {
  const parts = await prisma.encounterParticipant.findMany({ where: { encounterId, characterId: { not: null } } });
  for (const p of parts) {
    if (!p.characterId) continue;
    const full = await loadFull(p.characterId).catch(() => null);
    if (!full) continue;
    const d = derive(full);
    await prisma.encounterParticipant.update({
      where: { id: p.id },
      data: {
        name: full.name,
        hpCurrent: full.hpCurrent,
        hpMax: d.maxHp.value,
        ac: d.ac.value,
        conditions: full.conditions.map((c) => c.definition.name),
      },
    });
  }
}

export async function getEncounter(campaignId: string, encounterId: string, forDm: boolean): Promise<EncounterDto> {
  await syncCharacterParticipants(encounterId);
  return toEncounterDto(await load(campaignId, encounterId), forDm);
}

export async function listEncounters(campaignId: string, forDm: boolean): Promise<EncounterDto[]> {
  const rows = await prisma.encounter.findMany({
    where: forDm ? { campaignId } : { campaignId, status: { in: ["active", "ended"] } },
    include,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => toEncounterDto(r, forDm));
}

export async function createEncounter(campaignId: string, dmUserId: string, input: { name: string; description: string }): Promise<EncounterDto> {
  const row = await prisma.encounter.create({ data: { campaignId, name: input.name, description: input.description }, include });
  await logEvent({ campaignId, type: "encounter.created", actorUserId: dmUserId, summary: `Encounter "${row.name}" prepared`, visibility: "dm" });
  emitToCampaign(campaignId, "encounter.updated", { campaignId, encounterId: row.id });
  return toEncounterDto(row, true);
}

export async function deleteEncounter(campaignId: string, encounterId: string): Promise<void> {
  await load(campaignId, encounterId);
  await prisma.encounter.delete({ where: { id: encounterId } });
  emitToCampaign(campaignId, "encounter.updated", { campaignId, encounterId });
}

export async function addParticipant(campaignId: string, dmUserId: string, encounterId: string, input: AddParticipantInput): Promise<EncounterDto> {
  const enc = await load(campaignId, encounterId);
  if (enc.status === "ended") throw ruleViolation("Encounter has ended");
  const nextOrder = enc.participants.length;
  if (input.characterId) {
    if (enc.participants.some((p) => p.characterId === input.characterId)) throw badRequest("Character already in encounter");
    const full = await loadFull(input.characterId);
    if (full.campaignId !== campaignId) throw notFound("Character");
    const d = derive(full);
    await prisma.encounterParticipant.create({
      data: {
        encounterId,
        characterId: full.id,
        name: full.name,
        initiative: input.initiative ?? null,
        hpCurrent: full.hpCurrent,
        hpMax: d.maxHp.value,
        ac: d.ac.value,
        hidden: false,
        sortOrder: nextOrder,
      },
    });
  } else if (input.npcId) {
    const npc = await prisma.npcDefinition.findFirst({ where: { id: input.npcId, campaignId } });
    if (!npc) throw notFound("NPC");
    const existing = enc.participants.filter((p) => p.npcId === npc.id).length;
    for (let i = 0; i < input.count; i++) {
      const suffix = existing + i > 0 || input.count > 1 ? ` ${existing + i + 1}` : "";
      await prisma.encounterParticipant.create({
        data: {
          encounterId,
          npcId: npc.id,
          name: `${input.name ?? npc.name}${suffix}`,
          initiative: input.initiative ?? null,
          hpCurrent: npc.hpMax,
          hpMax: npc.hpMax,
          ac: npc.ac,
          hidden: input.hidden,
          sortOrder: nextOrder + i,
        },
      });
    }
  } else {
    if (!input.name) throw badRequest("Provide a character, an NPC, or a name");
    await prisma.encounterParticipant.create({
      data: { encounterId, name: input.name, initiative: input.initiative ?? null, hpCurrent: 10, hpMax: 10, ac: 10, hidden: input.hidden, sortOrder: nextOrder },
    });
  }
  emitToCampaign(campaignId, "encounter.updated", { campaignId, encounterId });
  return getEncounter(campaignId, encounterId, true);
}

function ordered<T extends { initiative: number | null; sortOrder: number }>(parts: T[]): T[] {
  return [...parts].sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99) || a.sortOrder - b.sortOrder);
}

export async function encounterAction(campaignId: string, dmUserId: string, encounterId: string, action: EncounterAction): Promise<EncounterDto> {
  const enc = await load(campaignId, encounterId);
  const parts = ordered(enc.participants);

  switch (action.action) {
    case "start": {
      if (enc.status === "active") break;
      const other = await prisma.encounter.findFirst({ where: { campaignId, status: "active", id: { not: encounterId } } });
      if (other) throw ruleViolation(`Encounter "${other.name}" is already active. End it first.`);
      if (parts.length === 0) throw ruleViolation("Add participants before starting");
      await prisma.encounter.update({ where: { id: encounterId }, data: { status: "active", round: 1, turnIndex: 0, startedAt: new Date() } });
      await logEvent({ campaignId, type: "encounter.started", actorUserId: dmUserId, summary: `Encounter "${enc.name}" started — round 1` });
      const first = parts[0];
      if (first?.characterId) {
        await tickCharacterTurn(first.characterId);
        await dispatchTrigger(first.characterId, { type: "turnStart" }, { actorUserId: dmUserId, depth: 1 });
      }
      break;
    }
    case "next":
    case "previous": {
      if (enc.status !== "active") throw ruleViolation("Encounter is not active");
      if (parts.length === 0) break;
      const current = parts[enc.turnIndex];
      let idx = enc.turnIndex + (action.action === "next" ? 1 : -1);
      let round = enc.round;
      if (idx >= parts.length) {
        idx = 0;
        round += 1;
      } else if (idx < 0) {
        idx = parts.length - 1;
        round = Math.max(1, round - 1);
      }
      await prisma.encounter.update({ where: { id: encounterId }, data: { turnIndex: idx, round } });
      const nextP = parts[idx];
      if (action.action === "next") {
        if (current?.characterId) await dispatchTrigger(current.characterId, { type: "turnEnd" }, { actorUserId: dmUserId, depth: 1 });
        if (nextP?.characterId) {
          await tickCharacterTurn(nextP.characterId);
          await dispatchTrigger(nextP.characterId, { type: "turnStart" }, { actorUserId: dmUserId, depth: 1 });
        }
      }
      await logEvent({ campaignId, type: "encounter.turn", actorUserId: dmUserId, summary: `Round ${round}: ${nextP?.hidden ? "a hidden combatant" : nextP?.name}'s turn`, payload: { round, turnIndex: idx } });
      break;
    }
    case "end": {
      if (enc.status === "ended") break;
      await prisma.encounter.update({ where: { id: encounterId }, data: { status: "ended", endedAt: new Date() } });
      // Untimed rule effects last until the encounter ends.
      const charIds = enc.participants.map((p) => p.characterId).filter((id): id is string => Boolean(id));
      if (charIds.length) {
        await prisma.activeEffect.deleteMany({ where: { characterId: { in: charIds }, durationTurns: null, sourceType: "rule", createdAt: { gte: enc.startedAt ?? enc.createdAt } } });
        for (const id of charIds) emitToCampaign(campaignId, "character.updated", { campaignId, characterId: id });
      }
      await logEvent({ campaignId, type: "encounter.ended", actorUserId: dmUserId, summary: `Encounter "${enc.name}" ended after ${enc.round} round(s)` });
      break;
    }
    case "rollInitiative": {
      for (const p of enc.participants) {
        if (p.initiative !== null) continue;
        if (p.characterId) {
          const r = await performRoll(campaignId, dmUserId, { characterId: p.characterId, target: "initiative", category: "initiative", mode: "normal", visibility: "public", bonus: 0 });
          await prisma.encounterParticipant.update({ where: { id: p.id }, data: { initiative: r.total } });
        } else {
          let dexMod = 0;
          if (p.npcId) {
            const npc = await prisma.npcDefinition.findUnique({ where: { id: p.npcId } });
            dexMod = abilityModifier(((npc?.attributes as Record<AttributeKey, number> | undefined)?.dex) ?? 10);
          }
          const r = roll(dexMod >= 0 ? `1d20+${dexMod}` : `1d20-${Math.abs(dexMod)}`);
          await prisma.encounterParticipant.update({ where: { id: p.id }, data: { initiative: r.total } });
        }
      }
      await logEvent({ campaignId, type: "encounter.initiative", actorUserId: dmUserId, summary: "Initiative rolled", visibility: "dm" });
      break;
    }
    case "setInitiative":
      await prisma.encounterParticipant.update({ where: { id: action.participantId }, data: { initiative: action.initiative } });
      break;
    case "removeParticipant":
      await prisma.encounterParticipant.delete({ where: { id: action.participantId } });
      break;
    case "setHidden":
      await prisma.encounterParticipant.update({ where: { id: action.participantId }, data: { hidden: action.hidden } });
      break;
    case "npcDamage": {
      const p = enc.participants.find((x) => x.id === action.participantId);
      if (!p) throw notFound("Participant");
      if (p.characterId) throw badRequest("Use the character HP controls for player characters");
      const after = Math.max(0, Math.min(p.hpMax, p.hpCurrent - action.amount));
      await prisma.encounterParticipant.update({ where: { id: p.id }, data: { hpCurrent: after } });
      await logEvent({
        campaignId,
        type: action.amount >= 0 ? "npc.damage" : "npc.heal",
        actorUserId: dmUserId,
        summary: `${p.hidden ? "A hidden combatant" : p.name} ${action.amount >= 0 ? `took ${action.amount} damage` : `healed ${-action.amount}`}${after === 0 ? " and went down" : ""}`,
        visibility: p.hidden ? "dm" : "public",
        payload: { participantId: p.id, before: p.hpCurrent, after },
      });
      break;
    }
    case "npcCondition": {
      const p = enc.participants.find((x) => x.id === action.participantId);
      if (!p) throw notFound("Participant");
      const conds = new Set((p.conditions as string[]) ?? []);
      if (action.remove) conds.delete(action.conditionKey);
      else conds.add(action.conditionKey);
      await prisma.encounterParticipant.update({ where: { id: p.id }, data: { conditions: [...conds] } });
      break;
    }
  }
  emitToCampaign(campaignId, "encounter.updated", { campaignId, encounterId });
  return getEncounter(campaignId, encounterId, true);
}
