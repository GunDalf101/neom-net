/**
 * Exports one campaign (campaign row, DM/player memberships, characters with their items, conditions,
 * effects, overrides, unlocks, and the event log) as an idempotent Prisma data migration.
 *
 *   npm run campaign:export-migration -w @neom/server -- "<campaign id or exact name>" [migrationName]
 *
 * The SQL resolves every user by EMAIL at apply time: if the account exists it is reused, otherwise a
 * claimable placeholder (empty password hash) is created, and registering with that email later claims it.
 * No password hashes are exported. Every INSERT uses ON CONFLICT DO NOTHING, so re-running is a no-op and
 * applying it on the source database changes nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const [, , ref, nameArg] = process.argv;
if (!ref) {
  console.error('usage: export-campaign-migration "<campaign id or name>" [migrationName]');
  process.exit(2);
}

type Row = Record<string, unknown>;

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'::timestamptz`;
  if (typeof v === "object") return `${str(JSON.stringify(v))}::jsonb`;
  return str(String(v));
}
/**
 * E'' string literal. Dollar quoting is avoided on purpose: an empty value would produce `$q$$q$`, whose
 * embedded `$$` terminates the surrounding DO block.
 */
function str(s: string): string {
  return `E'${s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\0/g, "")}'`;
}
const col = (c: string) => `"${c}"`;

function insert(table: string, rows: Row[], userCols: string[] = [], conflict = "(id)"): string {
  if (rows.length === 0) return `-- ${table}: nothing to import\n`;
  const cols = Object.keys(rows[0]!);
  const lines = rows.map((r) => {
    const vals = cols.map((c) => {
      const v = r[c];
      if (userCols.includes(c) && typeof v === "string") return `user_id(${lit(v)})`;
      return lit(v);
    });
    return `    (${vals.join(", ")})`;
  });
  return `  INSERT INTO ${col(table)} (${cols.map(col).join(", ")}) VALUES\n${lines.join(",\n")}\n  ON CONFLICT ${conflict} DO NOTHING;\n`;
}

async function main() {
  const campaign = (await prisma.campaign.findUnique({ where: { id: ref } })) ?? (await prisma.campaign.findFirst({ where: { name: ref } }));
  if (!campaign) throw new Error(`Campaign not found: ${ref}`);
  const cid = campaign.id;
  const memberships = await prisma.campaignMembership.findMany({ where: { campaignId: cid } });
  const characters = await prisma.character.findMany({ where: { campaignId: cid } });
  const charIds = characters.map((c) => c.id);
  const items = await prisma.itemInstance.findMany({ where: { characterId: { in: charIds } } });
  const conditions = await prisma.characterCondition.findMany({ where: { characterId: { in: charIds } } });
  const effects = await prisma.activeEffect.findMany({ where: { characterId: { in: charIds } } });
  const overrides = await prisma.dMOverride.findMany({ where: { campaignId: cid } });
  const unlocks = await prisma.characterUnlock.findMany({ where: { characterId: { in: charIds } } });
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: cid }, orderBy: { createdAt: "asc" } });

  // Every user referenced anywhere becomes an email lookup at apply time.
  const userIds = new Set<string>([campaign.ownerId]);
  for (const m of memberships) userIds.add(m.userId);
  for (const c of characters) userIds.add(c.ownerUserId);
  for (const e of events) if (e.actorUserId) userIds.add(e.actorUserId);
  for (const o of overrides) userIds.add(o.createdById);
  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, email: true, username: true } });
  const emailOf = new Map(users.map((u) => [u.id, u.email.toLowerCase()]));
  const mapUser = (id: string | null) => (id ? emailOf.get(id) ?? null : null);

  // Item instances reference definitions that may belong to another campaign (e.g. the demo catalog):
  // keep only those whose definition belongs to this campaign, and report the rest.
  const defIds = new Set((await prisma.itemDefinition.findMany({ where: { campaignId: cid }, select: { id: true } })).map((d) => d.id));
  const keptItems = items.filter((i) => defIds.has(i.definitionId));
  if (keptItems.length !== items.length) console.warn(`skipping ${items.length - keptItems.length} item instance(s) whose definitions live in another campaign`);
  const keptUnlocks: typeof unlocks = []; // skill tree nodes are campaign content; export them separately if needed
  if (unlocks.length) console.warn(`skipping ${unlocks.length} skill-tree unlock(s): export skill trees first`);

  const strip = <T extends Row>(r: T, drop: string[] = []): Row => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)));
  const campaignRow = { ...strip(campaign as unknown as Row), ownerId: mapUser(campaign.ownerId) };
  const membershipRows = memberships.map((m) => ({ ...strip(m as unknown as Row), userId: mapUser(m.userId) }));
  const characterRows = characters.map((c) => ({ ...strip(c as unknown as Row), ownerUserId: mapUser(c.ownerUserId) }));
  const eventRows = events.map((e) => ({ ...strip(e as unknown as Row), actorUserId: mapUser(e.actorUserId) }));
  const overrideRows = overrides.map((o) => ({ ...strip(o as unknown as Row), createdById: mapUser(o.createdById) }));

  const userDecls = users
    .map((u) => `  PERFORM pg_temp.ensure_user(${lit(u.email.toLowerCase())}, ${lit(u.username)});`)
    .join("\n");

  const sql = `-- Data migration: import campaign "${campaign.name}" (${cid})
-- Generated by apps/server/scripts/export-campaign-migration.ts on ${new Date().toISOString()}.
-- Idempotent: every insert is ON CONFLICT DO NOTHING. Users are matched by email; missing accounts are
-- created as claimable placeholders (empty password hash) that registration with that email takes over.
DO $import$
DECLARE
  v_count int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _import_users (email text PRIMARY KEY, id text NOT NULL) ON COMMIT DROP;

  CREATE OR REPLACE FUNCTION pg_temp.user_id(p_email text) RETURNS text LANGUAGE sql STABLE AS
    'SELECT id FROM _import_users WHERE email = p_email';

  CREATE OR REPLACE FUNCTION pg_temp.ensure_user(p_email text, p_username text) RETURNS void LANGUAGE plpgsql AS $fn$
  DECLARE v_id text; v_name text;
  BEGIN
    SELECT id INTO v_id FROM "User" WHERE lower(email) = p_email;
    IF v_id IS NULL THEN
      v_name := p_username;
      IF EXISTS (SELECT 1 FROM "User" WHERE lower(username) = lower(v_name)) THEN
        v_name := left(v_name, 26) || '-' || substr(md5(random()::text), 1, 4);
      END IF;
      v_id := 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
      INSERT INTO "User" (id, email, username, "passwordHash", "createdAt") VALUES (v_id, p_email, v_name, '', now());
      RAISE NOTICE 'created claimable account % (%); registering with this email sets its password', p_email, v_id;
    END IF;
    INSERT INTO _import_users (email, id) VALUES (p_email, v_id) ON CONFLICT (email) DO NOTHING;
  END $fn$;

${userDecls}

${insert("Campaign", [campaignRow], ["ownerId"]).replace(/user_id\(/g, "pg_temp.user_id(")}
${insert("CampaignMembership", membershipRows, ["userId"], '("campaignId", "userId")').replace(/user_id\(/g, "pg_temp.user_id(")}
${insert("Character", characterRows, ["ownerUserId"]).replace(/user_id\(/g, "pg_temp.user_id(")}
${insert("ItemInstance", keptItems as unknown as Row[])}
${insert("CharacterCondition", conditions as unknown as Row[])}
${insert("ActiveEffect", effects as unknown as Row[])}
${insert("DMOverride", overrideRows, ["createdById"]).replace(/user_id\(/g, "pg_temp.user_id(")}
${insert("CharacterUnlock", keptUnlocks as unknown as Row[])}
${insert("CampaignEvent", eventRows, ["actorUserId"]).replace(/user_id\(/g, "pg_temp.user_id(")}

  SELECT count(*) INTO v_count FROM "Character" WHERE "campaignId" = ${lit(cid)};
  RAISE NOTICE 'campaign % present with % character(s)', ${lit(campaign.name)}, v_count;
END $import$;
`;

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const slug = (nameArg ?? `import_${campaign.name}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const dir = join(fileURLToPath(new URL("../prisma/migrations/", import.meta.url)), `${stamp}_${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "migration.sql"), sql);
  console.log(`wrote ${dir}/migration.sql`);
  console.log(`  campaign 1 · memberships ${membershipRows.length} · characters ${characterRows.length} · items ${keptItems.length} · conditions ${conditions.length} · effects ${effects.length} · overrides ${overrideRows.length} · events ${eventRows.length} · users by email ${users.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
