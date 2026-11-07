#!/usr/bin/env node
/**
 * End-to-end acceptance run against a live server (default http://localhost:4000).
 * Drives the spec's demonstration workflow through the HTTP API with two sessions (DM + player).
 *
 *   SEED_PASSWORD=<pw> node scripts/smoke-e2e.mjs
 *
 * Requires the demo seed (npm run db:seed). Exits non-zero on the first failed assertion.
 */
const BASE = process.env.API_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD) {
  console.error("Set SEED_PASSWORD to the password printed by the seed.");
  process.exit(2);
}

class Session {
  constructor(name) {
    this.name = name;
    this.cookie = "";
  }
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const err = new Error(`${this.name} ${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }
}

let step = 0;
function check(cond, msg) {
  step++;
  if (!cond) {
    console.error(`  ✗ [${step}] ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ [${step}] ${msg}`);
}

const dm = new Session("DM");
const player = new Session("PLAYER");

console.log("1-2. DM logs in and opens the campaign");
await dm.call("POST", "/api/auth/login", { identifier: "overseer", password: PASSWORD });
const campaigns = await dm.call("GET", "/api/campaigns");
const campaign = campaigns.find((c) => c.name.includes("Night City"));
check(campaign && campaign.role === "DM", `DM sees "${campaign?.name}" as DM`);
const cid = campaign.id;
const full = await dm.call("GET", `/api/campaigns/${cid}`);
check(full.inviteCode === "NIGHTCITY", "DM sees the invite code");

console.log("3-4. Player joins (idempotent) and selects a character");
await player.call("POST", "/api/auth/login", { identifier: "antonio", password: PASSWORD });
const joined = await player.call("POST", "/api/campaigns/join", { inviteCode: "nightcity" });
check(joined.role === "PLAYER" && joined.inviteCode === undefined, "Player joined as PLAYER and cannot see the invite code");
const roster = await player.call("GET", `/api/campaigns/${cid}/characters`);
const antonioSummary = roster.find((c) => c.name === "Antonio Ettoro");
check(antonioSummary, "Antonio is on the roster");
const charId = antonioSummary.id;

// Remove leftovers from an interrupted previous run.
for (const d of await dm.call("GET", `/api/campaigns/${cid}/items`)) {
  if (d.name.includes("(E2E)")) await dm.call("DELETE", `/api/campaigns/${cid}/items/${d.id}`);
}
for (const e of await dm.call("GET", `/api/campaigns/${cid}/encounters`)) {
  if (e.status === "active") await dm.call("POST", `/api/campaigns/${cid}/encounters/${e.id}/action`, { action: "end" });
  if (e.name.includes("(E2E)")) await dm.call("DELETE", `/api/campaigns/${cid}/encounters/${e.id}`);
}
await dm.call("POST", `/api/characters/${charId}/hp`, { action: "rest", kind: "long" });
for (const o of await dm.call("GET", `/api/campaigns/${cid}/overrides`)) {
  if (o.characterId === charId) await dm.call("DELETE", `/api/campaigns/${cid}/overrides/${o.id}`);
}

console.log("    DM-controlled mode: players are read-only by default");
let view = await player.call("GET", `/api/characters/${charId}`);
check(view.permissions.readOnly === true && view.permissions.canEdit === false, "Player view reports read-only permissions");
let ro = false;
try {
  await player.call("POST", `/api/characters/${charId}/hp`, { action: "damage", amount: 1 });
} catch (e) {
  ro = e.status === 403;
}
check(ro, "Player HP change rejected with 403 while read-only");
const roRoll = await player.call("POST", `/api/campaigns/${cid}/rolls`, { characterId: charId, target: "skill.perception", category: "skill" });
check(roRoll.total >= 1, "Player can still roll dice while read-only");
// The rest of the workflow exercises player-side actions, so the DM switches the campaign to player-editable.
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { playersReadOnly: false } });
view = await player.call("GET", `/api/characters/${charId}`);
check(view.permissions.canEdit === true, "DM can hand editing back to players via settings");
check(view.derived.ac.value === 16, `AC = ${view.derived.ac.value} (10 + DEX 4 + trench coat 2)`);
check(view.derived.initiative.value === 4, "Initiative +4");
check(view.derived.speed.value === 9, "Speed 9 m");
check(view.derived.skills.stealth.value === 9, `Stealth = ${view.derived.skills.stealth.value} (4 + expertise 4 + boots 1)`);
check(view.derived.specialSkills.hacking.value === 8, `Hacking = ${view.derived.specialSkills.hacking.value} (3 + rank 2 + prof 2 + deck 1)`);
check(view.permissions.isOwner && !view.permissions.isDm, "Player permissions are owner-level, not DM");

console.log("    Player cannot grant items or override stats");
let denied = false;
try {
  await player.call("POST", `/api/campaigns/${cid}/items/grant`, { characterId: charId, definitionId: "x" });
} catch (e) {
  denied = e.status === 403;
}
check(denied, "Grant endpoint rejects players with 403");
denied = false;
try {
  await player.call("POST", `/api/campaigns/${cid}/overrides`, { characterId: charId, target: "ac", value: 30 });
} catch (e) {
  denied = e.status === 403;
}
check(denied, "Override endpoint rejects players with 403");
denied = false;
try {
  await player.call("PATCH", `/api/characters/${charId}`, { credits: 999999 });
} catch (e) {
  denied = e.status === 403;
}
check(denied, "Players cannot change their own credits (403)");
const creditsBefore = (await player.call("GET", `/api/characters/${charId}`)).character.credits;
await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: 250, note: "e2e" });
check((await player.call("GET", `/api/characters/${charId}`)).character.credits === creditsBefore + 250, "DM grant changes credits");
await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: -250 });

console.log("5. DM creates an augmentation");
const aug = await dm.call("POST", `/api/campaigns/${cid}/items`, {
  name: "Kiroshi Spectral Optics Mk. IV (E2E)",
  description: "Created by the smoke test.",
  category: "cyberware",
  rarity: "rare",
  augmentationSlot: "eyes",
  capacityCost: 3,
  effects: [
    { kind: "modifier", target: "skill.perception", value: 2, op: "add", label: "Spectral Optics" },
    { kind: "sense", name: "Darkvision", rangeMeters: 18 },
    { kind: "advantage", on: "skill.investigation", mode: "advantage" },
  ],
});
check(aug.id && aug.augmentationSlot === "eyes", `Augmentation "${aug.name}" created`);

console.log("6-7. DM grants it; player sees it in inventory");
await dm.call("POST", `/api/campaigns/${cid}/items/grant`, { characterId: charId, definitionId: aug.id, quantity: 1 });
view = await player.call("GET", `/api/characters/${charId}`);
const instance = view.items.find((i) => i.definitionId === aug.id);
check(instance && instance.status === "stored", "Player's inventory contains the granted augmentation (stored)");
const perceptionBefore = view.derived.skills.perception.value;

console.log("8-9. Player installs it; statistics update");
view = await player.call("POST", `/api/characters/${charId}/items/${instance.id}/action`, { action: "install" });
const installed = view.items.find((i) => i.id === instance.id);
check(installed.status === "installed" && installed.installedSlot === "eyes", "Augmentation installed in the eyes slot");
check(view.derived.skills.perception.value === perceptionBefore + 2, `Perception ${perceptionBefore} → ${view.derived.skills.perception.value}`);
check(view.derived.capacityUsed === 4, `Capacity used = ${view.derived.capacityUsed}/${view.derived.capacity.value}`);
check(view.derived.senses.some((s) => s.name === "Darkvision"), "Darkvision listed in senses");
check(view.derived.rollFlags.some((f) => f.on === "skill.investigation"), "Investigation advantage flag present");
const perceptionLine = view.derived.skills.perception.breakdown.find((l) => l.label === "Spectral Optics");
check(perceptionLine && perceptionLine.value === 2, "Breakdown explains the +2 from Spectral Optics");

console.log("    Capacity is enforced");
const heavy = await dm.call("POST", `/api/campaigns/${cid}/items`, {
  name: "Overweight Reactor (E2E)",
  category: "cyberware",
  augmentationSlot: "torso",
  capacityCost: 9,
  effects: [],
});
await dm.call("POST", `/api/campaigns/${cid}/items/grant`, { characterId: charId, definitionId: heavy.id });
view = await player.call("GET", `/api/characters/${charId}`);
const heavyInst = view.items.find((i) => i.definitionId === heavy.id);
let blocked = false;
try {
  await player.call("POST", `/api/characters/${charId}/items/${heavyInst.id}/action`, { action: "install" });
} catch (e) {
  blocked = e.status === 422;
}
check(blocked, "Installing beyond capacity is rejected with 422");

console.log("10. DM starts a live session and encounter");
await dm.call("POST", `/api/campaigns/${cid}/session/start`);
const encounters = await dm.call("GET", `/api/campaigns/${cid}/encounters`);
let enc = encounters.find((e) => e.name === "Alley Ambush" && e.status === "planned");
if (!enc) {
  enc = await dm.call("POST", `/api/campaigns/${cid}/encounters`, { name: "Alley Ambush (E2E)" });
  await dm.call("POST", `/api/campaigns/${cid}/encounters/${enc.id}/participants`, { characterId: charId, initiative: 15 });
}
for (const e of encounters.filter((x) => x.status === "active")) {
  await dm.call("POST", `/api/campaigns/${cid}/encounters/${e.id}/action`, { action: "end" });
}
enc = await dm.call("POST", `/api/campaigns/${cid}/encounters/${enc.id}/action`, { action: "rollInitiative" });
enc = await dm.call("POST", `/api/campaigns/${cid}/encounters/${enc.id}/action`, { action: "start" });
check(enc.status === "active" && enc.round === 1, "Encounter active, round 1");
const playerEnc = await player.call("GET", `/api/campaigns/${cid}/encounters/${enc.id}`);
check(playerEnc.participants.every((p) => !p.isNpc || p.hpMax === 2), "Player sees NPC health only as a coarse state");

console.log("11-12. Character takes damage; the conditional rule fires");
view = await player.call("GET", `/api/characters/${charId}`);
if (view.character.hpCurrent < view.derived.maxHp.value) {
  await dm.call("POST", `/api/characters/${charId}/hp`, { action: "heal", amount: 99 });
}
const reflexBefore = (await player.call("GET", `/api/characters/${charId}`)).derived.specialSkills.reflex.value;
view = await dm.call("POST", `/api/characters/${charId}/hp`, { action: "damage", amount: 10, damageType: "physical" });
check(view.character.hpCurrent === 2, `HP now ${view.character.hpCurrent}/12 (below 30%)`);
const erp = view.activeEffects.find((e) => e.label === "Emergency Reflex Protocol");
check(erp && erp.remainingTurns === 3, "Emergency Reflex Protocol active effect created (3 turns)");
check(view.derived.specialSkills.reflex.value === reflexBefore + 2, `Reflex ${reflexBefore} → ${view.derived.specialSkills.reflex.value}`);
const traces = await dm.call("GET", `/api/campaigns/${cid}/traces?limit=10`);
const erpTrace = traces.find((t) => t.ruleName === "Emergency Reflex Protocol" && t.status === "applied");
check(erpTrace && erpTrace.result.trace.some((s) => s.outcome === "passed"), "Execution trace recorded with passed conditions");
const pending = await dm.call("GET", `/api/campaigns/${cid}/pending`);
check(pending.some((p) => p.ruleName === "Adrenaline Overdrive"), "Assisted rule queued for DM approval");

console.log("    Once-per-encounter cooldown holds");
await dm.call("POST", `/api/characters/${charId}/hp`, { action: "heal", amount: 10 });
view = await dm.call("POST", `/api/characters/${charId}/hp`, { action: "damage", amount: 10, damageType: "physical" });
const traces2 = await dm.call("GET", `/api/campaigns/${cid}/traces?limit=10`);
const blockedTrace = traces2.find((t) => t.ruleName === "Emergency Reflex Protocol" && t.status === "noop");
check(blockedTrace && blockedTrace.result.trace.some((s) => s.nodeType === "flow.cooldown" && s.outcome === "blocked"), "Second trigger blocked by cooldown, trace explains why");

console.log("13. Both DM and player see the updated state");
const dmView = await dm.call("GET", `/api/characters/${charId}`);
const plView = await player.call("GET", `/api/characters/${charId}`);
check(dmView.character.version === plView.character.version && dmView.derived.specialSkills.reflex.value === plView.derived.specialSkills.reflex.value, "DM and player views agree");

console.log("    DM approves the assisted rule");
const resolved = await dm.call("POST", `/api/campaigns/${cid}/pending/${pending[0].id}/resolve`, { decision: "approve", note: "Looks right" });
check(resolved.status === "approved", "Pending action approved");
view = await dm.call("GET", `/api/characters/${charId}`);
check(view.activeEffects.some((e) => e.label === "Adrenaline Overdrive"), "Adrenaline Overdrive effect applied after approval");

console.log("14. DM overrides the rule's result");
const ov = await dm.call("POST", `/api/campaigns/${cid}/overrides`, { characterId: charId, target: "special.reflex", value: 5, reason: "Ruling: implant glitched", durationTurns: 2 });
view = await player.call("GET", `/api/characters/${charId}`);
check(view.derived.specialSkills.reflex.value === 5 && view.derived.specialSkills.reflex.override?.original === reflexBefore + 2, `Reflex overridden to 5 (original ${view.derived.specialSkills.reflex.override?.original} kept)`);
await dm.call("DELETE", `/api/campaigns/${cid}/overrides/${ov.id}`);
view = await player.call("GET", `/api/characters/${charId}`);
check(view.derived.specialSkills.reflex.value === reflexBefore + 2 && !view.derived.specialSkills.reflex.override, "Revoking the override restores the calculated value");

console.log("    Turn advancement expires the timed effect and applies the expiry effect");
// Durations tick at the start of the character's own turn: 3 full rounds guarantee 3 ticks.
const rounds = 3 * Math.max(1, enc.participants.length);
for (let i = 0; i < rounds; i++) await dm.call("POST", `/api/campaigns/${cid}/encounters/${enc.id}/action`, { action: "next" });
view = await dm.call("GET", `/api/characters/${charId}`);
check(!view.activeEffects.some((e) => e.label === "Emergency Reflex Protocol"), "Emergency Reflex Protocol expired after 3 of the character's turns");
check(view.conditions.some((c) => c.key === "mentalStrain"), "Mental Strain applied on expiry");

console.log("    Player rolls a skill check (server-side modifier)");
const rollRes = await player.call("POST", `/api/campaigns/${cid}/rolls`, { characterId: charId, target: "skill.stealth", category: "skill" });
check(rollRes.expression.replace(/\s/g, "") === "1d20+9" && rollRes.total >= 1 + 9 && rollRes.total <= 20 + 9, `Rolled ${rollRes.expression} = ${rollRes.total}`);

console.log("15. The event history records what happened");
const events = await dm.call("GET", `/api/campaigns/${cid}/events?limit=100`);
const types = new Set(events.map((e) => e.type));
for (const t of ["item.granted", "augmentation.installed", "hp.damage", "rule.applied", "override.set", "override.revoked", "encounter.started", "effect.expired", "condition.applied"]) {
  check(types.has(t), `event log contains ${t}`);
}

console.log("16. State persists (fresh session reads the same data)");
const fresh = new Session("FRESH");
await fresh.call("POST", "/api/auth/login", { identifier: "antonio", password: PASSWORD });
const again = await fresh.call("GET", `/api/characters/${charId}`);
check(again.character.version === view.character.version && again.items.some((i) => i.definitionId === aug.id && i.status === "installed"), "Fresh login sees installed augmentation and same version");

console.log("    Cleanup: end encounter, heal, uninstall E2E items");
await dm.call("POST", `/api/campaigns/${cid}/encounters/${enc.id}/action`, { action: "end" });
await dm.call("POST", `/api/characters/${charId}/hp`, { action: "rest", kind: "long" });
await dm.call("POST", `/api/characters/${charId}/items/${instance.id}/action`, { action: "uninstall" });
await dm.call("DELETE", `/api/campaigns/${cid}/items/${aug.id}`);
await dm.call("DELETE", `/api/campaigns/${cid}/items/${heavy.id}`);
await dm.call("POST", `/api/campaigns/${cid}/session/end`);
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { playersReadOnly: true } });
check((await player.call("GET", `/api/characters/${charId}`)).permissions.readOnly === true, "Campaign restored to DM-controlled mode");
for (const p of await dm.call("GET", `/api/campaigns/${cid}/pending`)) {
  await dm.call("POST", `/api/campaigns/${cid}/pending/${p.id}/resolve`, { decision: "reject", note: "e2e cleanup" });
}
console.log(`\nAll ${step} checks passed.`);
