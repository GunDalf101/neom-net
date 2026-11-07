import type { ClientToServerEvents, ServerToClientEvents } from "@neom/shared";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { parseCookies, userFromToken, type AuthUser } from "../auth/auth.js";

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { user: AuthUser }>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { user: AuthUser }>;

let io: IoServer | undefined;

/** campaignId → set of online userIds (counts sockets per user). */
const presence = new Map<string, Map<string, number>>();

export const rooms = {
  campaign: (id: string) => `campaign:${id}`,
  dm: (id: string) => `campaign:${id}:dm`,
  user: (id: string) => `user:${id}`,
};

export function createRealtime(httpServer: HttpServer): IoServer {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const user = await userFromToken(cookies[config.cookieName]);
      if (!user) return next(new Error("unauthorized"));
      socket.data.user = user;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on("connection", (socket: IoSocket) => {
    const user = socket.data.user;
    socket.join(rooms.user(user.id));
    const joined = new Set<string>();

    socket.on("campaign.join", async (campaignId, ack) => {
      try {
        const membership = await prisma.campaignMembership.findUnique({
          where: { campaignId_userId: { campaignId, userId: user.id } },
        });
        if (!membership) return ack(false, "Not a member of this campaign");
        socket.join(rooms.campaign(campaignId));
        if (membership.role === "DM") socket.join(rooms.dm(campaignId));
        joined.add(campaignId);
        markOnline(campaignId, user.id, +1);
        ack(true);
      } catch (err) {
        logger.error({ err }, "campaign.join failed");
        ack(false, "Join failed");
      }
    });

    socket.on("campaign.leave", (campaignId) => {
      if (!joined.has(campaignId)) return;
      socket.leave(rooms.campaign(campaignId));
      socket.leave(rooms.dm(campaignId));
      joined.delete(campaignId);
      markOnline(campaignId, user.id, -1);
    });

    socket.on("disconnect", () => {
      for (const campaignId of joined) markOnline(campaignId, user.id, -1);
    });
  });

  return io;
}

function markOnline(campaignId: string, userId: string, delta: number) {
  const map = presence.get(campaignId) ?? new Map<string, number>();
  const next = (map.get(userId) ?? 0) + delta;
  if (next <= 0) map.delete(userId);
  else map.set(userId, next);
  presence.set(campaignId, map);
  emitToCampaign(campaignId, "presence.updated", { campaignId, onlineUserIds: [...map.keys()] });
}

export function onlineUserIds(campaignId: string): string[] {
  return [...(presence.get(campaignId)?.keys() ?? [])];
}

type EventName = keyof ServerToClientEvents;
type EventArgs<E extends EventName> = Parameters<ServerToClientEvents[E]>;

export function emitToCampaign<E extends EventName>(campaignId: string, event: E, ...args: EventArgs<E>): void {
  io?.to(rooms.campaign(campaignId)).emit(event, ...args);
}
export function emitToDm<E extends EventName>(campaignId: string, event: E, ...args: EventArgs<E>): void {
  io?.to(rooms.dm(campaignId)).emit(event, ...args);
}
export function emitToUser<E extends EventName>(userId: string, event: E, ...args: EventArgs<E>): void {
  io?.to(rooms.user(userId)).emit(event, ...args);
}
/** DM room plus one specific user (e.g. the character owner). */
export function emitToDmAndUser<E extends EventName>(campaignId: string, userId: string, event: E, ...args: EventArgs<E>): void {
  io?.to([rooms.dm(campaignId), rooms.user(userId)]).emit(event, ...args);
}

export function emitCharacterUpdated(campaignId: string, characterId: string): void {
  emitToCampaign(campaignId, "character.updated", { campaignId, characterId });
}
