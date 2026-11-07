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
await dm.call("PATCH", `/api/characters/${charId}`, { name: "Antonio Ettoro", specialSkills: { aura: { rank: 0, proficiency: 0 } } });
{
  // Ownership and gear may have been left mid-flight by an interrupted run or a manual hand-off test.
  const cmembers = (await dm.call("GET", `/api/campaigns/${cid}`)).members;
  const antonioMember = cmembers.find((m) => m.username === "antonio");
  const current = await dm.call("GET", `/api/characters/${charId}`);
  if (antonioMember && current.character.ownerUserId !== antonioMember.userId) await dm.call("POST", `/api/characters/${charId}/assign`, { userId: antonioMember.userId });
  for (const it of current.items) {
    const n = it.definition.name;
    if ((n.includes("Lexington") || n.includes("Trench Coat") || n.includes("Netrunner Deck")) && it.status !== "equipped" && !it.installedSlot) await dm.call("POST", `/api/characters/${charId}/items/${it.id}/action`, { action: "equip" });
  }
  if (current.claimToken) await dm.call("DELETE", `/api/characters/${charId}/claim-link`);
}
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { playersReadOnly: true, specialExpertiseEnabled: true } });

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
check(view.permissions.canManageInventory === true, "Read-only player may still manage their own inventory");
const pistol = view.items.find((i) => i.definition.name.includes("Lexington"));
view = await player.call("POST", `/api/characters/${charId}/items/${pistol.id}/action`, { action: "unequip" });
check(view.items.find((i) => i.id === pistol.id).status === "stored", "Read-only player unequipped their pistol");
view = await player.call("POST", `/api/characters/${charId}/items/${pistol.id}/action`, { action: "equip" });
check(view.items.find((i) => i.id === pistol.id).status === "equipped", "Read-only player re-equipped it");
const boots = view.items.find((i) => i.installedSlot === "feet");
let roInstall = false;
try {
  await player.call("POST", `/api/characters/${charId}/items/${boots.id}/action`, { action: "uninstall" });
} catch (e) {
  roInstall = e.status === 403;
}
check(roInstall, "Read-only player cannot remove cyberware (403)");
const status = async (fn) => {
  try {
    await fn();
    return 200;
  } catch (e) {
    return e.status ?? -1;
  }
};

console.log("    Portraits: owners upload their own picture even in DM-controlled mode");
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const portraitBefore = view.character.portraitUrl;
check(view.permissions.canChangePortrait === true, "Read-only player view allows changing the portrait");
view = await player.call("PUT", `/api/characters/${charId}/portrait`, { portraitUrl: PIXEL });
check(view.character.portraitUrl === PIXEL, "Read-only player uploaded a portrait");
check((await status(() => player.call("PATCH", `/api/characters/${charId}`, { name: "Hacked" }))) === 403, "Other identity fields stay DM-only (403)");
check((await status(() => player.call("PUT", `/api/characters/${charId}/portrait`, { portraitUrl: "javascript:alert(1)" }))) === 400, "Non-image portrait URLs are rejected (400)");
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { playersManagePortrait: false } });
check((await status(() => player.call("PUT", `/api/characters/${charId}/portrait`, { portraitUrl: null }))) === 403, "DM can take portraits back (403 when playersManagePortrait is off)");
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { playersManagePortrait: true } });
view = await dm.call("PUT", `/api/characters/${charId}/portrait`, { portraitUrl: portraitBefore ?? null });
check(view.character.portraitUrl === (portraitBefore ?? null), "DM restored the original portrait");

console.log("    Share links: a signed-in user with the link can read the sheet");
const outsider = new Session("OUTSIDER");
if ((await status(() => outsider.call("POST", "/api/auth/register", { email: "outsider-e2e@neom.local", username: "outsider-e2e", password: PASSWORD }))) !== 200) {
  await outsider.call("POST", "/api/auth/login", { identifier: "outsider-e2e@neom.local", password: PASSWORD });
}
view = await player.call("POST", `/api/characters/${charId}/share`, {});
const token1 = view.shareToken;
check(typeof token1 === "string" && token1.length >= 24 && view.permissions.canShare, "Owner created a share link");
check((await player.call("POST", `/api/characters/${charId}/share`, {})).shareToken === token1, "Creating again returns the same link");
check((await status(() => new Session("ANON").call("GET", `/api/shared/${token1}`))) === 401, "Unauthenticated share-link read is rejected (401)");
const sharedView = await outsider.call("GET", `/api/shared/${token1}`);
check(sharedView.isMember === false && sharedView.sheet.character.name === "Antonio Ettoro" && sharedView.derived.ac.value > 0, "Non-member reads the sheet with derived stats");
check((await player.call("GET", `/api/shared/${token1}`)).isMember === true, "Campaign member is pointed at the live HUD");
check((await status(() => outsider.call("GET", `/api/characters/${charId}`))) === 403, "The link does not open the live sheet to non-members (403)");
check((await status(() => outsider.call("POST", `/api/characters/${charId}/share`, {}))) === 403, "Non-members cannot create share links (403)");
check((await status(() => outsider.call("GET", "/api/shared/not*a*token"))) === 400, "Malformed tokens are rejected (400)");
const token2 = (await player.call("POST", `/api/characters/${charId}/share`, { rotate: true })).shareToken;
check(token2 !== token1 && (await status(() => outsider.call("GET", `/api/shared/${token1}`))) === 404, "Rotating the link kills the old one (404)");
view = await dm.call("DELETE", `/api/characters/${charId}/share`);
check(view.shareToken === null && (await status(() => outsider.call("GET", `/api/shared/${token2}`))) === 404, "Revoked link returns 404");
check((await player.call("GET", `/api/characters/${charId}`)).shareToken === null, "Owner view shows no active link after revoke");

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

console.log("    Sheet changes are logged field by field");
await dm.call("PATCH", `/api/characters/${charId}`, { background: "Street Courier (E2E)" });
await dm.call("PATCH", `/api/characters/${charId}`, { background: "Street Courier" });
const logRows = await dm.call("GET", `/api/campaigns/${cid}/events?limit=10&characterId=${charId}`);
const upd = logRows.find((e) => e.type === "character.updated" && Array.isArray(e.payload.changes) && e.payload.changes.some((c) => c.field === "background"));
check(upd && upd.payload.changes[0].from !== upd.payload.changes[0].to && /background/.test(upd.summary), `Change log entry: ${upd?.summary}`);

console.log("    DM sends a sheet to another player and back");
const members = (await dm.call("GET", `/api/campaigns/${cid}`)).members;
const dmUser = members.find((m) => m.role === "DM");
const antonioUser = members.find((m) => m.username === "antonio");
let assignDenied = false;
try {
  await player.call("POST", `/api/characters/${charId}/assign`, { userId: dmUser.userId });
} catch (e) {
  assignDenied = e.status === 403;
}
check(assignDenied, "Players cannot reassign sheets (403)");
view = await dm.call("POST", `/api/characters/${charId}/assign`, { userId: dmUser.userId });
check(view.character.ownerUserId === dmUser.userId, "Sheet handed to the DM account");
let lostAccess = false;
try {
  await player.call("POST", `/api/characters/${charId}/items/${pistol.id}/action`, { action: "unequip" });
} catch (e) {
  lostAccess = e.status === 403;
}
check(lostAccess, "Previous owner can no longer act on it");
view = await dm.call("POST", `/api/characters/${charId}/assign`, { userId: antonioUser.userId });
check(view.character.ownerUserId === antonioUser.userId, "Sheet handed back to antonio");
const assignedEvt = (await dm.call("GET", `/api/campaigns/${cid}/events?limit=5&characterId=${charId}`)).find((e) => e.type === "character.assigned");
check(Boolean(assignedEvt), "character.assigned event logged");

console.log("    DM hands a sheet over by link");
let claimDenied = false;
try {
  await player.call("POST", `/api/characters/${charId}/claim-link`, {});
} catch (e) {
  claimDenied = e.status === 403;
}
check(claimDenied, "Players cannot create hand-off links (403)");
view = await dm.call("POST", `/api/characters/${charId}/assign`, { userId: dmUser.userId });
view = await dm.call("POST", `/api/characters/${charId}/claim-link`, {});
const claimToken = view.claimToken;
check(typeof claimToken === "string" && claimToken.length >= 16, "DM created a hand-off link");
check((await player.call("GET", `/api/characters/${charId}`)).claimToken === null, "Players never see the hand-off token");
const claimer = new Session("CLAIMER");
const claimerEmail = "e2e-claimer@neom.local";
try {
  await claimer.call("POST", "/api/auth/register", { email: claimerEmail, password: "claimer-pass" });
} catch (e) {
  if (e.status !== 409) throw e;
  await claimer.call("POST", "/api/auth/login", { identifier: claimerEmail, password: "claimer-pass" });
}
const preview = await claimer.call("GET", `/api/shared/claim/${claimToken}`);
check(preview.characterName === "Antonio Ettoro" && preview.alreadyYours === false, `Outsider previews the hand-off (member=${preview.isMember})`);
const taken = await claimer.call("POST", `/api/shared/claim/${claimToken}`);
check(taken.characterId === charId, "Outsider took the sheet");
const asClaimer = await claimer.call("GET", `/api/characters/${charId}`);
check(asClaimer.permissions.isOwner === true && asClaimer.character.ownerUserId !== dmUser.userId, "Claimer is now the owner and a campaign member");
let reused = false;
try {
  await claimer.call("GET", `/api/shared/claim/${claimToken}`);
} catch (e) {
  reused = e.status === 404;
}
check(reused, "The hand-off link is single-use (404 afterwards)");
view = await dm.call("POST", `/api/characters/${charId}/assign`, { userId: antonioUser.userId });
check(view.character.ownerUserId === antonioUser.userId, "Sheet handed back to antonio");

console.log("    Push subscriptions register per device");
const pushCfg = await player.call("GET", "/api/push/config");
check(typeof pushCfg.enabled === "boolean" && (pushCfg.enabled ? typeof pushCfg.publicKey === "string" : true), `Push config: enabled=${pushCfg.enabled}`);
const fakeEndpoint = `https://push.invalid/neom-e2e/${Date.now()}`;
const subRes = await player.call("POST", "/api/push/subscribe", { endpoint: fakeEndpoint, keys: { p256dh: "BPubKeyE2E", auth: "authE2E" } });
check(subRes.ok === true && subRes.devices >= 1, `Subscribed (${subRes.devices} device)`);
const unsubRes = await player.call("POST", "/api/push/unsubscribe", { endpoint: fakeEndpoint });
check(unsubRes.devices === subRes.devices - 1, "Unsubscribed");

console.log("    Hit die follows the class");
const barb = await dm.call("POST", "/api/characters", { campaignId: cid, name: "Krak (E2E)", characterClass: "Barbarian // Street Brawler", attributes: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 } });
check(barb.character.hitDieSize === 12 && barb.character.hpMaxBase === 14, `Barbarian starts with d12 and ${barb.character.hpMaxBase} HP (12 + CON 2)`);
const wiz = await dm.call("POST", "/api/characters", { campaignId: cid, name: "Vex (E2E)", characterClass: "wizard", hitDieSize: 10 });
check(wiz.character.hitDieSize === 10, "An explicit hit die overrides the class default");
const custom = await dm.call("POST", "/api/characters", { campaignId: cid, name: "Zed (E2E)", characterClass: "Netrunner" });
check(custom.character.hitDieSize === 8, "Unknown classes fall back to d8");
for (const ch of [barb, wiz, custom]) await dm.call("DELETE", `/api/characters/${ch.character.id}`);

console.log("    DM adjusts AC without an item");
let acDenied = false;
try {
  await player.call("PATCH", `/api/characters/${charId}`, { acBonus: 5 });
} catch (e) {
  acDenied = e.status === 403;
}
check(acDenied, "Player cannot change base AC or the adjustment (403)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { acBonus: 2 });
check(view.derived.ac.value === 18 && view.derived.ac.breakdown.some((l) => l.label === "DM adjustment"), `AC with +2 DM adjustment = ${view.derived.ac.value}`);
view = await dm.call("PATCH", `/api/characters/${charId}`, { acBase: 12 });
check(view.derived.ac.value === 20, `AC with base 12 = ${view.derived.ac.value}`);
view = await dm.call("PATCH", `/api/characters/${charId}`, { acBase: 10, acBonus: 0 });
check(view.derived.ac.value === 16, "AC restored to 16");

console.log("    Cyberpunk skills take proficiency and expertise");
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { specialExpertiseEnabled: true } });
view = await player.call("GET", `/api/characters/${charId}`);
const auraBase = view.derived.specialSkills.aura.value;
const pb = view.derived.profBonus.value;
view = await player.call("PATCH", `/api/characters/${charId}`, { specialSkills: { aura: { rank: 0, proficiency: 1 } } });
check(view.derived.specialSkills.aura.value === auraBase + pb && view.derived.specialSkills.aura.proficiency === 1, `Aura proficient: ${auraBase} → ${view.derived.specialSkills.aura.value}`);
view = await player.call("PATCH", `/api/characters/${charId}`, { specialSkills: { aura: { rank: 0, proficiency: 2 } } });
check(view.derived.specialSkills.aura.value === auraBase + 2 * pb && view.derived.specialSkills.aura.proficiency === 2, `Aura expertise: → ${view.derived.specialSkills.aura.value}`);
check(view.derived.specialSkills.aura.breakdown.some((l) => /Expertise/.test(l.label)), "Breakdown names the expertise line");
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { specialExpertiseEnabled: false } });
view = await player.call("GET", `/api/characters/${charId}`);
check(view.derived.specialSkills.aura.proficiency === 1 && view.derived.specialSkills.aura.value === auraBase + pb, "Disabling expertise in settings caps cyberpunk skills at proficiency");
await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { specialExpertiseEnabled: true } });

console.log("    Export and import a sheet");
const exported = await player.call("GET", `/api/characters/${charId}/export`);
check(exported.format === "neom-net/character" && exported.version === 1 && exported.character.specialSkills.aura.proficiency === 2, "Export carries format, version and the sheet (aura expertise)");
check(Array.isArray(exported.character.items) && exported.character.items.length > 0, "Export lists the character's items");
await player.call("PATCH", `/api/characters/${charId}`, { name: "Antonio Ettoro (E2E)", specialSkills: { aura: { rank: 0, proficiency: 0 } } });
view = await player.call("POST", `/api/characters/${charId}/import`, exported);
check(view.character.name === "Antonio Ettoro" && view.derived.specialSkills.aura.proficiency === 2, "Import restores name and cyberpunk skill proficiency");
let badImport = false;
try {
  await player.call("POST", `/api/characters/${charId}/import`, { format: "neom-net/character", version: 1, character: { attributes: { str: "lots" } } });
} catch (e) {
  badImport = e.status === 400;
}
check(badImport, "Import rejects a malformed sheet with 400");
view = await player.call("PATCH", `/api/characters/${charId}`, { specialSkills: { aura: { rank: 0, proficiency: 0 } } });
check(view.derived.specialSkills.aura.value === auraBase, "Aura restored for the rest of the run");

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
for (const t of ["item.granted", "augmentation.installed", "hp.damage", "rule.applied", "override.set", "override.revoked", "encounter.started", "effect.expired", "condition.applied", "character.shared", "character.unshared"]) {
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
