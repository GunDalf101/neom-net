import { SHARD_SCHOOLS, SHARD_SCHOOL_META, type ShardDto, type ShardSchool } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCastShard, useShards, useUpdateCharacter } from "@/api/hooks";
import { Chips, FilterBar, FilterSelect, matches } from "@/components/dm/Filters";
import { Badge, Button, Empty, Icon, Spinner, Toggle } from "@/components/ui";
import { useHud } from "./HudShell";

/**
 * Netrunner shards (hacks). Players only reach this tab when the DM has made their character a netrunner; they see
 * the shards they know and cast them for RAM. The DM uses the same page to switch the role on, size the RAM pool
 * and choose which shards the character knows.
 */
export function ShardsPage() {
  const { view, campaign, isDm } = useHud();
  const c = view.character;
  const book = useShards(campaign.id);
  const cast = useCastShard(c.id);
  const update = useUpdateCharacter(c.id);
  const [search, setSearch] = useState("");
  const [school, setSchool] = useState<ShardSchool | "">("");
  const [tier, setTier] = useState("");
  const [scope, setScope] = useState<"known" | "all">("known");
  const [openId, setOpenId] = useState<string | null>(null);
  const canCast = view.permissions.isOwner || isDm;
  const known = new Set(c.shardIds);
  // The DM picks from the whole spellbook; a player only ever sees what they know.
  const pool: ShardDto[] = isDm && scope === "all" ? (book.data ?? []) : view.shards;
  const list = pool.filter((s) => matches(search, s.name, s.effect, s.equivalent, s.description)).filter((s) => !school || s.school === school).filter((s) => tier === "" || String(s.tier) === tier);
  const tiers = [...new Set(pool.map((s) => s.tier))].sort((a, b) => a - b);
  const free = Math.max(0, c.ramMax - c.ramUsed);
  const setKnown = (ids: string[]) => update.mutate({ shardIds: ids });
  const toggleKnown = (id: string) => setKnown(known.has(id) ? c.shardIds.filter((x) => x !== id) : [...c.shardIds, id]);

  if (!c.isNetrunner && !isDm) return <Empty icon="binary">{c.name} is not a netrunner.</Empty>;

  return (
    <div className="mx-auto max-w-[1200px] space-y-3" data-testid="shards-page">
      <section className="hud-panel flex flex-wrap items-center gap-3 px-3 py-2" style={{ ["--panel-accent" as string]: "var(--color-violet)" }}>
        <span className="font-display text-[1.1rem] font-black uppercase tracking-[0.08em] text-violet glow-text">Shards</span>
        <span className="text-xs text-muted">{c.isNetrunner ? `${view.shards.length} known · hacks cost RAM, a long rest clears it` : `${c.name} is not a netrunner`}</span>
        <span className="ml-auto flex items-center gap-2 border border-cyan/50 bg-bg-0/60 px-3 py-1" data-testid="ram-meter">
          <Icon name="memory-stick" size={14} className="text-cyan" />
          <span className={clsx("num text-[1.1rem] font-black", free === 0 && c.ramMax > 0 ? "text-crimson" : "text-cyan")}>
            {free}
            <span className="text-muted"> / {c.ramMax}</span>
          </span>
          <span className="text-[0.6rem] uppercase tracking-wider text-muted">RAM free</span>
        </span>
        {isDm && (
          <span className="flex flex-wrap items-center gap-2 text-xs" data-testid="shard-dm-tools">
            <Toggle on={c.isNetrunner} onChange={(v) => update.mutate({ isNetrunner: v })} color="violet" label={c.isNetrunner ? "Netrunner" : "Not a netrunner"} />
            <label className="flex items-center gap-1 text-muted">
              RAM max
              <input className="valbox !text-[0.85rem] w-14" key={`m${c.ramMax}`} defaultValue={c.ramMax} inputMode="numeric" aria-label="RAM max" data-testid="ram-max" onBlur={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "")); if (Number.isFinite(n) && n !== c.ramMax) update.mutate({ ramMax: n, ramUsed: Math.min(c.ramUsed, n) }); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </label>
            <Button size="xs" variant="ghost" icon="rotate-ccw" disabled={c.ramUsed === 0 || update.isPending} onClick={() => update.mutate({ ramUsed: 0 })}>
              Refill RAM
            </Button>
          </span>
        )}
      </section>

      {isDm && !c.isNetrunner && <div className="border border-amber/50 bg-amber/5 px-3 py-2 text-xs text-amber">Switch "Netrunner" on to give {c.name} this tab, a RAM pool and shards. Players who are not netrunners never see any of it.</div>}

      <div className="space-y-1.5">
        <FilterBar search={search} onSearch={setSearch} placeholder="Search shards…" count={list.length} total={pool.length} dirty={Boolean(search || school || tier)} onReset={() => { setSearch(""); setSchool(""); setTier(""); }} testId="shard-filters">
          <FilterSelect label="Tier" value={tier} onChange={setTier} options={tiers.map((t) => ({ value: String(t), label: `Tier ${t}` }))} />
          {isDm && <Chips label="Scope" size="xs" value={scope} onChange={setScope} options={[{ value: "known", label: "Known", count: view.shards.length }, { value: "all", label: "Whole spellbook", count: book.data?.length ?? 0, color: "crimson" }]} />}
        </FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <Chips<ShardSchool | ""> label="School" size="xs" value={school} onChange={setSchool} options={[{ value: "", label: "All", count: pool.length }, ...SHARD_SCHOOLS.map((s) => ({ value: s, label: SHARD_SCHOOL_META[s].label, count: pool.filter((x) => x.school === s).length, color: SHARD_SCHOOL_META[s].color })).filter((o) => o.count > 0)]} />
          {isDm && scope === "all" && list.length > 0 && (
            <span className="ml-auto flex items-center gap-1" data-testid="shard-grant-bulk">
              <Button size="xs" color="ok" icon="plus" disabled={update.isPending} onClick={() => setKnown([...new Set([...c.shardIds, ...list.map((s) => s.id)])])}>
                Teach the {list.length} shown
              </Button>
              <Button size="xs" variant="ghost" icon="minus" disabled={update.isPending} onClick={() => setKnown(c.shardIds.filter((id) => !list.some((s) => s.id === id)))}>
                Forget them
              </Button>
            </span>
          )}
        </div>
      </div>

      {book.isLoading && <Spinner />}
      {pool.length === 0 && !book.isLoading && (
        <Empty icon="binary">
          {isDm ? (
            scope === "all" ? (
              <>
                The spellbook is empty. Load it from <Link className="text-cyan underline" to={`/c/${campaign.id}/dm/workshop?tab=shards`}>Workshop → Shards</Link>.
              </>
            ) : (
              `${c.name} knows no shards yet. Switch to "Whole spellbook" to teach some.`
            )
          ) : (
            "You know no shards yet. The DM hands them out."
          )}
        </Empty>
      )}
      {pool.length > 0 && list.length === 0 && <Empty icon="binary">No shard matches.</Empty>}
      <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="shard-grid">
        {list.map((s) => {
          const m = SHARD_SCHOOL_META[s.school];
          const open = openId === s.id;
          const isKnown = known.has(s.id);
          const short = s.ramCost > free;
          return (
            <article key={s.id} className={clsx("hud-panel min-w-0 overflow-hidden", open && "lit", isDm && scope === "all" && !isKnown && "opacity-70")} style={{ ["--panel-accent" as string]: `var(--color-${m.color})` }} data-testid="shard-card" data-known={isKnown}>
              <button type="button" className="flex w-full items-center gap-2 p-2.5 text-left" onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}>
                <span className="tile" style={{ ["--tile-color" as string]: `var(--color-${m.color})`, width: 34, height: 34 }}>
                  <Icon name={m.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold text-text">{s.name}</span>
                  <span className="block truncate text-[0.68rem] text-muted">
                    {m.label} · tier {s.tier} · {s.action}
                  </span>
                </span>
                <span className="num shrink-0 text-[0.8rem] font-bold text-violet">{s.effect}</span>
                <Badge color={short ? "crimson" : "cyan"} title="RAM cost">{s.ramCost} RAM</Badge>
              </button>
              {open && (
                <div className="space-y-2 border-t border-line/60 p-3 text-xs" data-testid="shard-details">
                  <dl className="grid grid-cols-[5.5rem_1fr] gap-y-0.5">
                    <dt className="text-muted">Range</dt>
                    <dd className="text-text">{s.range || "—"}</dd>
                    <dt className="text-muted">Duration</dt>
                    <dd className="text-text">{s.duration || "—"}</dd>
                    <dt className="text-muted">Effect</dt>
                    <dd className="text-text">{s.effect || "—"}</dd>
                    {s.equivalent && (
                      <>
                        <dt className="text-muted">Plays like</dt>
                        <dd className="text-text">{s.equivalent} (5e)</dd>
                      </>
                    )}
                  </dl>
                  {s.description && <p className="text-muted">{s.description}</p>}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/40 px-2.5 py-1.5">
                {isDm && (
                  <Button size="xs" variant={isKnown ? "outline" : "ghost"} color="ok" icon={isKnown ? "check" : "plus"} disabled={update.isPending} onClick={() => toggleKnown(s.id)} data-testid="shard-know">
                    {isKnown ? "Known" : "Teach"}
                  </Button>
                )}
                {c.isNetrunner && (isKnown || isDm) && canCast && (
                  <Button size="xs" variant="solid" color="violet" icon="zap" disabled={short || cast.isPending} title={short ? `Needs ${s.ramCost} RAM, ${free} free` : undefined} onClick={() => cast.mutate({ shardId: s.id })} data-testid="shard-cast">
                    {short ? "No RAM" : "Run"}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
