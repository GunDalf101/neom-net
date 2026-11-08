#!/usr/bin/env node
/**
 * UI golden-rule checks (docs/UI_GOLDEN_RULES.md) — runs against a live server.
 *   WEB_URL=http://localhost:5174 SEED_PASSWORD=… node apps/web/scripts/ui-golden.mjs
 * Requires the demo seed and `npx playwright install chromium`.
 */
import { chromium } from "playwright";

const BASE = (process.env.WEB_URL ?? "http://localhost:5174").replace(/\/$/, "");
const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD) {
  console.error("SEED_PASSWORD is required");
  process.exit(2);
}
const VIEWPORTS = {
  phone: { width: 390, height: 844, mobile: true },
  tablet: { width: 820, height: 1180, mobile: true },
  laptop: { width: 1366, height: 768, mobile: false },
  desktop: { width: 1920, height: 1080, mobile: false },
};
const HUD_PAGES = [
  ["", ["Proficiency Bonus", "Attributes"]],
  ["inventory", ["Inventory", "Currency"]],
  ["cyberware", ["Installed systems", "Known cyberware catalog"]],
  ["skills", ["Progression points"]],
  ["journal", ["Campaign lore", "Private notes"]],
  ["missions", ["Active"]],
  ["log", ["Change log"]],
];
const DM_PAGES = [
  ["", ["Character roster", "Live control", "Recent events"]],
  ["workshop", ["Catalog", "Workshop"]],
  ["rules", ["Rules"]],
  ["encounters", ["Encounters"]],
  ["npcs", ["NPC"]],
  ["missions", ["Mission"]],
  ["events", ["Campaign event history"]],
  ["settings", ["Rules configuration", "Players are read-only"]],
];

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

const browser = await chromium.launch();

async function session(user, vp) {
  const v = VIEWPORTS[vp];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const tag = `${user}@${vp}`;
  page.on("pageerror", (e) => fail(`[${tag}] page error on ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.includes("401") && page.url().includes("/login")) return;
    fail(`[${tag}] console.error on ${page.url()}: ${t.slice(0, 200)}`);
  });
  await page.goto(`${BASE}/login`);
  await page.fill('input[autocomplete="username"]', user);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  return { page, ctx, tag };
}

async function checkPage(page, tag, name, landmarks) {
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [];
    if (doc.scrollWidth > doc.clientWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.right > doc.clientWidth + 2 && b.width > 20 && getComputedStyle(el).position !== "fixed") {
          wide.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`);
          if (wide.length > 3) break;
        }
      }
    }
    const small = [];
    for (const el of document.querySelectorAll("button, a.hud-btn, [role=button]")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const primary = el.classList.contains("hud-btn-solid") || el.getAttribute("type") === "submit";
      if (primary && b.height < 40) small.push(`${(el.textContent ?? "").trim().slice(0, 24) || el.getAttribute("aria-label") || el.tagName} ${Math.round(b.height)}px`);
    }
    return { overflow: doc.scrollWidth > doc.clientWidth + 1 ? `${doc.scrollWidth}>${doc.clientWidth}` : null, wide, small, text: document.body.innerText };
  });
  if (r.overflow) fail(`[${tag}] ${name}: horizontal overflow ${r.overflow} (${r.wide.join(" | ")})`);
  for (const l of landmarks) if (!r.text.toLowerCase().includes(l.toLowerCase())) fail(`[${tag}] ${name}: landmark "${l}" not found`);
  if (tag.endsWith("@phone") && r.small.length) warn(`[${tag}] ${name}: primary controls under 40px: ${r.small.slice(0, 4).join(", ")}`);
}

// ---- G5/G1/G6: every page, every viewport, both roles
let campaignId = "";
let hudUrl = "";
for (const vp of Object.keys(VIEWPORTS)) {
  const p = await session("antonio", vp);
  await p.page.click("text=Night City");
  await p.page.waitForURL(/\/c\//);
  campaignId = p.page.url().match(/\/c\/([^/]+)/)[1];
  await p.page.click("text=Enter HUD");
  await p.page.waitForURL(/\/hud\//);
  hudUrl = p.page.url().replace(/\/$/, "");
  for (const [sub, landmarks] of HUD_PAGES) {
    await p.page.goto(`${hudUrl}/${sub}`);
    await checkPage(p.page, p.tag, `hud/${sub || "character"}`, landmarks);
    if (sub === "") {
      // Phone/tablet show one column at a time: the combat block must be one tap away (G2, G5).
      const combatTab = p.page.locator(".seg button:has-text('Combat')").first();
      if (await combatTab.isVisible()) {
        await combatTab.click();
        await checkPage(p.page, p.tag, "hud/character (Combat tab)", ["Armor class", "Death saves"]);
        await p.page.locator(".seg button:has-text('Sheet')").first().click();
      } else {
        await checkPage(p.page, p.tag, "hud/character (combat column)", ["Armor class", "Death saves"]);
      }
    }
  }
  await p.ctx.close();

  const d = await session("overseer", vp);
  for (const [sub, landmarks] of DM_PAGES) {
    await d.page.goto(`${BASE}/c/${campaignId}/dm/${sub}`);
    await checkPage(d.page, d.tag, `dm/${sub || "dashboard"}`, landmarks);
  }
  await d.ctx.close();
}

// ---- G4: a player action reaches the DM dashboard without a reload
{
  const dm = await session("overseer", "laptop");
  await dm.page.goto(`${BASE}/c/${campaignId}/dm`);
  await dm.page.waitForSelector("text=Character roster");
  const pl = await session("antonio", "laptop");
  await pl.page.goto(`${hudUrl}/inventory`);
  await pl.page.waitForSelector("text=Armored Trench Coat");
  const rosterAc = async () => {
    const txt = await dm.page.locator("button:has-text('Antonio Ettoro')").first().innerText();
    return Number((txt.match(/AC\s+(\d+)/) ?? [])[1]);
  };
  const waitForAc = async (expected) => {
    const deadline = Date.now() + 4000;
    let ac = await rosterAc();
    while (ac !== expected && Date.now() < deadline) {
      await dm.page.waitForTimeout(200);
      ac = await rosterAc();
    }
    return ac;
  };
  await pl.page.locator("text=Armored Trench Coat").first().click();
  await pl.page.waitForTimeout(400);
  // The coat may be in either state if a previous run was interrupted; toggle it and expect ±2 AC, then restore.
  // text-is: `has-text` is case-insensitive and would also match the item tile's "EQUIPPED" badge.
  const unequip = pl.page.locator("button:text-is('Unequip')");
  const wasEquipped = (await unequip.count()) > 0;
  const acBefore = await rosterAc();
  const expected = wasEquipped ? acBefore - 2 : acBefore + 2;
  await (wasEquipped ? unequip : pl.page.locator("button:text-is('Equip')")).first().click();
  const acAfter = await waitForAc(expected);
  if (acAfter !== expected) fail(`[G4] DM dashboard shows AC ${acAfter} (expected ${expected}) 4s after the player ${wasEquipped ? "unequipped" : "equipped"} armor`);
  await pl.page.waitForTimeout(500);
  await pl.page.locator(wasEquipped ? "button:text-is('Equip')" : "button:text-is('Unequip')").first().click();
  await waitForAc(acBefore);
  await dm.ctx.close();
  await pl.ctx.close();
}

// ---- G11: a shared sheet link survives sign-in and lands on the sheet; portraits upload (G3/G6)
{
  const pl = await session("antonio", "laptop");
  const hudPath = new URL(hudUrl).pathname;
  const characterId = hudPath.split("/").pop();
  await pl.page.goto(`${hudUrl}/`);
  await pl.page.waitForSelector("text=Proficiency Bonus");

  // Portrait: the upload control is visible to the read-only owner, and an upload round-trips.
  const upload = pl.page.locator('[aria-label="Upload portrait"]').first();
  if (!(await upload.isVisible())) fail("[G11] owner does not see the portrait upload control on the HUD");
  else {
    const before = await pl.page.evaluate(async (id) => (await (await fetch(`/api/characters/${id}`)).json()).character.portraitUrl, characterId);
    // 64×64 opaque PNG generated in the page, so the test needs no fixture file.
    const png = await pl.page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      g.fillStyle = "#19e3ff";
      g.fillRect(0, 0, 64, 64);
      return c.toDataURL("image/png").split(",")[1];
    });
    await pl.page.locator('[data-testid="portrait-input"]').first().setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await pl.page.waitForTimeout(1200);
    const after = await pl.page.evaluate(async (id) => (await (await fetch(`/api/characters/${id}`)).json()).character.portraitUrl, characterId);
    if (!after || !after.startsWith("data:image/")) fail(`[G11] portrait upload did not persist (got ${String(after).slice(0, 30)})`);
    await pl.page.evaluate(async ([id, url]) => fetch(`/api/characters/${id}/portrait`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ portraitUrl: url }) }), [characterId, before]);
  }

  // Share link from the System menu (G3: visible to the owner, G6: answers with a link).
  await pl.page.click('button[aria-label="Menu"]');
  await pl.page.waitForSelector("text=Share link");
  const create = pl.page.locator("button:has-text('Create share link')");
  if (await create.count()) await create.first().click();
  await pl.page.waitForSelector('[data-testid="share-link"] input[aria-label="Share link"]', { timeout: 5000 }).catch(() => fail("[G11] share link field did not appear"));
  const link = await pl.page.locator('input[aria-label="Share link"]').first().inputValue().catch(() => "");
  const token = (link.match(/\/s\/([A-Za-z0-9_-]+)/) ?? [])[1];
  await pl.ctx.close();

  if (token) {
    for (const vp of ["phone", "desktop"]) {
      const v = VIEWPORTS[vp];
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile });
      const page = await ctx.newPage();
      const tag = `outsider@${vp}`;
      page.on("pageerror", (e) => fail(`[${tag}] page error on ${page.url()}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !(m.text().includes("401") && /\/(login|s\/)/.test(page.url()))) fail(`[${tag}] console.error on ${page.url()}: ${m.text().slice(0, 200)}`);
      });
      // A user outside the campaign: register once, then always log in through the shared link.
      await ctx.request.post(`${BASE}/api/auth/register`, { data: { email: "outsider-e2e@neom.local", username: "outsider-e2e", password: PASSWORD } });
      await ctx.clearCookies();
      await page.goto(`${BASE}/s/${token}`);
      await page.waitForURL(/\/login/, { timeout: 10000 });
      if (!(await page.locator('[data-testid="shared-login-hint"]').isVisible())) fail(`[${tag}] login page does not explain the shared link`);
      await page.fill('input[autocomplete="username"]', "outsider-e2e@neom.local");
      await page.fill('input[type="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => u.pathname === `/s/${token}`, { timeout: 10000 }).catch(() => fail(`[${tag}] after sign-in landed on ${page.url()} instead of the shared sheet`));
      await checkPage(page, tag, "shared sheet", ["Shared · read-only", "Antonio Ettoro", "Attributes", "Take a copy"]);
      // Session persists: a fresh tab in the same context opens the link without logging in again.
      const again = await ctx.newPage();
      await again.goto(`${BASE}/s/${token}`);
      await again.waitForSelector('[data-testid="shared-sheet"]', { timeout: 8000 }).catch(() => fail(`[${tag}] signed-in user was sent to ${again.url()} instead of the sheet`));
      await ctx.close();
    }
    // Members following the same link land on the live HUD.
    const m = await session("antonio", "phone");
    await m.page.goto(`${BASE}/s/${token}`);
    await m.page.waitForURL(/\/hud\//, { timeout: 8000 }).catch(() => fail(`[G11] member following the link landed on ${m.page.url()} instead of the HUD`));
    await m.page.evaluate(async (id) => fetch(`/api/characters/${id}/share`, { method: "DELETE" }), characterId);
    await m.ctx.close();
  } else fail("[G11] no share token produced");
}

// ---- G10: manifest + service worker when served from a build
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/manifest.webmanifest`);
  if (res && res.ok()) {
    try {
      const m = JSON.parse(await res.text());
      if (!m.name || !Array.isArray(m.icons) || m.icons.length < 2 || m.display !== "standalone") fail(`[G10] manifest incomplete: ${JSON.stringify(m).slice(0, 120)}`);
      // Links (shared sheets, notifications) open in the installed app where the platform allows it.
      const sw = await page.goto(`${BASE}/sw.js`);
      // The dev server answers /sw.js with index.html (SPA fallback), so require a JavaScript response.
      const productionBuild = Boolean(sw && sw.ok() && /javascript/.test(sw.headers()["content-type"] ?? ""));
      const linkCapture = m.handle_links === "preferred" && Boolean(m.launch_handler);
      // The Vite dev server keeps the manifest it generated at start-up, so only a built artefact is held to this.
      if (!linkCapture) (productionBuild ? fail : warn)("[G10] manifest does not ask for link capturing (handle_links / launch_handler)" + (productionBuild ? "" : " — dev server manifest may be stale; restart `npm run dev`"));
      if (m.scope !== "/") fail(`[G10] manifest scope ${m.scope} does not cover /s/ share links`);
      if (!productionBuild) warn("[G10] /sw.js not served (dev server) — service worker checks skipped");
    } catch (e) {
      fail(`[G10] manifest is not valid JSON: ${e.message}`);
    }
  } else {
    warn("[G10] manifest not served by this target (dev server without PWA dev mode) — skipped");
  }
  await ctx.close();
}

await browser.close();
for (const w of warnings) console.log("WARN ", w);
for (const f of failures) console.log("FAIL ", f);
console.log(`\nGolden rules: ${failures.length === 0 ? "PASS" : "FAIL"} (${failures.length} failures, ${warnings.length} warnings) against ${BASE}`);
process.exit(failures.length ? 1 : 0);
