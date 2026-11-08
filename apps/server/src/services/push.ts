import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import type { CampaignEventDto } from "@neom/shared";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { onlineUserIds } from "../realtime/io.js";

/**
 * Web Push (VAPID). Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 * In development a key pair is generated once into the OS temp dir (outside the repo).
 * In production, missing keys disable push with a warning instead of crashing the server.
 */
interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function loadVapid(): VapidKeys | null {
  const env = process.env;
  const subject = env.VAPID_SUBJECT?.trim() || "mailto:admin@neom-net.local";
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY.trim(), privateKey: env.VAPID_PRIVATE_KEY.trim(), subject };
  }
  if (env.NODE_ENV === "production") {
    logger.warn("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set: push notifications disabled. Generate with `npx web-push generate-vapid-keys`.");
    return null;
  }
  const dir = join(tmpdir(), "neom-net");
  const file = join(dir, "dev-vapid.json");
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<VapidKeys>;
      if (parsed.publicKey && parsed.privateKey) return { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject };
    }
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    return { ...keys, subject };
  } catch (err) {
    logger.warn({ err }, "Could not persist dev VAPID keys; using an in-memory pair");
    return { ...webpush.generateVAPIDKeys(), subject };
  }
}

const vapid = loadVapid();
if (vapid) webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

export const pushEnabled = Boolean(vapid);
export const vapidPublicKey = vapid?.publicKey ?? null;

export interface PushPayload {
  title: string;
  body: string;
  /** Absolute path inside the app the notification opens. */
  url: string;
  /** Same tag replaces the previous notification of that kind. */
  tag?: string;
  kind: string;
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200), lastUsedAt: new Date() },
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function listSubscriptionCount(userId: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { userId } });
}

/** Sends to every device of the given users. Dead subscriptions (404/410) are pruned. Never throws. */
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!vapid || userIds.length === 0) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(userIds)] } } });
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      const target: WebPushSubscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 60 * 60, urgency: "high" });
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          logger.warn({ status, endpoint: s.endpoint.slice(0, 40) }, "push delivery failed");
        }
      }
    }),
  );
  return delivered;
}

/** Event types that always reach the owner's devices, even while they are connected. */
const ALWAYS: Record<string, string> = {
  "character.assigned": "Sheet received",
  "roll.requested": "Roll requested",
  "mission.assigned": "New mission",
};
/** Status changes pushed to the owner when they are not connected to the campaign. */
const WHEN_AWAY: Record<string, string> = {
  "hp.damage": "Damage taken",
  "hp.heal": "Healed",
  "hp.down": "Down",
  "hp.dead": "Dead",
  "condition.applied": "Condition applied",
  "condition.removed": "Condition removed",
  "item.granted": "Item received",
  "override.set": "DM override",
  "effect.applied": "Effect applied",
  "effect.expired": "Effect expired",
  "character.updated": "Sheet updated",
  "character.imported": "Sheet imported",
  "character.reset": "Sheet reset",
  "grant.credits": "Credits",
  "grant.xp": "Experience",
  "grant.progressionPoints": "Progression points",
  "level.up": "Level up",
  "mission.status": "Mission update",
  "reputation.changed": "Reputation",
  "mission.created": "New mission",
};

/** Called for every logged event: decides who gets a push notification. */
export async function notifyForEvent(e: CampaignEventDto, ownerUserId: string | null): Promise<void> {
  if (!vapid) return;
  try {
    const online = new Set(onlineUserIds(e.campaignId));
    const url = e.characterId ? `/c/${e.campaignId}/hud/${e.characterId}` : `/c/${e.campaignId}`;
    // Owner notifications: never echo a player's own action back to them.
    if (ownerUserId && e.actorUserId !== ownerUserId) {
      const always = ALWAYS[e.type];
      const away = WHEN_AWAY[e.type];
      if (always || (away && !online.has(ownerUserId))) {
        await pushToUsers([ownerUserId], { title: `${always ?? away} · ${e.characterName ?? "NEOM//NET"}`, body: e.summary, url, tag: `${e.type}:${e.characterId ?? e.campaignId}`, kind: e.type });
      }
    }
    // DM notifications: approvals while away; mission answers always.
    const DM_ALWAYS: Record<string, string> = { "mission.accepted": "Mission accepted", "mission.declined": "Mission declined" };
    if (e.type === "rule.pending" || DM_ALWAYS[e.type]) {
      const dms = await prisma.campaignMembership.findMany({ where: { campaignId: e.campaignId, role: "DM" }, select: { userId: true } });
      const targets = dms.map((m) => m.userId).filter((id) => id !== e.actorUserId && (DM_ALWAYS[e.type] ? true : !online.has(id)));
      await pushToUsers(targets, { title: DM_ALWAYS[e.type] ?? "Awaiting your ruling", body: e.summary, url: `/c/${e.campaignId}/dm${DM_ALWAYS[e.type] ? "/missions" : ""}`, tag: `${e.type}:${e.campaignId}`, kind: e.type });
    }
  } catch (err) {
    logger.warn({ err }, "notifyForEvent failed");
  }
}
