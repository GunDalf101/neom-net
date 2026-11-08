# NEOM//NET

A cyberpunk tabletop RPG campaign operating system. Players run their characters through a futuristic HUD (**PLAYER//HUD**); the Dungeon Master runs the world from a live command center (**DM//CONTROL**). Deterministic rules automate the arithmetic; the DM keeps the final word.

> Status: **working Phase 1–4 core with Phase 5 basics**. See [What works / what is next](#what-works--what-is-next) before relying on a feature. See `docs/ARCHITECTURE.md` for the design.

## Stack

| Layer    | Tech                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 4, Zustand, TanStack Query, React Router, Lucide, React Flow (`@xyflow/react`) |
| Backend  | Node 20+, TypeScript, Express 4, Prisma 6, PostgreSQL 16, Socket.IO, Zod, JWT cookies         |
| Shared   | `@neom/shared`: domain constants, zod schemas, dice engine, derived-stat calculator, rules engine |

Monorepo with npm workspaces:

```
packages/shared     domain model, validation, mechanics, rules engine (+ vitest unit tests)
apps/server         Express API + Socket.IO + Prisma schema, migrations, seed, e2e script
apps/web            Vite React client (PLAYER//HUD and DM//CONTROL)
docs/ARCHITECTURE.md
```

## Local development

Prerequisites: Node 20+, npm 10+, Docker (for Postgres). No `.env` file is required in development; every variable has a dev default that matches `docker-compose.yml`. See `env.example` for the variables and set real values (especially `JWT_SECRET`) for anything beyond local play.

```bash
npm install                 # all workspaces
npm run db:up               # Postgres 16 in Docker on localhost:5433
npm run db:migrate          # apply Prisma migrations (creates the schema)
SEED_PASSWORD=choose-one npm run db:seed   # demo campaign + two accounts (password printed)
npm run dev                 # API on :4000 and Vite on :5173 (or the next free port)
```

Open the Vite URL printed in the terminal. Log in as `overseer` (DM) or `antonio` (player) with the seed password, or register a new account and join with invite code `NIGHTCITY`.

If you omit `SEED_PASSWORD`, the seed generates a random password and prints it once. Re-running the seed rotates it and recreates the demo campaign (other campaigns are untouched).

To create or reset any account from the command line (and optionally join it to a campaign):

```bash
npm run user:create -w @neom/server -- you@example.com yourpassword [handle] [INVITECODE]
```

Registration in the UI needs an email and a passphrase of at least 4 characters; the handle is optional and may not contain `@`.

### Scripts

| Command               | What it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `npm run dev`         | server (`tsx watch`) + web (`vite`) in parallel                     |
| `npm run typecheck`   | `tsc --noEmit` for every workspace                                  |
| `npm test`            | unit tests (shared: formulas, dice, derived stats, graph validation, engine) |
| `SEED_PASSWORD=… npm run test:e2e` | drives the full acceptance workflow against a running server (140 checks) |
| `npm run build`       | typecheck server + production build of the web app to `apps/web/dist` |
| `npm run db:studio`   | Prisma Studio                                                        |
| `npm run db:reset`    | drop, migrate and reseed the database (destructive)                  |

### Verifying the acceptance scenario

With the server running and the database seeded:

```bash
SEED_PASSWORD=<the seed password> npm run test:e2e
```

The script logs in as DM and player and exercises: campaign access, permission denials, creating an augmentation, granting it, installing it (stats recalculate, capacity enforced), starting a session and encounter, taking damage that fires **Emergency Reflex Protocol** (automatic) and queues **Adrenaline Overdrive** (assisted), cooldown enforcement, DM approval, DM override and revert, turn-based expiry with the expiry effect, server-side skill rolls, the event log, and persistence across a fresh login.

## Deploying to Render

`render.yaml` is a Render Blueprint: one Node web service (API, Socket.IO and the built web app on the same origin) plus a managed Postgres.

1. Push the repo to GitHub, then in Render choose **New → Blueprint** and select it. Render creates `neom-net` (web service) and `neom-net-db` (Postgres) and generates `JWT_SECRET`.
2. In the service's **Environment**, set `SEED_PASSWORD` to the password you want for the demo accounts (`overseer`, `antonio`). `SEED_ON_BOOT=true` seeds the demo campaign on the first boot only; set it to `false` afterwards if you do not want the check on every restart.
3. If Render assigns a different hostname, update `CORS_ORIGINS` to match it (the web app is same-origin, so this only affects external clients).
4. Build runs `npm ci --include=dev && npm run build:render` (Prisma client + Vite build). Start runs `prisma migrate deploy` and then the server, which serves `apps/web/dist` for every non-API path. Health check: `/api/health`.

Notes: the free Postgres plan expires after 30 days and free web services sleep when idle, which also drops Socket.IO connections until the next request. Render's `NODE_VERSION` is pinned in the blueprint. Secure cookies work behind Render's proxy because the server trusts one proxy hop.

## Demo content ("NEOM//NET — Night City Protocol")

- **Antonio Ettoro**, Human Rogue // Netrunner, level 1. STR 14 DEX 18 CON 14 INT 16 WIS 12 CHA 10, 12 HP, 9 m speed. Starts with a pistol, armored trench coat (AC 16 total), netrunner deck, Tactical Boots installed, stim patches, a trauma kit and a quest datashard.
- Catalog: 10 augmentations (one per body slot), weapons, armor, tools, consumables.
- Rules: **Emergency Reflex Protocol** (automatic, once per encounter, +2 Reflex for 3 turns, Mental Strain on expiry) and **Adrenaline Overdrive** (assisted).
- Six skill trees with 3 nodes each, one granting the **Overclock** ability.
- NPCs, a planned encounter ("Alley Ambush"), an active mission, lore and a private note.
- A custom condition (**Overheated**).

## Who can change what

By default a campaign runs in **DM-controlled mode** (`playersReadOnly: true`): players view their HUD, roll dice (including DM-requested checks) and keep journal notes, while every change to the sheet, HP, conditions, cyberware, progression, currency and missions is made by the DM from DM//CONTROL or from the character's HUD while logged in as DM. The server enforces this on every mutating endpoint, and players see a read-only banner. One exception is on by default (`playersManageInventory`): players still manage their own gear in read-only mode, meaning equip, unequip, use consumables, drop, rename and move. Installing or removing cyberware, setting quantities or charges, and currency stay with the DM. The DM can switch read-only off in Settings to let players edit their own characters, with the finer-grained flags (attributes, cyberware, levelling) applying in that mode. Currency (Kamas) is DM-only in both modes. Rules in DM//CONTROL → Settings apply the moment they are changed; there is no separate Apply button.

**House rules baked in.** Two standard skills are renamed for the setting: Animal Handling is **Hardware Handling** (WIS) and Arcana is **Reverse Engineering** (INT); the keys stay the same so existing sheets, rules and imports keep working. Currency is **Kamas** (₭). Every character has a **cyberpsychosis** bar shown as a percentage: the threshold is proficiency bonus × level × 5 + passive Sanity + passive Augmentation (passive = 10 + the skill's full modifier), and the current load is the installed cyberware capacity cost plus any points the DM assigns from the Combat panel or the dashboard HP tab (trauma, botched installs). The threshold opens a breakdown like every other derived number.

**Hit dice.** A new character's hit die follows its class (d12 barbarian; d10 fighter, paladin, ranger; d6 sorcerer, wizard; d8 for everything else, including custom classes), matched on the first word so "Rogue // Netrunner" is a rogue. The New character form and the Identity editor both expose the die, so the DM can override it for homebrew classes. Level 1 HP defaults to the die plus the CON modifier.

**Armor class without items.** The DM can set a character's unarmored base AC (default 10) and a flat adjustment from the Combat panel on the sheet or from the HP tab of the dashboard live controls. Both show up as their own lines in the AC breakdown, and gear, cyberware and conditions still add on top. Temporary changes are better done as a DM override (Override tab), which keeps the calculated value visible.

## Moving a campaign between databases

`npm run campaign:export-migration -w @neom/server -- "<campaign id or name>" [migrationName]` writes an idempotent Prisma data migration (`apps/server/prisma/migrations/<stamp>_<name>/migration.sql`) containing the campaign, its memberships, characters (with items, conditions, effects, overrides) and event log. Users are referenced by **email** and resolved when the migration runs: an existing account is reused, otherwise a claimable placeholder is created (empty password hash, cannot log in) and the first registration with that email takes it over, keeping the campaign attached. No password hashes are exported. Because every insert is `ON CONFLICT DO NOTHING`, re-running it (or applying it to the source database) changes nothing, and it ships to Render with the next deploy through `prisma migrate deploy`. The data becomes part of the repository history, so only use it for campaigns you are happy to commit; a per-campaign JSON export/import stays on the roadmap for anything sensitive.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

1. **check**: `npm ci`, Prisma client, `npm run typecheck`, `npm test`, production web build.
2. **golden** (after check): Postgres 16 service, `prisma migrate deploy`, a drift check that the migrations match `schema.prisma`, seed, production build served by the API on :4100, `npm run test:e2e` (API acceptance), then Chromium + `npm run test:ui` (UI golden rules G1–G11 on four viewports).

To run the same locally without touching your dev data, point everything at a throwaway database:

```bash
docker exec neom-net-db psql -U neom -d neom_net -c "CREATE DATABASE neom_net_ci"
export DATABASE_URL="postgresql://neom:neom_dev_password@localhost:5433/neom_net_ci?schema=public"
npm run db:deploy -w @neom/server && SEED_PASSWORD=pw npm run db:seed -w @neom/server
npm run build -w @neom/web && PORT=4100 npm run start -w @neom/server &
API_URL=http://localhost:4100 SEED_PASSWORD=pw npm run test:e2e
WEB_URL=http://localhost:4100 SEED_PASSWORD=pw npm run test:ui
```

## UI golden rules, PWA and notifications

- `docs/UI_GOLDEN_RULES.md` is the contract every screen is held to (eleven rules, a feature coverage matrix, and the manual checklist). `npm run test:ui` runs the automated part with Playwright on phone, tablet, laptop and desktop viewports as player and DM: no page or console errors, no horizontal overflow, page landmarks present, a player action reaching the DM dashboard live, phone tap targets, portrait upload, a shared link surviving sign-in, and the manifest (with link capturing) + service worker on a production build. Run `npm run pw:install -w @neom/web` once to fetch Chromium, then `SEED_PASSWORD=… WEB_URL=http://localhost:5174 npm run test:ui`.
- The web app is an installable PWA (manifest, icons, Workbox service worker with precached shell and cached fonts). Install it from the browser menu; on iPhone use Share → Add to Home Screen.
- Push notifications: each device opts in from the HUD gear menu or the DM sidebar ("Notifications"). Owners are notified when the DM or a rule changes their character (damage, healing, conditions, items, overrides, sheet edits) while they are away from the table, and always for roll requests and sheets sent to them; the DM is notified of rule approvals waiting while away. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in production (`npx web-push generate-vapid-keys`); development generates a throwaway pair in the OS temp dir.
- Send a sheet: the DM hands a character to a player from the live controls ("Send") or the HUD gear menu. Ownership moves, the player gets a toast and a push notification with a link, and the transfer is logged.
- Share a sheet by link: HUD gear menu → Share link (owner or DM). Anyone holding the link signs in (once per device) and lands on a read-only copy they can download or import into one of their own characters; campaign members land on the live HUD. "New link" replaces it, "Revoke" kills it. On Android (installed PWA) and desktop Chromium with link capturing, the link opens in the installed app; a browser tab on a device with the app installed shows "Open in app". iOS cannot route links into Home Screen apps.
- Sessions slide: a device that uses the app at least once every `SESSION_DAYS` (default 30) stays signed in. Deep links survive the login (and register) page.
- Portraits: tap the camera on the identity card (or drop an image) to upload. Images of any size are downscaled to 640 px WebP in the browser before upload. Owners may change their own portrait even in DM-controlled mode (DM Settings toggle); the DM can also upload NPC portraits.
- Chat: players have a direct line to the DM (chat icon or bell → Open chat) and the DM has a thread per player (sidebar "Chat with players"), with read receipts; Enter sends. Threads load 40 messages at a time and lazy-load older ones as you scroll up (`GET /campaigns/:id/messages?limit&before&peer`). The bell is a general inbox: chat messages plus everything that concerns you (missions assigned or updated, sheets handed over, DM roll requests, damage, items, overrides; for the DM, pending approvals and new members). Opening it marks messages read and stamps a per-member "seen" marker so the badge clears on every device.
- Mission offers: a player whose character is assigned sees "The DM offers you this mission" with **Accept** / **Decline** (optional reason). Objectives stay locked until accepted; declined crew are left out of the rewards; the answer can be changed until the mission closes. Each answer reaches the DM as a bell entry and a push, and the DM mission list shows ✓ / ✗ / … per crew member.
- Mission visibility: each mission is visible to all players, to the assigned crew only, or to the DM only. Assigned players are notified (bell + push) when they are added and when a crew-only mission changes status.
- Messages and the notification bell: the DM writes to one, several or all players from the dashboard ("Message players") or to a single sheet from the live controls Comms tab. Every recipient gets their own copy with read state, a toast when connected, a push when away, and a bell in the navbar (HUD and DM//CONTROL) with an unread badge; opening it marks the shown messages read. Players can still whisper the DM.
- Hand-off by link: the DM creates a one-time link from the live controls ("Hand-off link") or the HUD gear menu. The first player to open it signs in or registers, joins the campaign if needed, becomes the owner of the sheet, and the link stops working. The read-only share link (`/s/<token>`) remains for viewing or importing a copy.
- Change log: every mutation is an append-only campaign event. Sheet edits record each field before and after; the HUD **Log** tab and the DM event history show them with a diff table.

## What works / what is next

Working and verified end to end (API tests + build):

- Accounts, campaigns, invites, roles, campaign-isolated authorization on every endpoint.
- Characters: identity, portrait upload, attributes, 18 skills with proficiency/expertise, six cyberpunk skills with ranks, saving throws, HP/temp HP/damage types with resistance math, hit dice, rests, death saves, inspiration, conditions (builtin + custom, with durations), calculation breakdowns for every derived statistic.
- Items: definitions vs instances, grant, equip, install/replace/remove with requirement and capacity validation, consumables and charges, DM status changes (damaged/disabled suppress effects but keep capacity).
- Dice: CSPRNG, expressions, advantage/disadvantage (automatic from active effects), public/whisper/private visibility, DM roll requests with DCs, immutable roll log, death-save automation.
- Rules engine: declarative node graphs (15 triggers, 14 conditions, 12 effects, 5 flow nodes), validation (types, cycles, parameters, reachability), server-side deterministic execution with step limits and recursion guard, per-encounter/session/turn/rest cooldown scopes, timed temporary effects with expiry effects, automatic / assisted / manual modes, execution traces, simulation, versioning and publishing, DM overrides with originals preserved.
- Live play: authenticated Socket.IO rooms (campaign / DM / user), visibility-filtered pushes, presence, reconnect refetch, live sessions, encounters with initiative, turns, rounds, NPC HP (coarse for players), hidden combatants.
- Progression: skill trees with prerequisites, ranks, costs and requirements; abilities granted through effects; missions with objectives and one-time reward grants; journal with private / shared / DM / lore visibility.
- Export / import: the HUD gear menu (System → Sheet data) downloads a `*.neom.json` file with the full sheet plus item, condition and unlock lists; Import validates the file server-side and restores identity, attributes, skills, cyberpunk skills (rank + proficiency), saves, HP, speed and hit die (the DM also restores level, XP, credits and points). Gear, conditions and unlocks are campaign-specific and are not re-created. Reset to level 1 lives in the same menu behind a confirmation.
- Cyberpunk skills (Augmentation, Reflex, Adaptability, Hacking, Sanity, Aura) carry a rank (0..campaign max) and a proficiency tile that cycles none → proficient → expertise, exactly like standard skills. Expertise on cyberpunk skills is on by default; the DM can turn it off in Settings, which caps every cyberpunk skill at single proficiency.

Not yet implemented or simplified (honest list):

- Ability use limits (`usesPer`/`maxUses`) are stored and displayed but **not enforced** server-side.
- No tactical map. Encounter model is map-ready (participants with sort order) but has no positions.
- Attack rolls use a generic `prof + max(STR, DEX)` modifier; weapon-specific attack/damage automation is not wired.
- `cond.chance` and dice amounts in rules are random at execution time; simulation shows one sample.
- Rule expiry branches evaluate their conditions when the rule fires, not at expiry time.
- Player-to-DM messaging is whisper-only; no group chat.
- Portrait images are stored as (browser-compressed) data URLs in Postgres; no object storage. Item images remain URL-only.
- No rate limiting or CSRF token (cookies are `SameSite=Lax`, `httpOnly`; the dev proxy keeps everything same-origin). Add both before exposing publicly.
- The web bundle is one chunk (~1.4 MB minified) because the icon picker imports the whole Lucide set; split before production.

## Review note

Please read and test this code before committing or using it. AI-generated code should be treated as a draft: verify logic, check for hardcoded values, and confirm it meets your project's security standards. Known weaknesses are listed above.
