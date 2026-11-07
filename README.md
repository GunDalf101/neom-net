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
| `SEED_PASSWORD=… npm run test:e2e` | drives the full acceptance workflow against a running server (47 checks) |
| `npm run build`       | typecheck server + production build of the web app to `apps/web/dist` |
| `npm run db:studio`   | Prisma Studio                                                        |
| `npm run db:reset`    | drop, migrate and reseed the database (destructive)                  |

### Verifying the acceptance scenario

With the server running and the database seeded:

```bash
SEED_PASSWORD=<the seed password> npm run test:e2e
```

The script logs in as DM and player and exercises: campaign access, permission denials, creating an augmentation, granting it, installing it (stats recalculate, capacity enforced), starting a session and encounter, taking damage that fires **Emergency Reflex Protocol** (automatic) and queues **Adrenaline Overdrive** (assisted), cooldown enforcement, DM approval, DM override and revert, turn-based expiry with the expiry effect, server-side skill rolls, the event log, and persistence across a fresh login.

## Demo content ("NEOM//NET — Night City Protocol")

- **Antonio Ettoro**, Human Rogue // Netrunner, level 1. STR 14 DEX 18 CON 14 INT 16 WIS 12 CHA 10, 12 HP, 9 m speed. Starts with a pistol, armored trench coat (AC 16 total), netrunner deck, Tactical Boots installed, stim patches, a trauma kit and a quest datashard.
- Catalog: 10 augmentations (one per body slot), weapons, armor, tools, consumables.
- Rules: **Emergency Reflex Protocol** (automatic, once per encounter, +2 Reflex for 3 turns, Mental Strain on expiry) and **Adrenaline Overdrive** (assisted).
- Six skill trees with 3 nodes each, one granting the **Overclock** ability.
- NPCs, a planned encounter ("Alley Ambush"), an active mission, lore and a private note.
- A custom condition (**Overheated**).

## Who can change what

By default a campaign runs in **DM-controlled mode** (`playersReadOnly: true`): players view their HUD, roll dice (including DM-requested checks) and keep journal notes, while every change to the sheet, HP, conditions, inventory, cyberware, progression, currency and missions is made by the DM from DM//CONTROL or from the character's HUD while logged in as DM. The server enforces this on every mutating endpoint, and players see a read-only banner. The DM can switch it off in Settings to let players edit their own characters, with the finer-grained flags (attributes, cyberware, levelling) applying in that mode. Currency is DM-only in both modes.

## What works / what is next

Working and verified end to end (API tests + build):

- Accounts, campaigns, invites, roles, campaign-isolated authorization on every endpoint.
- Characters: identity, portrait upload, attributes, 18 skills with proficiency/expertise, six cyberpunk skills with ranks, saving throws, HP/temp HP/damage types with resistance math, hit dice, rests, death saves, inspiration, conditions (builtin + custom, with durations), calculation breakdowns for every derived statistic.
- Items: definitions vs instances, grant, equip, install/replace/remove with requirement and capacity validation, consumables and charges, DM status changes (damaged/disabled suppress effects but keep capacity).
- Dice: CSPRNG, expressions, advantage/disadvantage (automatic from active effects), public/whisper/private visibility, DM roll requests with DCs, immutable roll log, death-save automation.
- Rules engine: declarative node graphs (15 triggers, 14 conditions, 12 effects, 5 flow nodes), validation (types, cycles, parameters, reachability), server-side deterministic execution with step limits and recursion guard, per-encounter/session/turn/rest cooldown scopes, timed temporary effects with expiry effects, automatic / assisted / manual modes, execution traces, simulation, versioning and publishing, DM overrides with originals preserved.
- Live play: authenticated Socket.IO rooms (campaign / DM / user), visibility-filtered pushes, presence, reconnect refetch, live sessions, encounters with initiative, turns, rounds, NPC HP (coarse for players), hidden combatants.
- Progression: skill trees with prerequisites, ranks, costs and requirements; abilities granted through effects; missions with objectives and one-time reward grants; journal with private / shared / DM / lore visibility.
- Export / import (sheet fields) and reset with confirmation.

Not yet implemented or simplified (honest list):

- Ability use limits (`usesPer`/`maxUses`) are stored and displayed but **not enforced** server-side.
- No tactical map. Encounter model is map-ready (participants with sort order) but has no positions.
- Attack rolls use a generic `prof + max(STR, DEX)` modifier; weapon-specific attack/damage automation is not wired.
- `cond.chance` and dice amounts in rules are random at execution time; simulation shows one sample.
- Rule expiry branches evaluate their conditions when the rule fires, not at expiry time.
- Player-to-DM messaging is whisper-only; no group chat.
- Portrait images are stored as data URLs in Postgres (1 MB cap); no object storage.
- No rate limiting or CSRF token (cookies are `SameSite=Lax`, `httpOnly`; the dev proxy keeps everything same-origin). Add both before exposing publicly.
- The web bundle is one chunk (~1.4 MB minified) because the icon picker imports the whole Lucide set; split before production.

## Review note

Please read and test this code before committing or using it. AI-generated code should be treated as a draft: verify logic, check for hardcoded values, and confirm it meets your project's security standards. Known weaknesses are listed above.
