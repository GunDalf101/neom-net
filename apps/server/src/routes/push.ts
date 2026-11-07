import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/auth.js";
import { wrap } from "../errors.js";
import { parseBody } from "../middleware/validate.js";
import { listSubscriptionCount, pushEnabled, pushToUsers, removeSubscription, saveSubscription, vapidPublicKey } from "../services/push.js";

export const pushRouter = Router();
pushRouter.use(requireAuth);

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
});

/** Public key the browser needs to subscribe; null when push is disabled on this deployment. */
pushRouter.get("/config", wrap<AuthedRequest>(async (req, res) => {
  res.json({ enabled: pushEnabled, publicKey: vapidPublicKey, devices: await listSubscriptionCount(req.user.id) });
}));

pushRouter.post("/subscribe", wrap<AuthedRequest>(async (req, res) => {
  const sub = parseBody(SubscriptionSchema, req.body);
  await saveSubscription(req.user.id, sub, String(req.headers["user-agent"] ?? ""));
  res.json({ ok: true, devices: await listSubscriptionCount(req.user.id) });
}));

pushRouter.post("/unsubscribe", wrap<AuthedRequest>(async (req, res) => {
  const { endpoint } = parseBody(z.object({ endpoint: z.string().min(1) }), req.body);
  await removeSubscription(req.user.id, endpoint);
  res.json({ ok: true, devices: await listSubscriptionCount(req.user.id) });
}));

/** Sends a test notification to the caller's own devices. */
pushRouter.post("/test", wrap<AuthedRequest>(async (req, res) => {
  const delivered = await pushToUsers([req.user.id], { title: "NEOM//NET uplink test", body: "Push notifications are working on this device.", url: "/", tag: "test", kind: "test" });
  res.json({ delivered });
}));
