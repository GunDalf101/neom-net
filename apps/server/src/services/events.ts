import type { CampaignEventDto } from "@neom/shared";
import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db.js";
import { emitToCampaign, emitToDm, emitToDmAndUser } from "../realtime/io.js";

export interface LogEventInput {
  campaignId: string;
  type: string;
  summary: string;
  actorUserId?: string | null;
  characterId?: string | null;
  payload?: Record<string, unknown>;
  visibility?: "public" | "dm" | "owner";
  reversesEventId?: string | null;
  /** Required for owner-visibility events so the owner can be notified. */
  ownerUserId?: string | null;
}

const eventInclude = {
  actor: { select: { username: true } },
  character: { select: { name: true, ownerUserId: true } },
} satisfies Prisma.CampaignEventInclude;

type EventRow = Prisma.CampaignEventGetPayload<{ include: typeof eventInclude }>;

export function toEventDto(e: EventRow): CampaignEventDto {
  return {
    id: e.id,
    campaignId: e.campaignId,
    type: e.type,
    actorUserId: e.actorUserId,
    actorName: e.actor?.username ?? null,
    characterId: e.characterId,
    characterName: e.character?.name ?? null,
    summary: e.summary,
    payload: (e.payload as Record<string, unknown>) ?? {},
    visibility: e.visibility as CampaignEventDto["visibility"],
    reversesEventId: e.reversesEventId,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Appends an immutable event and pushes it to authorized clients. */
export async function logEvent(input: LogEventInput, db: Db = prisma): Promise<CampaignEventDto> {
  const row = await db.campaignEvent.create({
    data: {
      campaignId: input.campaignId,
      type: input.type,
      summary: input.summary,
      actorUserId: input.actorUserId ?? null,
      characterId: input.characterId ?? null,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      visibility: input.visibility ?? "public",
      reversesEventId: input.reversesEventId ?? null,
    },
    include: eventInclude,
  });
  const dto = toEventDto(row);
  broadcastEvent(dto, input.ownerUserId ?? row.character?.ownerUserId ?? null);
  return dto;
}

export function broadcastEvent(dto: CampaignEventDto, ownerUserId: string | null): void {
  if (dto.visibility === "public") emitToCampaign(dto.campaignId, "event.created", dto);
  else if (dto.visibility === "owner" && ownerUserId) emitToDmAndUser(dto.campaignId, ownerUserId, "event.created", dto);
  else emitToDm(dto.campaignId, "event.created", dto);
}

export async function listEvents(
  campaignId: string,
  viewer: { userId: string; isDm: boolean },
  opts: { limit?: number; before?: string; characterId?: string } = {},
): Promise<CampaignEventDto[]> {
  const where: Prisma.CampaignEventWhereInput = { campaignId };
  if (opts.characterId) where.characterId = opts.characterId;
  if (opts.before) where.createdAt = { lt: new Date(opts.before) };
  if (!viewer.isDm) {
    where.OR = [{ visibility: "public" }, { visibility: "owner", character: { ownerUserId: viewer.userId } }];
  }
  const rows = await prisma.campaignEvent.findMany({
    where,
    include: eventInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, opts.limit ?? 50),
  });
  return rows.map(toEventDto);
}
