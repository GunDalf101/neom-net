# NEOM//NET — Architecture

## 1. Principles

1. **The server is authoritative.** Every mechanical change (HP, items, installs, unlocks, overrides, rolls) is validated and committed server-side. The client recalculates derived stats locally only to render; it never persists a computed number.
2. **One effect system.** Items, cyberware, conditions, skill-tree nodes, abilities, rule outputs and DM temporary effects all emit the same typed `PassiveEffect` / `InstantEffect` objects (`packages/shared/src/rules/effects.ts`). The derived-stat calculator does not know what an "item" is; it only sees effect sources.
3. **Definitions ≠ instances ≠ state ≠ events.** `ItemDefinition` describes; `ItemInstance` is owned and tracks charges/status; `Character` holds current state; `CampaignEvent` is an append-only log. Reversals write compensating events; nothing is deleted from history.
4. **Explainable numbers.** Every derived statistic carries a `breakdown` of lines (base, attribute, proficiency, rank, modifier, suppressed, override) so both UIs can show where a value came from.
5. **DM authority.** `DMOverride` rows replace a calculated value without touching base data, record the original, can expire by turns, and are shown as overridden everywhere.

## 2. Repository layout

```
packages/shared/src
  constants.ts            attributes, skills, slots, conditions, damage types, XP table
  mechanics/formulas.ts   modifier, proficiency, skill & special skill formulas, XP↔level
  mechanics/dice.ts       expression parser, CSPRNG rejection sampling, advantage, keep-highest
  mechanics/derived.ts    CharacterSnapshot → DerivedStats with breakdowns; damage application
  rules/effects.ts        PassiveEffect, InstantEffect, Requirement schemas (zod) + describers
  rules/graph.ts          node catalog (typed handles + param schemas), RuleGraph schema, validator, preview
  rules/engine.ts         deterministic interpreter → actions + trace
  rules/requirements.ts   requirement checker shared by server and UI previews
  schemas/api.ts          every request body schema; types for client and server
  types/dto.ts            response DTOs and socket event map

apps/server/src
  app.ts / index.ts       express app factory, HTTP + Socket.IO bootstrap
  auth/auth.ts            bcrypt, JWT (HS256, iss/aud/exp), httpOnly cookie, attach/require middleware
  realtime/io.ts          socket auth from cookie, rooms (campaign / dm / user), presence, emit helpers
  services/access.ts      membership + role checks, settings merge, character access helpers
  services/characters.ts  load → snapshot → derived → view; HP actions; conditions; turn ticking; export/import/reset
  services/items.ts       definitions, grants, equip/install/use/drop/status (validation + triggers)
  services/rules.ts       rule CRUD/publish/versions/simulate; dispatchTrigger; applyEngineActions; pending approvals
  services/dice.ts        server-side modifiers, auto advantage, visibility, roll requests, death saves
  services/overrides.ts   create/revoke with original value capture
  services/encounters.ts  participants, initiative, turn/round advancement (ticks durations, fires turn triggers)
  services/progression.ts skill trees, unlocks (transactional point spend), abilities
  services/story.ts       NPCs, missions (+ one-time reward grant), journal visibility
  services/dm.ts          dashboard aggregate, grants, messages, roll requests
  services/events.ts      append-only event log + visibility-aware broadcast
  services/campaigns.ts   campaigns, invites, live sessions
  routes/*                thin routers: parse with zod → call service → json
prisma/schema.prisma      normalized schema (see §4); prisma/seed.ts demo campaign
scripts/smoke-e2e.mjs     acceptance workflow (47 checks)

apps/web/src
  api/client.ts, api/hooks.ts     fetch wrapper + TanStack Query hooks (query keys per resource)
  realtime/socket.ts              joins campaign room; maps pushes to cache invalidation / prepend
  store/ui.ts                     zustand: toasts, mobile tab, roll mode/visibility, last character
  components/ui                   HUD primitives (Panel, Button, Modal, Drawer, Bar, Toggle, Badge, Toasts)
  components/StatBreakdown.tsx    click-to-inspect calculation popover
  components/hud/*                identity, attributes/skills, combat, conditions, dice, cyberware figure + drawer
  components/editors/*            form editors for effects, instant effects, requirements
  components/dm/LiveControls.tsx  DM per-character controls (HP, status, grant, override, cyberware, comms)
  components/dm/RuleEditor.tsx    React Flow node editor with typed handles, inspector, validation, preview
  pages/hud/*                     Character, Inventory, Cyberware, Skills, Journal, Missions (+ HudShell)
  pages/dm/*                      Dashboard, Workshop, Rules, Encounters, NPCs, Missions & lore, Events, Settings
```

## 3. Derived statistics

`buildSnapshot(fullCharacter)` collects **effect sources**:

| Source            | Active when                          | Notes                                   |
| ----------------- | ------------------------------------ | --------------------------------------- |
| equipped item     | `status = equipped`                  | definition effects + instance custom effects |
| installed cyberware | `status = installed`               | damaged/disabled → inactive but still consumes capacity |
| condition         | always                               | definition effects (may be empty = narrative only) |
| active effect     | always                               | rule/ability/DM temporary bundles with optional turn counters |
| skill-tree unlock | always                               | effects applied once **per rank**        |

`computeDerivedStats` then composes each target in a fixed order: attribute scores → modifiers → proficiency bonus → saves → skills → special skills → AC / initiative / speed / max HP / capacity → roll flags, resistances, senses, traits, granted abilities. Composition rules per target:

1. base lines, optionally replaced by the highest `setBase` modifier (originals kept as *suppressed*);
2. additive modifiers, de-duplicated by `stackGroup` (highest wins, losers shown as suppressed);
3. `min` floors;
4. DM override (value replaced, original preserved in `override.original`).

Homebrew combat formulas (illustrative, not RAW): `AC = 10 + DEX mod + modifiers`, `initiative = DEX mod + modifiers`, `speed = base (9 m) + modifiers`, `special = attr mod + rank + prof × multiplier`, special ranks clamped to `settings.specialMaxRank`.

## 4. Data model (Prisma)

Accounts & access: `User`, `Campaign` (settings JSON validated by `CampaignSettingsSchema`), `CampaignMembership` (DM | PLAYER), `LiveSession`.

Definitions: `ItemDefinition`, `ConditionDefinition` (`campaignId = null` ⇒ builtin, campaign keys shadow builtins), `RuleDefinition` + `RuleVersion`, `SkillTreeDefinition` + `SkillTreeNode`, `AbilityDefinition`, `NpcDefinition`, `Mission`.

Instances & state: `Character` (sheet JSON columns `attributes`, `saveProficiencies`, `skills`, `specialSkills` are always read/written together and validated by zod; `version` is an optimistic-concurrency token), `ItemInstance`, `CharacterCondition`, `ActiveEffect`, `DMOverride`, `CharacterUnlock`, `RuleUsage`, `Encounter` + `EncounterParticipant`, `MissionAssignment`, `RollRequest`, `PendingAction`.

Events: `CampaignEvent` (append-only, `reversesEventId` for compensations), `DiceRoll` (immutable), `RuleTrace`, `Message`, `JournalEntry`.

Compound operations (grant, install/replace, unlock, override, mission completion, tree save) run in Prisma interactive transactions. Rule side-effects run after the originating transaction commits, each as its own transaction, so a failed rule never rolls back the player's action; the trace records what happened.

## 5. Rules engine

**Representation.** A rule is a JSON graph `{ version: 1, nodes: [{ id, type, params, position }], edges: [{ source, sourceHandle, target, targetHandle }] }`. Node types come from `NODE_CATALOG`; each declares typed handles (`flow` for execution order, `bool` for condition values) and a strict zod params schema. Both the form editors and the React Flow canvas produce this same shape.

**Validation** (`validateRuleGraph`): exactly one trigger, known types, params parse, handle existence and type match, one outgoing edge per flow output (fan out through `flow.sequence`), exactly one incoming edge per bool input, no flow or bool cycles, reachability warnings, and a warning when a passive effect has no `flow.duration` upstream. Max 60 nodes / 120 edges.

**Execution** (`executeRule`): the trigger is matched against the event (type plus optional filters; HP-threshold triggers match on *crossing*). Execution walks flow edges depth-first with a 200-step budget. Conditions evaluate against a `RuleCharacterState` (HP, effective attributes, special ranks, equipped/installed items, conditions, resources) and route `true`/`false`. `flow.duration` collects downstream passive effects into one `temporaryEffect` with its `onExpiry` branch collected as instant effects. `flow.cooldown` checks usage counters keyed by `${nodeId}:${scope}` and emits a `cooldownUse` action. `flow.repeat` is bounded at 5. The result is `{ actions, trace }`; nothing is mutated.

**Dispatch** (`dispatchTrigger` in `services/rules.ts`): candidate rules = enabled, *published*, campaign-scoped rules + attached rules referenced by the character's active sources. Usage counters are scoped by encounter / session / turn / rest / ever. Per rule, the automation mode (rule override → campaign default) decides: **automatic** applies actions, **assisted** stores a `PendingAction` for the DM, **manual** logs a DM-visible event. Every evaluation writes a `RuleTrace`. Recursion depth is capped at 3 (damage → rule → damage → rule …).

**Applying actions**: instant effects reuse the same service functions a human would (`applyHpAction`, `applyCondition`, `setItemStatus`, …) so events, sockets and nested triggers behave identically. Temporary bundles become `ActiveEffect` rows that tick down at the start of the character's turn in an active encounter; untimed bundles are cleared when the encounter ends or by the DM.

**Safety**: no user code is ever evaluated; graphs are data interpreted by a closed set of handlers. Limits: node/edge counts, step budget, repeat bound, recursion depth, dice sizes.

## 6. Real-time

Socket.IO authenticates from the same httpOnly cookie as HTTP. A client emits `campaign.join`; the server verifies membership and joins `campaign:<id>` (+ `campaign:<id>:dm` for the DM). Pushes are *notifications*, not state: `character.updated { characterId }` makes clients refetch the authoritative view, which keeps visibility filtering on the HTTP path. Rolls and events are pushed with their payload but routed by visibility (public → campaign room, DM-only → DM room, owner → DM room + owner's user room). On reconnect the client re-joins and invalidates every query tagged with the campaign id.

## 7. Authorization matrix (enforced in services, not just routes)

| Operation                                   | Player (own character) | Player (other) | DM |
| ------------------------------------------- | ---------------------- | -------------- | -- |
| view sheet                                  | ✓                      | ✓              | ✓  |
| edit identity / HP / conditions / inventory | ✓                      | ✗              | ✓  |
| edit attributes, skills, base HP            | setting                | ✗              | ✓  |
| level / XP                                  | setting                | ✗              | ✓  |
| install / remove cyberware                  | setting                | ✗              | ✓  |
| grant items, XP, points; overrides; definitions; rules; encounters; NPCs; missions | ✗ | ✗ | ✓ |
| see DM-only events, private rolls, hidden combatants, hidden items | ✗ | ✗ | ✓ |

## 8. API surface (prefix `/api`)

- `auth`: `POST register | login | logout`, `GET me`
- `campaigns`: `GET /`, `POST /`, `POST /join`, `GET|PATCH /:id`, `POST /:id/invite/regenerate`, `GET /:id/characters`, `GET /:id/events`, `GET|POST /:id/rolls`, `GET /:id/overrides`, `GET /:id/session`, `POST /:id/session/start|end`
- content: `GET|POST /:id/items`, `PUT|DELETE /:id/items/:itemId`, `POST /:id/items/grant`, same shape for `conditions`, `abilities`; `GET|PUT /:id/skill-trees`
- rules: `GET|POST /:id/rules`, `PUT|DELETE /:id/rules/:ruleId`, `POST …/publish | duplicate`, `GET …/versions`, `POST …/versions/:v/restore`, `POST /:id/rules/simulate`, `POST /:id/rules/trigger`, `GET /:id/traces`, `GET /:id/pending`, `POST /:id/pending/:pid/resolve`
- dm: `GET /:id/dashboard`, `POST /:id/overrides`, `DELETE /:id/overrides/:oid`, `POST /:id/dm/grant`, `GET|POST /:id/messages`, `GET|POST /:id/roll-requests`, `DELETE /:id/roll-requests/:rid`
- encounters: `GET|POST /:id/encounters`, `GET|DELETE /:id/encounters/:eid`, `POST …/participants`, `POST …/action`
- story: `npcs`, `missions` (+ `/:mid/objectives/:oid`, `/:mid/complete`), `journal` CRUD
- characters: `POST /`, `GET|PATCH|DELETE /:cid`, `POST /:cid/hp`, `POST /:cid/conditions`, `DELETE /:cid/conditions/:x`, `POST /:cid/items/:iid/action`, `DELETE /:cid/effects/:eid`, `POST /:cid/unlock`, `POST /:cid/abilities/:aid/use`, `GET /:cid/export`, `POST /:cid/import`, `POST /:cid/reset`

All bodies are validated with the shared zod schemas; errors return `{ error, code, details }` with 400 / 401 / 403 / 404 / 409 / 422.

## 9. Known simplifications

See the README "What works / what is next" list. Architecturally relevant ones: ability use limits are not enforced; expiry-branch conditions are evaluated at fire time; attack automation is generic; there is no map.
