import { SHARD_SCHOOLS, SHARD_SCHOOL_META, casterSlots, lowestFreeSlot, slotsFree, type ShardDto, type ShardSchool } from "@neom/shared";
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
  const slots = c.shardSlots;
  const used = c.shardSlotsUsed;
  const levels = Object.keys(slots).map(Number).filter((l) => (slots[String(l)] ?? 0) > 0).sort((a, b) => a - b);
  const anyUsed = Object.values(used).some((n) => n > 0);
  const setSlot = (level: number, n: number) => update.mutate({ shardSlots: { ...slots, [String(level)]: n } });
  const setKnown = (ids: string[]) => update.mutate({ shardIds: ids });
  const toggleKnown = (id: string) => setKnown(known.has(id) ? c.shardIds.filter((x) => x !== id) : [...c.shardIds, id]);

  if (!c.isNetrunner && !isDm) return <Empty icon="binary">{c.name} is not a netrunner.</Empty>;

  return (
    <div className="mx-auto max-w-[1200px] space-y-3" data-testid="shards-page">
      <section className="hud-panel flex flex-wrap items-center gap-3 px-3 py-2" style={{ ["--panel-accent" as string]: "var(--color-violet)" }}>
        <span className="font-display text-[1.1rem] font-black uppercase tracking-[0.08em] text-violet glow-text">Shards</span>
        <span className="text-xs text-muted">{c.isNetrunner ? `${view.shards.length} known · RAM level is the spell level; slots come back on a long rest` : `${c.name} is not a netrunner`}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 border border-cyan/50 bg-bg-0/60 px-3 py-1" data-testid="ram-meter">
          <Icon name="memory-stick" size={14} className="text-cyan" />
          {levels.length === 0 && <span className="text-xs text-muted">no RAM slots{isDm ? ": set them below" : ""}</span>}
          {levels.map((l) => {
            const free = slotsFree(slots, used, l);
            return (
              <span key={l} className="flex items-center gap-1" title={`Level ${l} RAM: ${free} of ${slots[String(l)]} slots free`} data-testid={`ram-level-${l}`}>
                <span className="font-display text-[0.55rem] tracking-wider text-muted">L{l}</span>
                <span className="flex gap-0.5">
                  {Array.from({ length: slots[String(l)] ?? 0 }, (_, i) => (
                    <span key={i} className={clsx("inline-block h-2.5 w-2.5 border", i < free ? "border-cyan bg-cyan shadow-[0_0_6px_var(--color-cyan)]" : "border-line-2 bg-transparent")} />
                  ))}
                </span>
              </span>
            );
          })}
        </span>
        {isDm && (
          <span className="flex flex-wrap items-center gap-2 text-xs" data-testid="shard-dm-tools">
            <Toggle on={c.isNetrunner} onChange={(v) => update.mutate({ isNetrunner: v })} color="violet" label={c.isNetrunner ? "Netrunner" : "Not a netrunner"} />
            <Button size="xs" variant="ghost" icon="rotate-ccw" disabled={!anyUsed || update.isPending} onClick={() => update.mutate({ shardSlotsUsed: {} })}>
              Refill RAM
            </Button>
          </span>
        )}
      </section>

      {isDm && c.isNetrunner && (
        <div className="hud-panel flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-xs" style={{ ["--panel-accent" as string]: "var(--color-crimson)" }} data-testid="slot-editor">
          <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span>
          <span className="text-muted">RAM slots per level (5e spell slots)</span>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((l) => (
            <label key={l} className="flex items-center gap-1 text-muted">
              L{l}
              <input className="valbox !text-[0.8rem] w-10" key={`s${l}-${slots[String(l)] ?? 0}`} defaultValue={slots[String(l)] ?? 0} inputMode="numeric" aria-label={`Level ${l} RAM slots`} data-testid={`slot-max-${l}`} onBlur={(e) => { const n = Math.min(20, Number(e.target.value.replace(/[^0-9]/g, "")) || 0); if (n !== (slots[String(l)] ?? 0)) setSlot(l, n); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </label>
          ))}
          <Button size="xs" color="violet" icon="wand-sparkles" disabled={update.isPending} title={`5e full-caster slots for a level ${c.level} character`} onClick={() => update.mutate({ shardSlots: casterSlots(c.level), shardSlotsUsed: {} })} data-testid="slot-preset">
            Full caster · level {c.level}
          </Button>
        </div>
      )}
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
          const level = s.ramCost;
          const slot = level === 0 ? 0 : lowestFreeSlot(slots, used, level);
          const short = slot === null;
          const upcasts = level === 0 ? [] : levels.filter((l) => l > (slot ?? level) && slotsFree(slots, used, l) > 0);
          return (
            <article key={s.id} className={clsx("hud-panel min-w-0 overflow-hidden", open && "lit", isDm && scope === "all" && !isKnown && "opacity-70")} style={{ ["--panel-accent" as string]: `var(--color-${m.color})` }} data-testid="shard-card" data-known={isKnown}>
              <button type="button" className="flex w-full items-center gap-2 p-2.5 text-left" onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}>
                <span className="tile" style={{ ["--tile-color" as string]: `var(--color-${m.color})`, width: 34, height: 34 }}>
                  <Icon name={m.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold text-text">{s.name}</span>
                  <span className="block truncate text-[0.68rem] text-muted">
                    {m.label} · {level === 0 ? "cantrip" : `level ${level}`} · {s.action}
                  </span>
                </span>
                <span className="num shrink-0 text-[0.8rem] font-bold text-violet">{s.effect}</span>
                <Badge color={short ? "crimson" : level === 0 ? "ok" : "cyan"} title={level === 0 ? "Cantrip: no RAM slot needed" : `Needs a level ${level} RAM slot (or higher)`}>{level === 0 ? "free" : `RAM ${level}`}</Badge>
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
                  <>
                    {open && upcasts.map((l) => (
                      <Button key={l} size="xs" variant="ghost" color="violet" disabled={cast.isPending} title={`Upcast with a level ${l} slot`} onClick={() => cast.mutate({ shardId: s.id, slotLevel: l })}>
                        L{l}
                      </Button>
                    ))}
                    <Button size="xs" variant="solid" color="violet" icon="zap" disabled={short || cast.isPending} title={short ? `No RAM slot of level ${level} or higher left` : slot ? `Spends a level ${slot} slot` : "Cantrip"} onClick={() => cast.mutate({ shardId: s.id })} data-testid="shard-cast">
                      {short ? "No slot" : slot && slot > level ? `Run · L${slot}` : "Run"}
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
