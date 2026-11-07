# NEOM//NET — UI Golden Rules

These rules are the contract every screen in PLAYER//HUD and DM//CONTROL is held to. They are
checked automatically by `npm run test:ui` (`apps/web/scripts/ui-golden.mjs`) on four viewports
and reviewed by hand with the checklist at the end. A change that breaks a rule is a bug, not a style
preference.

Inspiration, and what we took from each:

| System | What it does well | Rule it informed |
| --- | --- | --- |
| D&D Beyond | One sheet, tabs for depth, every number tappable for its math | G1, G2, G6 |
| Roll20 | Shared roll log, everyone sees the same table state instantly | G4, G7 |
| Foundry VTT | GM owns the truth; permissions are explicit, not implied | G3, G8 |
| Cyberpunk RED | Humanity / cyberware pressure made visible as capacity | G2, G5 |
| Pathbuilder / Fight Club | Mobile first: one column, thumb-sized controls | G5, G9 |

## The rules

**G1 — One source of truth, explained.** Every derived number (AC, saves, skills, cyberpunk skills,
speed, capacity, max HP) comes from `computeDerivedStats` and opens a breakdown that lists every
line that produced it: base, attribute, proficiency, each item, condition, rule effect and DM
adjustment. No screen recomputes a stat locally.

**G2 — Glanceable combat block.** HP, AC, initiative, speed, hit dice, death saves and conditions sit
together and are readable at arm's length (numbers ≥ 1.1rem, labels ≥ 0.68rem). Temporary effects
and overrides are visually distinct (amber) from calculated values.

**G3 — Permission is visible before the click.** A control that the viewer may not use is disabled
with a reason in its tooltip, or hidden with a banner that says who can do it ("Read-only sheet —
the Dungeon Master applies all changes"). There are no buttons that fail silently with a 403.

**G4 — Real time means no refresh.** Any change made by a player, the DM or a rule appears on every
connected screen within one socket round trip: the HUD, the DM dashboard roster, the live controls,
the event log and the roll log. Reconnecting refetches everything for the campaign.

**G5 — Four viewports, no horizontal scroll.** Phone (390×844), tablet (820×1180), laptop (1366×768)
and desktop (1920×1080). The page body never scrolls sideways; only tables, the cyberware figure,
diagrams and code blocks may pan inside their own container. Responsive grids always declare a
single-column base.

**G6 — Every action answers.** Mutations show pending state, success or an error toast with the
server's message. Inputs commit on Enter or blur and show the committed value immediately.

**G7 — Everything is logged.** Every mutation writes an append-only campaign event with actor, time
and visibility; sheet edits carry field-level before/after values. The HUD Log tab and the DM event
history render the same rows.

**G8 — DM controls are one layer away.** From the dashboard the DM can reach HP, status, grants,
overrides, cyberware, comms and "send sheet" for any character without leaving the page, and can open
the character's HUD in one click.

**G9 — Thumb-sized on phones.** Primary actions are at least 40px tall on the phone viewport;
secondary chips at least 28px. Nothing important hides behind hover.

**G10 — Installable and reachable.** The app ships a web manifest and a service worker, installs as a
PWA on phone and desktop, and can deliver push notifications for status changes, roll requests and
sheets sent by the DM. The manifest asks for link capturing (`handle_links: "preferred"`,
`launch_handler`), so links into the app open in the installed PWA where the platform allows it, and a
browser tab on a device with the app installed offers "Open in app".

**G11 — Links land where they point.** A deep link (shared sheet `/s/<token>`, notification URL)
survives sign-in: a signed-out visitor is sent to login with a note saying why, and lands on the link
after authenticating, including via the register page. Sessions slide, so a device that keeps using
the app stays signed in and later links open directly. Members following a share link land on the
live HUD; everyone else sees a read-only copy they can download or import.

## Feature coverage matrix

| Backend capability | Surfaced in | Golden checks |
| --- | --- | --- |
| Characters, attributes, skills, saves, cyberpunk skills (rank + proficiency/expertise) | HUD Character · Skills tab | G1, G2, G3, G5 |
| HP, temp HP, damage types, hit dice, rests, death saves, inspiration | HUD Combat panel · DM HP tab | G2, G4, G6 |
| Conditions (builtin + custom, durations, exhaustion levels) | HUD Combat panel · DM Status tab | G2, G4 |
| Base AC + DM adjustment | HUD Combat panel (DM) · DM HP tab | G1, G3 |
| Items: definitions, instances, equip, install, use, drop, rename | HUD Inventory · Cyberware · DM Workshop · Grant | G3, G4, G6 |
| Currency (DM only) | HUD Inventory currency panel · DM Grant | G3 |
| Dice: CSPRNG, adv/dis, visibility, DM roll requests | HUD Dice panel · Skill check bar · roll history | G4, G6 |
| Rules engine: graphs, modes, cooldowns, timed effects, pending approvals | DM Rules editor · dashboard "Awaiting your ruling" | G6, G7, G8 |
| DM overrides | DM Override tab · HUD Status tab | G1, G2 |
| Encounters, initiative, turns | DM Encounters · dashboard tile | G4, G8 |
| Progression: skill trees, abilities, missions, journal | HUD Skills · Missions · Journal · DM Missions & lore | G5, G7 |
| Export / import / reset | HUD System menu | G3, G6 |
| Ownership transfer ("send sheet") | HUD System menu (DM) · DM live controls | G4, G7, G10 |
| Share link (create, copy/share, rotate, revoke) and shared read-only sheet | HUD System menu (owner, DM) · `/s/:token` | G3, G5, G7, G11 |
| Portrait upload (resized in the browser; owners even when read-only, DM setting) | HUD identity card · Identity editor · New character · DM NPCs · DM Settings | G3, G6 |
| Event log with field diffs | HUD Log tab · DM Event log · dashboard recent events | G7 |
| Push notifications, PWA install | HUD System menu · DM sidebar · manifest + service worker | G10 |
| DM-controlled mode, player-managed inventory, settings | DM Settings · read-only banner | G3 |

## Automated checks (`npm run test:ui`)

For each of the four viewports, logged in as a player and as the DM, the script visits every route
and fails on:

1. any uncaught page error or `console.error` (the pre-login 401 on `/auth/me` is the only exception),
2. horizontal overflow of the document (G5),
3. a missing landmark on a page (each route lists the text that proves it rendered),
4. a player action that does not reach a second, DM session within three seconds (G4),
5. a primary button under 40px tall on the phone viewport (G9, reported as warnings with the element),
6. a missing or invalid `manifest.webmanifest`, or one without link capturing, when the target serves a production build (G10),
7. a portrait upload by the read-only owner that does not persist (G3, G6),
8. a share link that does not survive sign-in for a non-member on phone and desktop, does not open
   directly once signed in, or does not send a member to the live HUD (G11).

Run it against the dev server (`WEB_URL=http://localhost:5174`) or a production build
(`WEB_URL=http://localhost:4100`); `SEED_PASSWORD` must match the seeded accounts. Browser binaries:
`npx playwright install chromium` once per machine.

## Manual review checklist

- Open a breakdown for AC, a skill, a cyberpunk skill and max HP: every line names its source.
- As a read-only player: equip and unequip an item, try to install cyberware (disabled with reason).
- As DM: damage a player from the dashboard and watch the HUD in another window update.
- Phone: Character → Sheet / Cyberware / Combat switcher; Inventory list and detail; Log tab.
- Install the PWA, enable notifications, press Test, then background the app and have the DM apply
  a condition.
- Create a share link, send it through a chat app to a phone with the PWA installed: Android opens
  it in the app; iOS opens Safari (Home Screen apps cannot capture links there).
- Upload a full-size phone photo as a portrait: it appears within a second or two and stays sharp.
