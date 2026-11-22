import { SHARD_SCHOOLS, SHARD_SCHOOL_META, type ShardDto, type ShardInput, type ShardSchool } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useDeleteShard, useImportCatalog, useSaveShard, useShards } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Empty, Field, Icon, Input, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { Chips, FilterBar, FilterSelect, matches } from "./Filters";

const empty = (school: ShardSchool = "offensive"): ShardInput => ({ name: "", school, tier: 1, action: "Action", range: "", duration: "Instant", ramCost: 1, effect: "", equivalent: "", description: "", visibleToPlayers: true, sortOrder: 0 });
const toInput = (s: ShardDto): ShardInput => ({ name: s.name, school: s.school, tier: s.tier, action: s.action, range: s.range, duration: s.duration, ramCost: s.ramCost, effect: s.effect, equivalent: s.equivalent, description: s.description, visibleToPlayers: s.visibleToPlayers, sortOrder: s.sortOrder });

/** DM: the netrunner spellbook. Add, edit, hide or remove shards; who can cast them is set on each character's Shards tab. */
export function ShardsWorkshop({ campaignId }: { campaignId: string }) {
  const shards = useShards(campaignId);
  const save = useSaveShard(campaignId);
  const del = useDeleteShard(campaignId);
  const importCatalog = useImportCatalog(campaignId);
  const [editing, setEditing] = useState<ShardDto | "new" | null>(null);
  const [form, setForm] = useState<ShardInput>(empty());
  const [search, setSearch] = useState("");
  const [school, setSchool] = useState<ShardSchool | "">("");
  const [tier, setTier] = useState("");
  const all = shards.data ?? [];
  const list = all.filter((s) => matches(search, s.name, s.effect, s.equivalent, s.description)).filter((s) => !school || s.school === school).filter((s) => tier === "" || String(s.tier) === tier);
  const tiers = [...new Set(all.map((s) => s.tier))].sort((a, b) => a - b);
  const open = (s: ShardDto | "new") => {
    setEditing(s);
    setForm(s === "new" ? empty(school || "offensive") : toInput(s));
  };
  const set = <K extends keyof ShardInput>(k: K, v: ShardInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const selectedId = editing && editing !== "new" ? editing.id : null;

  return (
    <div className={clsx("grid grid-cols-1 gap-3", editing && "xl:grid-cols-[minmax(0,1fr)_420px]")} data-testid="shards-workshop">
      <Panel title="Netrunner shards" icon="binary" color="violet" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        <div className="mb-2 space-y-1.5">
          <FilterBar search={search} onSearch={setSearch} placeholder="Search shards…" count={list.length} total={all.length} dirty={Boolean(search || school || tier)} onReset={() => { setSearch(""); setSchool(""); setTier(""); }} testId="shard-filters">
            <FilterSelect label="Tier" value={tier} onChange={setTier} options={tiers.map((t) => ({ value: String(t), label: `Tier ${t}` }))} />
          </FilterBar>
          <Chips<ShardSchool | ""> label="School" size="xs" value={school} onChange={setSchool} options={[{ value: "", label: "All", count: all.length }, ...SHARD_SCHOOLS.map((s) => ({ value: s, label: SHARD_SCHOOL_META[s].label, count: all.filter((x) => x.school === s).length, color: SHARD_SCHOOL_META[s].color }))]} />
        </div>
        {shards.isLoading && <Spinner />}
        {!shards.isLoading && all.length === 0 && (
          <Empty icon="binary">
            No shards yet. Import the NEOM catalog to load the 59 shards of the Netrunner Spellbook, or add your own.
            <div className="mt-2">
              <ConfirmButton size="sm" color="amber" variant="solid" label="Import NEOM catalog" confirmLabel="Import now?" disabled={importCatalog.isPending} onConfirm={() => importCatalog.mutate()} />
            </div>
          </Empty>
        )}
        {all.length > 0 && list.length === 0 && <Empty>No shard matches.</Empty>}
        <div className={clsx("grid gap-1.5", editing ? "md:grid-cols-2" : "md:grid-cols-2 2xl:grid-cols-3")} data-testid="shard-list">
          {list.map((s) => {
            const m = SHARD_SCHOOL_META[s.school];
            return (
              <button key={s.id} type="button" onClick={() => open(s)} className={clsx("hud-panel flex min-w-0 items-center gap-2 overflow-hidden p-2 text-left text-xs", selectedId === s.id && "lit")} style={{ ["--panel-accent" as string]: `var(--color-${m.color})` }} data-testid="shard-row">
                <Icon name={m.icon} size={14} style={{ color: `var(--color-${m.color})` }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{s.name}</span>
                  <span className="block truncate text-dim">
                    T{s.tier} · {s.action} · {s.range} · {s.effect}
                  </span>
                </span>
                {!s.visibleToPlayers && <Badge color="crimson">hidden</Badge>}
                <Badge color={s.ramCost === 0 ? "ok" : "cyan"} title="RAM level = spell slot level">{s.ramCost === 0 ? "cantrip" : `RAM ${s.ramCost}`}</Badge>
              </button>
            );
          })}
        </div>
      </Panel>
      {editing && (
        <Panel title={editing === "new" ? "New shard" : `Edit ${form.name}`} icon="hammer" color="crimson" actions={editing !== "new" ? <ConfirmButton size="xs" label="Delete" confirmLabel="Remove from every sheet?" onConfirm={() => { del.mutate(editing.id); setEditing(null); }} /> : null}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form });
              setEditing(null);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" className="col-span-2">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
              <Field label="School">
                <Select value={form.school} onChange={(e) => set("school", e.target.value as ShardSchool)}>
                  {SHARD_SCHOOLS.map((s) => (
                    <option key={s} value={s}>
                      {SHARD_SCHOOL_META[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tier">
                <Input type="number" min={0} max={9} value={form.tier} onChange={(e) => set("tier", Number(e.target.value))} />
              </Field>
              <Field label="Action">
                <Select value={form.action} onChange={(e) => set("action", e.target.value)}>
                  {["Action", "Bonus", "Reaction", "Free", ...(["Action", "Bonus", "Reaction", "Free"].includes(form.action) ? [] : [form.action])].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              </Field>
              <Field label="RAM level" hint="Slot level, 0 = cantrip">
                <Input type="number" min={0} max={9} value={form.ramCost} onChange={(e) => set("ramCost", Number(e.target.value))} />
              </Field>
              <Field label="Range">
                <Input value={form.range} onChange={(e) => set("range", e.target.value)} placeholder="120 ft" />
              </Field>
              <Field label="Duration">
                <Input value={form.duration} onChange={(e) => set("duration", e.target.value)} placeholder="1 min (concentration)" />
              </Field>
              <Field label="Effect" className="col-span-2">
                <Input value={form.effect} onChange={(e) => set("effect", e.target.value)} placeholder="3d6 Fire" />
              </Field>
              <Field label="5e equivalent" className="col-span-2" hint="For rules lookups">
                <Input value={form.equivalent} onChange={(e) => set("equivalent", e.target.value)} placeholder="Burning Hands" />
              </Field>
              <Field label="Visible to netrunners" className="col-span-2">
                <Select value={form.visibleToPlayers ? "1" : "0"} onChange={(e) => set("visibleToPlayers", e.target.value === "1")}>
                  <option value="1">Yes</option>
                  <option value="0">No (DM only)</option>
                </Select>
              </Field>
            </div>
            <Field label="Notes / rules text">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="min-h-[90px]" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
              <Button type="submit" variant="solid" color="violet" icon="save" disabled={save.isPending || !form.name.trim()}>
                Save shard
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
