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
  async call(method, path, body, extraHeaders = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", "x-neom-client": "e2e", cookie: this.cookie, ...extraHeaders },
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

const status = async (fn) => {
  try {
    await fn();
    return 200;
  } catch (e) {
    return e.status ?? -1;
  }
};
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

console.log("    Hardening: password policy, CSRF guard, rate-limit headers");
check((await status(() => new Session("WEAK").call("POST", "/api/auth/register", { email: "weak-e2e@neom.local", password: "short1" }))) === 400, "Registration rejects a short passphrase (400)");
check((await status(() => new Session("WEAK").call("POST", "/api/auth/register", { email: "weak-e2e@neom.local", password: "password123" }))) === 400, "Registration rejects a common passphrase (400)");
check((await status(() => dm.call("POST", `/api/campaigns/${cid}/messages`, { userIds: [], message: "x" }, { "x-neom-client": "" }))) === 403, "A cookie-authenticated mutation without the client header is refused (403)");
check((await status(() => dm.call("POST", `/api/campaigns/${cid}/messages`, { userIds: [], message: "x" }, { origin: "https://evil.example" }))) === 403, "A mutation from a foreign Origin is refused (403)");
{
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-neom-client": "e2e" }, body: JSON.stringify({ identifier: "nobody-e2e", password: "definitely-wrong" }) });
  check(res.status === 401 && res.headers.get("ratelimit-limit") !== null && res.headers.get("x-content-type-options") === "nosniff", "Login answers with RateLimit-* and security headers");
}

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
  if (current.character.cyberpsychosis !== 0) await dm.call("PATCH", `/api/characters/${charId}`, { cyberpsychosis: 0 });
  for (const r of await dm.call("GET", `/api/characters/${charId}/reputation`)) {
    if (r.value !== 0) await dm.call("POST", `/api/characters/${charId}/reputation`, { factionId: r.faction.id, value: 0, reason: "e2e cleanup" });
  }
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
check((await status(() => player.call("GET", `/api/characters/${charId}`))) === 403, "While the DM holds the sheet, the former owner cannot open it (and never sees the hand-off token)");
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

console.log("    DM messages several players; each gets a notification with its own read state");
const claimerUser = (await dm.call("GET", `/api/campaigns/${cid}`)).members.find((m) => m.username.startsWith("e2e-claimer"));
const sent = await dm.call("POST", `/api/campaigns/${cid}/messages`, { userIds: [antonioUser.userId, claimerUser.userId], message: "Meet at the Neon Garden at dawn. (E2E)", kind: "whisper" });
check(Array.isArray(sent) && sent.length === 2 && sent.every((m) => m.readAt === null), "One message per recipient, both unread");
const antonioInbox = await player.call("GET", `/api/campaigns/${cid}/messages`);
const mine = antonioInbox.filter((m) => m.body.includes("(E2E)") && m.toUserId === antonioUser.userId);
check(mine.length >= 1 && !antonioInbox.some((m) => m.toUserId === claimerUser.userId), "Antonio sees only his copy, not the other player's");
const marked = await player.call("POST", `/api/campaigns/${cid}/messages/read`, { ids: [mine[0].id] });
check(typeof marked.unread === "number", `Marked read; ${marked.unread} unread left`);
const afterRead = (await player.call("GET", `/api/campaigns/${cid}/messages`)).find((m) => m.id === mine[0].id);
check(afterRead && afterRead.readAt !== null, "readAt is set after opening");
const allRead = await player.call("POST", `/api/campaigns/${cid}/messages/read`, {});
check(allRead.unread === 0, "Mark all read clears the badge");
let noRecipient = false;
try {
  await dm.call("POST", `/api/campaigns/${cid}/messages`, { userIds: ["not-a-member"], message: "x", kind: "whisper" });
} catch (e) {
  noRecipient = e.status === 404;
}
check(noRecipient, "Non-members cannot be addressed (404)");

console.log("    Chat threads page backwards");
for (let i = 1; i <= 3; i++) await dm.call("POST", `/api/campaigns/${cid}/messages`, { userIds: [antonioUser.userId], message: `Page test ${i} (E2E)`, kind: "whisper" });
const page1 = await player.call("GET", `/api/campaigns/${cid}/messages?limit=2&peer=${dmUser.userId}`);
check(page1.length === 2 && page1[0].createdAt >= page1[1].createdAt && page1.every((m) => [m.fromUserId, m.toUserId].includes(dmUser.userId)), "First page: 2 newest messages of the DM thread");
const page2 = await player.call("GET", `/api/campaigns/${cid}/messages?limit=2&peer=${dmUser.userId}&before=${encodeURIComponent(page1[1].createdAt)}`);
check(page2.length >= 1 && page2.every((m) => m.createdAt < page1[1].createdAt) && !page2.some((m) => page1.some((p) => p.id === m.id)), "Second page: strictly older, no overlap");
const otherThread = await player.call("GET", `/api/campaigns/${cid}/messages?limit=50&peer=${claimerUser.userId}`);
check(otherThread.every((m) => [m.fromUserId, m.toUserId].includes(claimerUser.userId)), "peer filter scopes the thread");
let badLimit = false;
try {
  await player.call("GET", `/api/campaigns/${cid}/messages?limit=999`);
} catch (e) {
  badLimit = e.status === 400;
}
check(badLimit, "Page size is capped (400 above 200)");
await player.call("POST", `/api/campaigns/${cid}/messages/read`, {});

console.log("    Crew-only missions are visible only to assigned players and notify them");
const crewMission = await dm.call("POST", `/api/campaigns/${cid}/missions`, { name: "Quiet Job (E2E)", description: "Crew only.", objectives: [{ id: "o1", text: "Find the fixer", done: false }], status: "available", kind: "secondary", rewards: { xp: 50, credits: 0, progressionPoints: 0, itemDefinitionIds: [] }, assignedCharacterIds: [charId], visibleToPlayers: true, assignedOnly: true });
check(crewMission.assignedOnly === true && crewMission.kind === "secondary", "Secondary mission saved as crew-only");
check((await player.call("GET", `/api/campaigns/${cid}/missions`)).some((m) => m.id === crewMission.id), "Assigned player sees the crew-only mission");
check(!(await claimer.call("GET", `/api/campaigns/${cid}/missions`)).some((m) => m.id === crewMission.id), "Unassigned member does not see it");
const missionAssignedEvt = (await player.call("GET", `/api/campaigns/${cid}/events?limit=10&characterId=${charId}`)).find((e) => e.type === "mission.assigned" && e.payload.missionId === crewMission.id);
check(Boolean(missionAssignedEvt), "mission.assigned notification logged for the assigned player");
console.log("    Player accepts or declines the offer; the DM is notified");
let objBefore = false;
try {
  await player.call("POST", `/api/campaigns/${cid}/missions/${crewMission.id}/objectives/o1`, { done: true });
} catch (e) {
  objBefore = e.status === 403;
}
check(objBefore, "Objectives are locked until the mission is accepted (403)");
let notMine = false;
try {
  await claimer.call("POST", `/api/campaigns/${cid}/missions/${crewMission.id}/respond`, { characterId: charId, response: "accepted" });
} catch (e) {
  notMine = e.status === 403 || e.status === 404;
}
check(notMine, "Another player cannot answer for Antonio");
let declined = await player.call("POST", `/api/campaigns/${cid}/missions/${crewMission.id}/respond`, { characterId: charId, response: "declined", note: "Too hot right now" });
check(declined.assignments.find((a) => a.characterId === charId)?.response === "declined", "Antonio declined with a note");
const dmEvents = await dm.call("GET", `/api/campaigns/${cid}/events?limit=10`);
check(dmEvents.some((e) => e.type === "mission.declined" && e.payload.missionId === crewMission.id && /Too hot/.test(e.summary)), "DM event log shows the decline with the reason");
check(!(await player.call("GET", `/api/campaigns/${cid}/events?limit=20`)).some((e) => e.type === "mission.declined" && e.payload.missionId === crewMission.id), "The answer is DM-visibility only");
const acceptedM = await player.call("POST", `/api/campaigns/${cid}/missions/${crewMission.id}/respond`, { characterId: charId, response: "accepted" });
check(acceptedM.assignments.find((a) => a.characterId === charId)?.response === "accepted", "Antonio changed his mind and accepted");
check((await dm.call("GET", `/api/campaigns/${cid}/events?limit=10`)).some((e) => e.type === "mission.accepted" && e.payload.missionId === crewMission.id), "DM notified of the acceptance");
const ticked = await player.call("POST", `/api/campaigns/${cid}/missions/${crewMission.id}/objectives/o1`, { done: true });
check(ticked.objectives[0].done === true, "Objectives unlock after accepting");
await dm.call("PUT", `/api/campaigns/${cid}/missions/${crewMission.id}`, { ...crewMission, status: "active" });
const statusEvt = (await player.call("GET", `/api/campaigns/${cid}/events?limit=10&characterId=${charId}`)).find((e) => e.type === "mission.status" && e.payload.missionId === crewMission.id);
check(Boolean(statusEvt), "Crew-only status change reaches the assigned player");
await dm.call("DELETE", `/api/campaigns/${cid}/missions/${crewMission.id}`);

console.log("    Encyclopedia: the DM publishes NPCs, locations and items; players read what is published");
for (const e of await dm.call("GET", `/api/campaigns/${cid}/encyclopedia`)) if (e.name.includes("(E2E)")) await dm.call("DELETE", `/api/campaigns/${cid}/encyclopedia/${e.id}`);
check((await status(() => player.call("POST", `/api/campaigns/${cid}/encyclopedia`, { kind: "npc", name: "Nope (E2E)", body: "" }))) === 403, "Players cannot write encyclopedia entries (403)");
const draftEntry = await dm.call("POST", `/api/campaigns/${cid}/encyclopedia`, { kind: "location", name: "Back Alley (E2E)", body: "Draft.", visibleToPlayers: false });
check(draftEntry.kind === "location" && draftEntry.visibleToPlayers === false, "DM created a hidden location entry");
check(!(await player.call("GET", `/api/campaigns/${cid}/encyclopedia`)).some((e) => e.id === draftEntry.id), "Players do not see hidden entries");
const npcEntry = await dm.call("POST", `/api/campaigns/${cid}/encyclopedia`, { kind: "npc", name: "Fixer Dax (E2E)", body: "Runs the Tier 2 clinic." });
check((await player.call("GET", `/api/campaigns/${cid}/encyclopedia`)).some((e) => e.id === npcEntry.id && e.kind === "npc"), "Players see published NPC entries");
const revealed = await dm.call("PUT", `/api/campaigns/${cid}/encyclopedia/${draftEntry.id}`, { ...draftEntry, visibleToPlayers: true });
check(revealed.visibleToPlayers && (await player.call("GET", `/api/campaigns/${cid}/encyclopedia`)).some((e) => e.id === draftEntry.id), "Revealing an entry shows it to players");
check((await status(() => dm.call("POST", `/api/campaigns/${cid}/encyclopedia`, { kind: "item", name: "Bad link (E2E)", body: "", refId: "not-a-thing" }))) === 422, "A link outside the campaign is refused (422)");
await dm.call("DELETE", `/api/campaigns/${cid}/encyclopedia/${draftEntry.id}`);
await dm.call("DELETE", `/api/campaigns/${cid}/encyclopedia/${npcEntry.id}`);
check(!(await dm.call("GET", `/api/campaigns/${cid}/encyclopedia`)).some((e) => e.name.includes("(E2E)")), "Encyclopedia cleaned up");

{
  const shop_factions = await player.call("GET", `/api/campaigns/${cid}/factions`);
  check(shop_factions.some((f) => f.key === "dogtown" && f.name === "Dogtown"), "Dogtown sits on the reputation board (added to campaigns seeded before it)");
}
console.log("    Shop: the NEOM catalog, district-taxed purchases, stock");
const shop_imported = await dm.call("POST", `/api/campaigns/${cid}/shop/import`, {});
check(shop_imported.items.created + shop_imported.items.updated >= 150 && shop_imported.plans.created + shop_imported.plans.updated >= 30, `Catalog shop_imported (${shop_imported.items.created} new / ${shop_imported.items.updated} refreshed items, ${shop_imported.plans.created + shop_imported.plans.updated} plans)`);
const shop_again = await dm.call("POST", `/api/campaigns/${cid}/shop/import`, {});
check(shop_again.items.created === 0 && shop_again.plans.created === 0, "Re-importing creates nothing new (idempotent)");
check((await status(() => player.call("POST", `/api/campaigns/${cid}/shop/import`, {}))) === 403, "Players cannot import the catalog (403)");
// Clear any plans left by an interrupted run so the district is Dogtown.
view = await player.call("GET", `/api/characters/${charId}`);
for (const p of view.plans) await dm.call("POST", `/api/campaigns/${cid}/plans/unsubscribe`, { characterId: charId, planId: p.planId });
let shopView = await player.call("GET", `/api/campaigns/${cid}/shop`);
const yipi = shopView.items.find((i) => i.name === "Yipi-9");
check(yipi && yipi.price === 1500 && yipi.category === "weapon" && yipi.meta.magazine === 6, `Yipi-9 listed at its sheet price, 1,500 ₭ (magazine ${yipi?.meta.magazine})`);
check(shopView.items.some((i) => i.category === "attachment") && shopView.items.some((i) => i.category === "ammo") && shopView.items.some((i) => i.category === "cyberware" && i.meta.shimmer === true), "Attachments, ammo and Shimmer fusions are on the shelves");
{
  const shop_riot = shopView.items.find((i) => i.name === "Riotbreaker Armor");
  check(shop_riot && shop_riot.category === "armor" && shop_riot.price === 4500 && shop_riot.equipmentSlot === "armor", "Armor catalogue is on the shelves (Riotbreaker Armor, 4,500 ₭, armor slot)");
  const shop_vest = shopView.items.find((i) => i.name === "Reinforced Kevlar Vest");
  const shop_jugg = shopView.items.find((i) => i.name === "Juggernaut Exoskeleton");
  check(shop_vest && shop_vest.effects.some((e) => e.kind === "modifier" && e.target === "ac" && e.op === "setBase" && e.value === 13 && e.dexCap === 2) && shop_jugg?.requirements.some((r) => r.kind === "attribute" && r.attribute === "str" && r.min === 15), "Armor carries its AC formula (vest: base 13, DEX max +2) and requirements (Juggernaut: STR 15)");
  const shop_c0 = (await player.call("GET", `/api/characters/${charId}`)).character.credits;
  if (shop_c0 < 2500) await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: 2500 - shop_c0 + 100, note: "e2e armor" });
  view = await player.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: shop_vest.id, quantity: 1 });
  const shop_vestInst = view.items.find((i) => i.definitionId === shop_vest.id);
  const shop_acBefore = view.derived.ac.value;
  const shop_prevArmor = view.items.find((i) => i.equippedSlot === "armor");
  const shop_dexMod = Math.floor((view.derived.attributes.dex.value - 10) / 2);
  view = await player.call("POST", `/api/characters/${charId}/items/${shop_vestInst.id}/action`, { action: "equip" });
  const shop_expectAc = 13 + Math.min(shop_dexMod, 2) + (view.derived.ac.value - (13 + Math.min(shop_dexMod, 2)) === view.character.acBonus ? view.character.acBonus : 0);
  check(view.items.find((i) => i.id === shop_vestInst.id).equippedSlot === "armor" && view.derived.ac.value === shop_expectAc && view.derived.ac.breakdown.some((b) => b.kind === "base" && b.value === 13), `Wearing the vest sets AC to 13 + DEX (max +2): ${shop_acBefore} → ${view.derived.ac.value}`);
  view = await player.call("POST", `/api/characters/${charId}/items/${shop_vestInst.id}/action`, { action: "unequip" });
  view = await player.call("POST", `/api/characters/${charId}/items/${shop_vestInst.id}/action`, { action: "sell" });
  check(!view.items.some((i) => i.id === shop_vestInst.id), `Sold the vest back (${view.items.filter((i) => i.definitionId === shop_vest.id).length} left)`);
  if (shop_prevArmor) view = await player.call("POST", `/api/characters/${charId}/items/${shop_prevArmor.id}/action`, { action: "equip" });
  check(view.derived.ac.value === shop_acBefore, `Old armor back on (${shop_prevArmor?.definition.name ?? "none"}): AC ${view.derived.ac.value} as before`);
}
const shimmerStrain = shopView.items.filter((i) => i.category === "cyberware" && i.meta.shimmer === true).map((i) => `${i.rarity}:${i.capacityCost}`);
check(shimmerStrain.every((x) => x === "uncommon:20" || x === "rare:40") && shopView.items.some((i) => i.name === "Combat Predictor" && i.capacityCost === 20), "Shimmer fusions cost twice the strain of a normal augment of their tier (uncommon 20, rare 40)");
const creditsAtShop = (await player.call("GET", `/api/characters/${charId}`)).character.credits;
if (creditsAtShop < 5000) await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: 5000 - creditsAtShop, note: "e2e float" });
const beforeBuy = (await player.call("GET", `/api/characters/${charId}`)).character.credits;
view = await player.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: yipi.id, quantity: 1 });
check(view.character.credits === beforeBuy - 1500 && view.items.some((i) => i.definitionId === yipi.id), `Bought a Yipi-9 for exactly 1,500 ₭: ${beforeBuy} → ${view.character.credits} ₭`);
check((await status(() => claimer.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: yipi.id, quantity: 1 }))) === 403, "Another player cannot shop for your character (403)");
const ammo9 = shopView.items.find((i) => i.name === "9mm magazine");
view = await player.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: ammo9.id, quantity: 3 });
const shop_stack = view.items.find((i) => i.definitionId === ammo9.id);
check(shop_stack && shop_stack.quantity >= 3, `Ammo stacks (${shop_stack?.quantity} × 9mm magazine)`);
const shop_dear = shopView.items.reduce((a, b) => (a.price > b.price ? a : b));
check((await status(() => player.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: shop_dear.id, quantity: 1 }))) === 422, `Cannot afford ${shop_dear.name} (422)`);
const shop_cheap = shopView.items.find((i) => i.name === "Red Dot Sight");
await dm.call("PUT", `/api/campaigns/${cid}/items/${shop_cheap.id}`, { ...shop_cheap, stock: 1 });
view = await player.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: shop_cheap.id, quantity: 1 });
check((await status(() => player.call("POST", `/api/campaigns/${cid}/shop/buy`, { characterId: charId, definitionId: shop_cheap.id, quantity: 1 }))) === 422, "Stock runs out (422 on the second Red Dot Sight)");
await dm.call("PUT", `/api/campaigns/${cid}/items/${shop_cheap.id}`, { ...shop_cheap, stock: null });

console.log("    Plans: subscriptions with effects, district tax, month-end billing");
const planList = await player.call("GET", `/api/campaigns/${cid}/plans`);
const isp = planList.find((p) => p.name === "Standard ISP");
const fiber = planList.find((p) => p.name === "Fiber Network");
const nfcFlat = planList.find((p) => p.name === "Small Apt NFC");
check(isp && fiber && nfcFlat, "Handbook plans are listed (Standard ISP, Fiber Network, Small Apt NFC)");
const hackingBefore = (await player.call("GET", `/api/characters/${charId}`)).derived.specialSkills.hacking.value;
view = await player.call("POST", `/api/campaigns/${cid}/plans/subscribe`, { characterId: charId, planId: isp.id });
check(view.plans.some((p) => p.planId === isp.id) && view.derived.specialSkills.hacking.value === hackingBefore + 1, `Standard ISP: Hacking ${hackingBefore} → ${view.derived.specialSkills.hacking.value}`);
view = await player.call("POST", `/api/campaigns/${cid}/plans/subscribe`, { characterId: charId, planId: fiber.id });
check(!view.plans.some((p) => p.planId === isp.id) && view.derived.specialSkills.hacking.value === hackingBefore + 2, "Fiber Network replaces the ISP (one connectivity plan at a time), Hacking +2");
// No housing yet: the player picks the district they are taxed in.
view = await player.call("POST", `/api/characters/${charId}/tax-district`, { district: "wca" });
check(view.character.taxDistrict === "wca", "Without housing the player registers in WCA for tax");
check((await status(() => player.call("POST", `/api/characters/${charId}/tax-district`, { district: "atlantis" }))) === 400, "Unknown districts are rejected (400)");
{
  const shop_wcaBill = (await dm.call("GET", `/api/campaigns/${cid}/plans/bill`)).find((b) => b.characterId === charId);
  check(shop_wcaBill.district === "wca" && shop_wcaBill.districtSource === "chosen" && shop_wcaBill.taxPercent === 25, "Bill preview taxes the chosen district: WCA 25%");
}
view = await player.call("POST", `/api/campaigns/${cid}/plans/subscribe`, { characterId: charId, planId: nfcFlat.id });
shopView = await player.call("GET", `/api/campaigns/${cid}/shop`);
check(view.plans.some((p) => p.planId === nfcFlat.id) && shopView.items.find((i) => i.id === yipi.id).price === 1500, "Housing never changes shop prices (Yipi-9 still 1,500 ₭ from NFC)");
check(typeof (await player.call("GET", `/api/characters/${charId}`)).character.salary === "number", "Characters carry a monthly salary (3,000 ₭ by default)");
check((await status(() => player.call("PATCH", `/api/characters/${charId}`, { salary: 9999 }))) === 403, "Players cannot set their own salary (403)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { salary: 4000 });
check(view.character.salary === 4000, "DM sets the monthly salary to 4,000 ₭");
await dm.call("PUT", `/api/campaigns/${cid}/items/${yipi.id}`, { ...yipi, maintenance: 40 });
const billPreview = await dm.call("GET", `/api/campaigns/${cid}/plans/bill`);
const myBill = billPreview.find((b) => b.characterId === charId);
check(myBill.maintenance.some((m) => m.name === "Yipi-9" && m.cost === 40), "DM-set upkeep on a weapon (40 ₭) is billed like cyberware upkeep");
check(!myBill.maintenance.some((m) => m.name === "9mm magazine"), "Items without upkeep cost nothing a month");
await dm.call("PUT", `/api/campaigns/${cid}/items/${yipi.id}`, { ...yipi, maintenance: null });
const shop_defaults = myBill.plans.filter((p) => p.defaulted);
check(shop_defaults.length === 2 && shop_defaults.some((p) => p.kind === "food" && p.name === "Noodles") && shop_defaults.some((p) => p.kind === "transport" && p.name === "Public Transport"), `Food and transport are not optional: ${shop_defaults.map((p) => p.name).join(" + ")} are billed by default`);
const expectedPlans = fiber.monthlyCost + nfcFlat.monthlyCost + shop_defaults.reduce((s, p) => s + p.cost, 0);
check(myBill && myBill.plans.reduce((s, p) => s + p.cost, 0) === expectedPlans && myBill.maintenance.length >= 1 && myBill.total === expectedPlans + myBill.maintenance.reduce((s, m) => s + m.cost, 0), `Bill preview: plans ${expectedPlans} + upkeep ${myBill?.maintenance.reduce((s, m) => s + m.cost, 0)} = ${myBill?.total} ₭`);
check((await status(() => player.call("POST", `/api/campaigns/${cid}/plans/unsubscribe`, { characterId: charId, planId: nfcFlat.id }))) === 422, "Housing is not optional: players cannot cancel it, only switch (422)");
check((await status(() => player.call("POST", `/api/campaigns/${cid}/plans/sponsor`, { characterId: charId, planId: nfcFlat.id, discountPercent: 100 }))) === 403, "Players cannot sponsor plans (403)");
view = await dm.call("POST", `/api/campaigns/${cid}/plans/sponsor`, { characterId: charId, planId: nfcFlat.id, discountPercent: 50, sponsor: "Arasaka" });
{
  const shop_sp = view.plans.find((p) => p.planId === nfcFlat.id);
  check(shop_sp.discountPercent === 50 && shop_sp.sponsor === "Arasaka" && shop_sp.monthlyDue === Math.round(nfcFlat.monthlyCost / 2), `Arasaka pays half the NFC flat: ${nfcFlat.monthlyCost} → ${shop_sp.monthlyDue} ₭ / month`);
  const shop_spBill = (await dm.call("GET", `/api/campaigns/${cid}/plans/bill`)).find((b) => b.characterId === charId);
  check(shop_spBill.plans.find((p) => p.planId === nfcFlat.id).cost === shop_sp.monthlyDue, "The bill collects the sponsored price");
  view = await dm.call("POST", `/api/campaigns/${cid}/plans/sponsor`, { characterId: charId, planId: nfcFlat.id, discountPercent: 0 });
  check(view.plans.find((p) => p.planId === nfcFlat.id).discountPercent === 0, "Sponsorship withdrawn: full price again");
}
check((await status(() => player.call("PATCH", `/api/characters/${charId}`, { savings: 9999 }))) === 403, "Players cannot set their savings outright (403)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { savings: 1234 });
check(view.character.savings === 1234, "DM sets the savings account to 1,234 ₭");
await dm.call("PATCH", `/api/characters/${charId}`, { savings: 0 });
check(myBill.district === "nfc" && myBill.taxPercent === 35 && myBill.salaryGross === 4000 && myBill.salaryNet === 2600 && myBill.balanceAfter === myBill.credits + 2600 - myBill.total, "Living in NFC taxes the salary 35%: 4,000 → 2,600 ₭ net");
check(myBill.districtSource === "housing", "Housing overrides the chosen district (NFC flat beats WCA registration)");
check((await status(() => player.call("POST", `/api/campaigns/${cid}/plans/bill`, {}))) === 403, "Only the DM turns the month (403)");
const creditsBeforeMonth = (await player.call("GET", `/api/characters/${charId}`)).character.credits;
if (creditsBeforeMonth + myBill.salaryNet < myBill.total) await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: myBill.total - myBill.salaryNet - creditsBeforeMonth + 100, note: "e2e rent" });
const shop_billed = await dm.call("POST", `/api/campaigns/${cid}/plans/bill`, { characterId: charId });
check(shop_billed.length === 1 && shop_billed[0].characterId === charId, "The DM can pay a single character's month");
const shop_mine = shop_billed[0];
view = await player.call("GET", `/api/characters/${charId}`);
check(shop_mine.paid === shop_mine.total && shop_mine.lapsed.length === 0 && view.character.credits === shop_mine.credits + shop_mine.salaryNet - shop_mine.total, `Month paid: +${shop_mine.salaryNet} salary, −${shop_mine.paid} bills → ${view.character.credits} ₭`);
check(shop_mine.defaulted.length === 2 && view.plans.length === 4 && view.plans.some((p) => p.plan.name === "Noodles"), `Default plans were enrolled (${shop_mine.defaulted.join(", ")}): ${view.plans.length} plans held`);
await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: -(view.character.credits), note: "e2e broke" });
await dm.call("PATCH", `/api/characters/${charId}`, { salary: 0 });
const shop_broke = (await dm.call("POST", `/api/campaigns/${cid}/plans/bill`, {})).find((b) => b.characterId === charId);
check(shop_broke.salaryNet === 0 && shop_broke.lapsed.length === 4 && shop_broke.maintenanceUnpaid === true, `With no salary and no kamas all four plans lapse and upkeep goes unpaid (${shop_broke.lapsed.join(", ")})`);
await dm.call("PATCH", `/api/characters/${charId}`, { salary: 3000 });
view = await player.call("GET", `/api/characters/${charId}`);
check(view.plans.length === 0 && view.conditions.some((c) => c.key === "cyberwareMalfunction"), "Lapsed plans are gone and the chrome malfunctions");
await dm.call("DELETE", `/api/characters/${charId}/conditions/cyberwareMalfunction`);
// Restore kamas and drop the purchases.
await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: creditsAtShop, note: "e2e restore" });
{
  view = await player.call("GET", `/api/characters/${charId}`);
  const owned = view.items.find((x) => x.definitionId === yipi.id);
  const cashBefore = view.character.credits;
  view = await player.call("POST", `/api/characters/${charId}/items/${owned.id}/action`, { action: "sell", quantity: 1 });
  check(view.character.credits === cashBefore + 750 && !view.items.some((x) => x.id === owned.id), `Selling the Yipi-9 pays half its price: +750 ₭ (${cashBefore} → ${view.character.credits})`);
  const boots = view.items.find((x) => x.installedSlot);
  check((await status(() => player.call("POST", `/api/characters/${charId}/items/${boots.id}/action`, { action: "sell" }))) === 422, "Installed cyberware cannot be sold (422)");
  await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { sellRatePercent: 25 } });
  const stackNow = view.items.find((x) => x.definitionId === ammo9.id);
  const cash2 = view.character.credits;
  view = await player.call("POST", `/api/characters/${charId}/items/${stackNow.id}/action`, { action: "sell", quantity: stackNow.quantity });
  check(view.character.credits === cash2 + Math.round(ammo9.price * 0.25) * stackNow.quantity && !view.items.some((x) => x.definitionId === ammo9.id), `DM sell rate 25%: ${stackNow.quantity} magazines → +${view.character.credits - cash2} ₭`);
  await dm.call("PATCH", `/api/campaigns/${cid}`, { settings: { sellRatePercent: 50 } });
  await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: -(view.character.credits - cashBefore), note: "e2e undo sales" });
}
for (const i of view.items.filter((x) => [yipi.id, ammo9.id, shop_cheap.id].includes(x.definitionId))) await dm.call("POST", `/api/characters/${charId}/items/${i.id}/action`, { action: "drop" });
view = await player.call("GET", `/api/characters/${charId}`);
check(!view.conditions.some((c) => c.key === "cyberwareMalfunction") && !view.items.some((x) => x.definitionId === yipi.id), "Shop run cleaned up (no malfunction, purchases dropped)");

console.log("    Mission kinds: main cannot be refused, personal is private, completed missions stay with the DM");
for (const m of await dm.call("GET", `/api/campaigns/${cid}/missions`)) if (m.name.includes("(E2E)")) await dm.call("DELETE", `/api/campaigns/${cid}/missions/${m.id}`);
const mainM = await dm.call("POST", `/api/campaigns/${cid}/missions`, { name: "Story Beat (E2E)", description: "Main line.", objectives: [{ id: "o1", text: "Go", done: false }], status: "active", assignedCharacterIds: [charId], visibleToPlayers: true });
check(mainM.kind === "main", "Missions default to the main kind");
check((await status(() => player.call("POST", `/api/campaigns/${cid}/missions/${mainM.id}/respond`, { characterId: charId, response: "declined", note: "nope" }))) === 422, "A main mission cannot be declined (422)");
const mainTicked = await player.call("POST", `/api/campaigns/${cid}/missions/${mainM.id}/objectives/o1`, { done: true });
check(mainTicked.objectives[0].done === true, "Main-mission objectives need no acceptance");
const personalM = await dm.call("POST", `/api/campaigns/${cid}/missions`, { name: "Old Debt (E2E)", description: "Personal.", objectives: [], status: "available", kind: "personal", assignedCharacterIds: [charId], visibleToPlayers: true, assignedOnly: false });
check(personalM.kind === "personal" && personalM.assignedOnly === true, "Personal missions are forced crew-only");
check((await player.call("GET", `/api/campaigns/${cid}/missions`)).some((m) => m.id === personalM.id), "The assigned character's player sees the personal mission");
check(!(await claimer.call("GET", `/api/campaigns/${cid}/missions`)).some((m) => m.id === personalM.id), "Other players do not");
check((await status(() => player.call("POST", `/api/campaigns/${cid}/missions/${personalM.id}/respond`, { characterId: charId, response: "declined" }))) === 422, "A personal mission cannot be declined (422)");
await dm.call("PUT", `/api/campaigns/${cid}/missions/${mainM.id}`, { ...mainM, status: "completed" });
check(!(await player.call("GET", `/api/campaigns/${cid}/missions`)).some((m) => m.id === mainM.id), "Completed missions disappear from the player list");
check((await dm.call("GET", `/api/campaigns/${cid}/missions`)).some((m) => m.id === mainM.id && m.status === "completed"), "The DM still sees the completed mission");
await dm.call("DELETE", `/api/campaigns/${cid}/missions/${mainM.id}`);
await dm.call("DELETE", `/api/campaigns/${cid}/missions/${personalM.id}`);
const seen = await player.call("POST", `/api/campaigns/${cid}/notifications/seen`, {});
check(typeof seen.seenAt === "string" && (await player.call("GET", `/api/campaigns/${cid}`)).notificationsSeenAt === seen.seenAt, "Notification seen marker stored per member");

console.log("    Reputation: seven default factions, DM-only changes, clamped and notified");
const factions = await player.call("GET", `/api/campaigns/${cid}/factions`);
check(factions.length >= 7 && factions[0].isCity && factions[0].name === "Neon City" && ["Sand Brokers", "Metal Wings", "Shimmer Bloods", "MS 1337", "Chromatic Dragons", "VVZ"].every((n) => factions.some((f) => f.name === n)), "Default factions present, Neon City first");
const repStart = await player.call("GET", `/api/characters/${charId}/reputation`);
check(repStart.length === factions.length && repStart.every((r) => typeof r.value === "number" && r.tier), "Every faction has a standing with a tier");
const brokers = factions.find((f) => f.name === "Sand Brokers");
let repDenied = false;
try {
  await player.call("POST", `/api/characters/${charId}/reputation`, { factionId: brokers.id, delta: 10 });
} catch (e) {
  repDenied = e.status === 403;
}
check(repDenied, "Players cannot change reputation (403)");
const before = repStart.find((r) => r.faction.id === brokers.id).value;
let rep = await dm.call("POST", `/api/characters/${charId}/reputation`, { factionId: brokers.id, delta: 30, reason: "Delivered the shard (E2E)" });
check(rep.find((r) => r.faction.id === brokers.id).value === Math.min(100, before + 30), `+30 with the Sand Brokers → ${rep.find((r) => r.faction.id === brokers.id).value}`);
let outOfRange = false;
try {
  await dm.call("POST", `/api/characters/${charId}/reputation`, { factionId: brokers.id, value: 500 });
} catch (e) {
  outOfRange = e.status === 400;
}
check(outOfRange, "Setting a value outside −100..100 is rejected (400)");
rep = await dm.call("POST", `/api/characters/${charId}/reputation`, { factionId: brokers.id, delta: 200 });
check(rep.find((r) => r.faction.id === brokers.id).value === 100 && rep.find((r) => r.faction.id === brokers.id).tier === "family", "A large nudge clamps to +100 (family)");
const repEvt = (await player.call("GET", `/api/campaigns/${cid}/events?limit=10&characterId=${charId}`)).find((e) => e.type === "reputation.changed" && /Delivered the shard/.test(e.summary));
check(Boolean(repEvt), "Player sees the reputation change with the reason in their log");
rep = await dm.call("POST", `/api/characters/${charId}/reputation`, { factionId: brokers.id, value: before });
check(rep.find((r) => r.faction.id === brokers.id).value === before, "Standing restored");

console.log("    Push subscriptions register per device");
const pushCfg = await player.call("GET", "/api/push/config");
check(typeof pushCfg.enabled === "boolean" && (pushCfg.enabled ? typeof pushCfg.publicKey === "string" : true), `Push config: enabled=${pushCfg.enabled}`);
const fakeEndpoint = `https://push.invalid/neom-e2e/${Date.now()}`;
const subRes = await player.call("POST", "/api/push/subscribe", { endpoint: fakeEndpoint, keys: { p256dh: "BPubKeyE2E", auth: "authE2E" } });
check(subRes.ok === true && subRes.devices >= 1, `Subscribed (${subRes.devices} device)`);
const unsubRes = await player.call("POST", "/api/push/unsubscribe", { endpoint: fakeEndpoint });
check(unsubRes.devices === subRes.devices - 1, "Unsubscribed");

console.log("    Cyberpsychosis bar (house rule): the threshold is the cyberware capacity");
const psy = view.derived.cyberpsychosis;
const expectedMax = view.derived.profBonus.value * view.character.level * 5 + (10 + view.derived.specialSkills.sanity.value) + (10 + view.derived.specialSkills.augmentation.value);
check(view.derived.capacity.value === expectedMax && psy.max === expectedMax, `Capacity = threshold = prof × level × 5 + passive Sanity + passive Augmentation = ${psy.max}`);
check(view.derived.cyberpsychosisMax === undefined, "No separate cyberpsychosisMax statistic any more");
check(psy.fromCyberware === view.derived.capacityUsed && psy.current === psy.points + psy.fromCyberware, `Current ${psy.current} = ${psy.points} pts + ${psy.fromCyberware} cyberware`);
check(psy.percent === Math.round((psy.current / psy.max) * 100), `Shown as ${psy.percent}%`);
let psyDenied = false;
try {
  await player.call("PATCH", `/api/characters/${charId}`, { cyberpsychosis: 3 });
} catch (e) {
  psyDenied = e.status === 403;
}
check(psyDenied, "Players cannot set cyberpsychosis points (403)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { cyberpsychosis: 5 });
check(view.derived.cyberpsychosis.points === 5 && view.derived.cyberpsychosis.current === psy.current + 5, `DM adds 5 points → ${view.derived.cyberpsychosis.percent}%`);
view = await dm.call("PATCH", `/api/characters/${charId}`, { cyberpsychosis: 0 });
check(view.derived.cyberpsychosis.points === 0, "Points reset");

console.log("    Inspiration stacks");
await dm.call("PATCH", `/api/characters/${charId}`, { inspiration: 0 });
view = await dm.call("PATCH", `/api/characters/${charId}`, { inspiration: 2 });
check(view.character.inspiration === 2, "Inspiration set to 2");
await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "inspiration", amount: 1, note: "e2e" });
view = await dm.call("GET", `/api/characters/${charId}`);
check(view.character.inspiration === 3, "DM grant adds one more (3)");
check((await status(() => dm.call("PATCH", `/api/characters/${charId}`, { inspiration: true }))) === 400, "A boolean is no longer accepted (400)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { inspiration: 0 });
check(view.character.inspiration === 0, "Inspiration cleared");

console.log("    DM adjusts exact skills from the sheet");
const athleticsBefore = view.derived.skills.athletics.value;
check((await status(() => player.call("PATCH", `/api/characters/${charId}`, { adjustments: { "skill.athletics": 2 } }))) === 403, "Players cannot set DM adjustments (403)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { adjustments: { "skill.athletics": 2, "special.hacking": -1 } });
check(view.derived.skills.athletics.value === athleticsBefore + 2 && view.character.adjustments["skill.athletics"] === 2, `Athletics ${athleticsBefore} → ${view.derived.skills.athletics.value}`);
check(view.derived.skills.athletics.breakdown.some((l) => l.label === "DM adjustment" && l.value === 2), "Breakdown shows the DM adjustment line");
check(view.derived.specialSkills.hacking.breakdown.some((l) => l.label === "DM adjustment" && l.value === -1), "Negative adjustment subtracts from Hacking");
check((await status(() => dm.call("PATCH", `/api/characters/${charId}`, { adjustments: { "nope.thing": 1 } }))) === 400, "Unknown stat target is rejected (400)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { adjustments: { "skill.athletics": 0, "special.hacking": 0 } });
check(view.derived.skills.athletics.value === athleticsBefore && !("skill.athletics" in view.character.adjustments), "Zero clears the adjustment");

console.log("    Abilities alter stats and skills; the DM grants them directly");
for (const a of await dm.call("GET", `/api/campaigns/${cid}/abilities`)) if (a.name.includes("(E2E)")) await dm.call("DELETE", `/api/campaigns/${cid}/abilities/${a.id}`);
const strBefore = view.derived.attributes.str.value;
const stealthBefore = view.derived.skills.stealth.value;
const bulk = await dm.call("POST", `/api/campaigns/${cid}/abilities`, {
  name: "Hydraulic Frame (E2E)",
  description: "Created by the smoke test.",
  actionType: "passive",
  passiveEffects: [
    { kind: "modifier", target: "attr.str", value: 2, op: "add", label: "Hydraulic Frame" },
    { kind: "modifier", target: "skill.stealth", value: -1, op: "add", label: "Hydraulic Frame" },
  ],
});
check(bulk.passiveEffects.length === 2, `Ability "${bulk.name}" carries passive effects`);
check((await status(() => player.call("PATCH", `/api/characters/${charId}`, { abilityIds: [bulk.id] }))) === 403, "Players cannot grant themselves abilities (403)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { abilityIds: [bulk.id] });
check(view.abilities.some((a) => a.id === bulk.id) && view.derived.grantedAbilityIds.includes(bulk.id), "Ability granted directly by the DM");
check(view.derived.attributes.str.value === strBefore + 2 && view.derived.skills.stealth.value === stealthBefore - 1, `STR ${strBefore} → ${view.derived.attributes.str.value}, Stealth ${stealthBefore} → ${view.derived.skills.stealth.value}`);
check(view.derived.attributes.str.breakdown.some((l) => l.label === "Hydraulic Frame"), "Breakdown names the ability");
check((await status(() => dm.call("PATCH", `/api/characters/${charId}`, { abilityIds: ["not-an-ability"] }))) === 400, "Unknown ability id is rejected (400)");
view = await dm.call("PATCH", `/api/characters/${charId}`, { abilityIds: [] });
check(view.derived.attributes.str.value === strBefore && !view.abilities.some((a) => a.id === bulk.id), "Revoking removes the effects");
await dm.call("DELETE", `/api/campaigns/${cid}/abilities/${bulk.id}`);
check((await status(() => dm.call("GET", `/api/campaigns/${cid}/skill-trees`))) === 404, "Skill trees are gone (404)");
check((await status(() => dm.call("POST", `/api/characters/${charId}/unlock`, { nodeId: "x" }))) === 404, "Node unlocks are gone (404)");

console.log("    Hit die follows the class");
const barb = await dm.call("POST", "/api/characters", { campaignId: cid, name: "Krak (E2E)", characterClass: "Barbarian // Street Brawler", attributes: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 } });
check(barb.character.hitDieSize === 12 && barb.character.hpMaxBase === 14, `Barbarian starts with d12 and ${barb.character.hpMaxBase} HP (12 + CON 2)`);
const wiz = await dm.call("POST", "/api/characters", { campaignId: cid, name: "Vex (E2E)", characterClass: "wizard", hitDieSize: 10 });
check(wiz.character.hitDieSize === 10, "An explicit hit die overrides the class default");
const custom = await dm.call("POST", "/api/characters", { campaignId: cid, name: "Zed (E2E)", characterClass: "Netrunner" });
check(custom.character.hitDieSize === 8, "Unknown classes fall back to d8");
console.log("    Sheet privacy: full sheets for the owner and the DM, glimpses for everyone else");
const privRoster = await player.call("GET", `/api/campaigns/${cid}/characters`);
const ownEntry = privRoster.find((c) => c.id === charId);
const foreignEntry = privRoster.find((c) => c.id === barb.character.id);
check(ownEntry?.visibility === "full" && typeof ownEntry.hpCurrent === "number" && typeof ownEntry.ac === "number", "Own roster entry is the full summary");
check(foreignEntry?.visibility === "glimpse" && foreignEntry.hpCurrent === undefined && foreignEntry.ac === undefined && ["healthy", "wounded", "critical", "down"].includes(foreignEntry.health), "Another player's character is a glimpse: name, owner, coarse health, no numbers");
check((await status(() => player.call("GET", `/api/characters/${barb.character.id}`))) === 403, "Players cannot open another player's full sheet (403)");
check((await status(() => player.call("GET", `/api/characters/${barb.character.id}/export`))) === 403, "Players cannot export another player's sheet (403)");
check((await status(() => player.call("GET", `/api/characters/${barb.character.id}/reputation`))) === 403, "Players cannot read another player's reputation (403)");
check((await dm.call("GET", `/api/campaigns/${cid}/characters`)).every((c) => c.visibility === "full"), "The DM roster is full for every character");
check((await dm.call("GET", `/api/characters/${barb.character.id}`)).character.name === "Krak (E2E)", "The DM opens any sheet");
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

console.log("    Capacity is enforced against the cyberpsychosis threshold (cyberware + DM points)");
const heavy = await dm.call("POST", `/api/campaigns/${cid}/items`, {
  name: "Overweight Reactor (E2E)",
  category: "cyberware",
  augmentationSlot: "torso",
  capacityCost: 2,
  effects: [],
});
await dm.call("POST", `/api/campaigns/${cid}/items/grant`, { characterId: charId, definitionId: heavy.id });
// Push the load to one below the threshold with DM points: a 2-point implant must then be refused.
view = await player.call("GET", `/api/characters/${charId}`);
await dm.call("PATCH", `/api/characters/${charId}`, { cyberpsychosis: view.derived.capacity.value - view.derived.capacityUsed - 1 });
view = await player.call("GET", `/api/characters/${charId}`);
const heavyInst = view.items.find((i) => i.definitionId === heavy.id);
let blocked = false;
try {
  await player.call("POST", `/api/characters/${charId}/items/${heavyInst.id}/action`, { action: "install" });
} catch (e) {
  blocked = e.status === 422 && /threshold/i.test(e.body?.error ?? "");
}
check(blocked, `Installing past the threshold is rejected with 422 (${view.derived.cyberpsychosis.current}+2 > ${view.derived.capacity.value})`);
await dm.call("PATCH", `/api/characters/${charId}`, { cyberpsychosis: 0 });

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
{
  const lockPlan = (await player.call("GET", `/api/campaigns/${cid}/plans`)).find((p) => p.name === "Public Network");
  check((await status(() => player.call("POST", `/api/campaigns/${cid}/plans/subscribe`, { characterId: charId, planId: lockPlan.id }))) === 403, "Players cannot change plans while the session is live (403)");
  const asDm = await dm.call("POST", `/api/campaigns/${cid}/plans/subscribe`, { characterId: charId, planId: lockPlan.id });
  check(asDm.plans.some((p) => p.planId === lockPlan.id), "The DM still can");
  await dm.call("POST", `/api/campaigns/${cid}/plans/unsubscribe`, { characterId: charId, planId: lockPlan.id });
  check((await status(() => player.call("POST", `/api/characters/${charId}/tax-district`, { district: "nfc" }))) === 403, "Players cannot change their tax district while the session is live (403)");
  await dm.call("POST", `/api/characters/${charId}/tax-district`, { district: null });
}
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
const events = await dm.call("GET", `/api/campaigns/${cid}/events?limit=200`);
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
{
  const pre = (await player.call("GET", `/api/characters/${charId}`)).character;
  if (pre.credits <= 0) await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: 300, note: "e2e savings" });
  const before = (await player.call("GET", `/api/characters/${charId}`)).character;
  await dm.call("POST", `/api/campaigns/${cid}/session/end`);
  const after = (await player.call("GET", `/api/characters/${charId}`)).character;
  check(after.credits === 0 && after.savings === before.savings + before.credits, `Session end banks the balance: ${before.credits} ₭ → savings ${after.savings} ₭`);
  check((await dm.call("GET", `/api/campaigns/${cid}/events?limit=20`)).some((e) => e.type === "savings.deposit" && e.characterId === charId), "savings.deposit logged");
  const back = await player.call("POST", `/api/characters/${charId}/savings`, { direction: "withdraw", amount: 100 });
  check(back.character.credits === 100 && back.character.savings === after.savings - 100, "The owner withdraws from savings (100 ₭ back in the balance)");
  const dep = await player.call("POST", `/api/characters/${charId}/savings`, { direction: "deposit", amount: 40 });
  check(dep.character.credits === 60 && dep.character.savings === after.savings - 60, "…and deposits again (40 ₭)");
  check((await status(() => player.call("POST", `/api/characters/${charId}/savings`, { direction: "withdraw", amount: 10_000_000 }))) === 422, "Cannot withdraw more than is saved (422)");
  check((await status(() => claimer.call("POST", `/api/characters/${charId}/savings`, { direction: "withdraw", amount: 1 }))) === 403, "Another player cannot touch your savings (403)");
  await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: -60, note: "e2e restore" });
  await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "savings", amount: 60, note: "e2e restore" });
  // Put it back so the demo keeps its cash on hand.
  await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "savings", amount: -before.credits, note: "e2e restore" });
  await dm.call("POST", `/api/campaigns/${cid}/dm/grant`, { characterId: charId, resource: "credits", amount: before.credits, note: "e2e restore" });
}
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
