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

// ---- G10: manifest + service worker when served from a build
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/manifest.webmanifest`);
  if (res && res.ok()) {
    try {
      const m = JSON.parse(await res.text());
      if (!m.name || !Array.isArray(m.icons) || m.icons.length < 2 || m.display !== "standalone") fail(`[G10] manifest incomplete: ${JSON.stringify(m).slice(0, 120)}`);
      const sw = await page.goto(`${BASE}/sw.js`);
      if (!sw || !sw.ok()) fail("[G10] /sw.js is not served");
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
