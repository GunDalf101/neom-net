import { MISSION_KINDS, MISSION_KIND_META, type MissionDto, type MissionInput, type MissionKind } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useCharacters, useItemDefinitions, useMissionOp, useMissions, useSaveMission } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Empty, Field, Icon, Input, Panel, Select, Textarea } from "@/components/ui";
import { Chips, FilterBar, matches } from "@/components/dm/Filters";
import { EncyclopediaBoard } from "@/pages/hud/EncyclopediaPage";
import { JournalBoard } from "@/pages/hud/JournalPage";
import { useDm } from "./DmShell";

const STATUS_COLOR: Record<MissionDto["status"], string> = { available: "cyan", active: "amber", completed: "ok", failed: "crimson" };
const empty = (kind: MissionKind = "main"): MissionInput => ({ name: "", description: "", objectives: [], status: "available", kind, rewards: { xp: 0, credits: 0, progressionPoints: 0, itemDefinitionIds: [] }, assignedCharacterIds: [], visibleToPlayers: true, assignedOnly: false });

export function DmMissionsPage() {
  const { campaign, me } = useDm();
  const [tab, setTab] = useState<"missions" | "encyclopedia" | "journal">("missions");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <button className={clsx("hud-tab", tab === "missions" && "active danger")} onClick={() => setTab("missions")}>
          Missions
        </button>
        <button className={clsx("hud-tab", tab === "encyclopedia" && "active danger")} onClick={() => setTab("encyclopedia")}>
          Encyclopedia
        </button>
        <button className={clsx("hud-tab", tab === "journal" && "active danger")} onClick={() => setTab("journal")}>
          Journal
        </button>
      </div>
      {tab === "missions" && <MissionsBoard />}
      {tab === "encyclopedia" && <EncyclopediaBoard campaignId={campaign.id} isDm />}
      {tab === "journal" && <JournalBoard campaignId={campaign.id} meId={me.id} isDm />}
    </div>
  );
}

function MissionsBoard() {
  const { campaign } = useDm();
  const missions = useMissions(campaign.id);
  const save = useSaveMission(campaign.id);
  const op = useMissionOp(campaign.id);
  const chars = useCharacters(campaign.id);
  const items = useItemDefinitions(campaign.id);
  const [kind, setKind] = useState<MissionKind>("main");
  const [editing, setEditing] = useState<MissionDto | "new" | null>(null);
  const [form, setForm] = useState<MissionInput>(empty());
  const open = (m: MissionDto | "new") => {
    setEditing(m);
    setForm(m === "new" ? empty(kind) : { name: m.name, description: m.description, objectives: m.objectives, status: m.status, kind: m.kind, rewards: m.rewards, assignedCharacterIds: m.assignedCharacterIds, visibleToPlayers: m.visibleToPlayers, assignedOnly: m.assignedOnly });
  };
  const kindMeta = MISSION_KIND_META[kind];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | MissionDto["status"]>("");
  const [vis, setVis] = useState<"" | "visible" | "hidden">("");
  const allOfKind = (missions.data ?? []).filter((m) => m.kind === kind);
  const inTab = allOfKind
    .filter((m) => matches(search, m.name, m.description, ...m.objectives.map((o) => o.text)))
    .filter((m) => !status || m.status === status)
    .filter((m) => (vis === "visible" ? m.visibleToPlayers : vis === "hidden" ? !m.visibleToPlayers : true));
  const dirty = Boolean(search || status || vis);
  const reset = () => { setSearch(""); setStatus(""); setVis(""); };
  const charName = (id: string) => chars.data?.find((c) => c.id === id)?.name ?? "?";
  return (
    <div className={clsx("grid grid-cols-1 gap-3", editing && "xl:grid-cols-[380px_1fr]")}>
      <Panel title="Missions" icon="target" color={kindMeta.color} actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        <div className="mb-2 flex flex-wrap gap-1" data-testid="dm-mission-tabs">
          {MISSION_KINDS.map((k) => {
            const km = MISSION_KIND_META[k];
            const count = (missions.data ?? []).filter((x) => x.kind === k).length;
            return (
              <button key={k} type="button" className={clsx("hud-tab !px-2 !py-1 !text-[0.55rem]", kind === k && "active")} style={kind === k ? { background: `var(--color-${km.color})`, boxShadow: `0 0 10px var(--color-${km.color})` } : { color: `var(--color-${km.color})` }} onClick={() => setKind(k)}>
                {km.label} <span className="num opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mb-2 text-[0.65rem] text-dim">{kindMeta.blurb}</p>
        <div className="mb-2">
          <FilterBar search={search} onSearch={setSearch} placeholder="Search missions…" count={inTab.length} total={allOfKind.length} dirty={dirty} onReset={reset} testId="mission-filters">
            <Chips label="Status" size="xs" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, ...(["available", "active", "completed", "failed"] as const).map((s) => ({ value: s, label: s, count: allOfKind.filter((m) => m.status === s).length, color: STATUS_COLOR[s] }))]} />
            <Chips label="Visibility" size="xs" value={vis} onChange={setVis} options={[{ value: "", label: "Any" }, { value: "visible", label: "Published" }, { value: "hidden", label: "Hidden", count: allOfKind.filter((m) => !m.visibleToPlayers).length }]} />
          </FilterBar>
        </div>
        {allOfKind.length === 0 && <Empty>No {kindMeta.label.toLowerCase()} missions.</Empty>}
        {allOfKind.length > 0 && inTab.length === 0 && <Empty>No mission matches.</Empty>}
        <div className={clsx(editing ? "space-y-1" : "grid gap-2 md:grid-cols-2 2xl:grid-cols-3")} data-testid="mission-list">
          {inTab.map((m) => {
            const selected = editing !== "new" && editing?.id === m.id;
            const answered = m.assignments.filter((a) => a.response !== "pending").length;
            const done = m.objectives.filter((o) => o.done).length;
            if (!editing) {
              return (
                <button key={m.id} type="button" onClick={() => open(m)} className="hud-panel flex min-w-0 flex-col gap-1.5 overflow-hidden p-2.5 text-left text-xs transition hover:brightness-125" style={{ ["--panel-accent" as string]: `var(--color-${kindMeta.color})` }} data-testid="mission-card">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-display text-[0.85rem] font-bold uppercase tracking-[0.05em] text-text">{m.name}</span>
                    {!m.visibleToPlayers && <Badge color="muted">hidden</Badge>}
                    <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
                  </span>
                  {m.description && <span className="line-clamp-2 text-muted">{m.description}</span>}
                  {m.objectives.length > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="h-1 flex-1 bg-bg-0">
                        <span className="block h-full" style={{ width: `${Math.round((done / m.objectives.length) * 100)}%`, background: `var(--color-${kindMeta.color})` }} />
                      </span>
                      <span className="num text-[0.62rem] text-muted">
                        {done}/{m.objectives.length} objectives
                      </span>
                    </span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.65rem] text-dim">
                    <span>{m.assignedCharacterIds.length ? m.assignedCharacterIds.map(charName).join(", ") : "whole crew"}</span>
                    {kindMeta.refusable && m.assignments.length > 0 && <span className="num">{answered}/{m.assignments.length} answered</span>}
                    {(m.rewards.xp > 0 || m.rewards.credits > 0) && (
                      <span className="num text-amber">
                        {m.rewards.xp ? `${m.rewards.xp} XP` : ""}
                        {m.rewards.xp && m.rewards.credits ? " · " : ""}
                        {m.rewards.credits ? `${m.rewards.credits.toLocaleString()} ₭` : ""}
                      </span>
                    )}
                    {m.rewardsGrantedAt && <span className="text-ok">rewards granted</span>}
                  </span>
                </button>
              );
            }
            return (
              <button key={m.id} type="button" onClick={() => (selected ? setEditing(null) : open(m))} className={clsx("hud-panel flex w-full items-center gap-2 p-2 text-left text-xs", selected && "lit")} style={{ ["--panel-accent" as string]: `var(--color-${kindMeta.color})` }} title={`${m.objectives.filter((o) => o.done).length}/${m.objectives.length} objectives · ${m.assignedCharacterIds.length} assigned${!m.visibleToPlayers ? " · hidden" : m.assignedOnly ? " · crew only" : ""}`}>
                <span className="min-w-0 flex-1 truncate font-display text-[0.8rem] font-bold uppercase tracking-[0.05em] text-text">{m.name}</span>
                {!m.visibleToPlayers && <Badge color="muted">hidden</Badge>}
                {kindMeta.refusable && m.assignments.length > 0 && (
                  <span className="num text-[0.6rem] text-muted" title="answers / offered">
                    {answered}/{m.assignments.length}
                  </span>
                )}
                <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
                <Icon name={selected ? "chevron-up" : "chevron-down"} size={12} className="text-muted" />
              </button>
            );
          })}
        </div>
      </Panel>
      {editing && (
        <Panel
          title={editing === "new" ? "New mission" : form.name}
          icon="hammer"
          color="crimson"
          actions={
            editing !== "new" ? (
              <>
                {!editing.rewardsGrantedAt && (
                  <ConfirmButton size="xs" color="ok" variant="outline" label="Complete & grant rewards" confirmLabel="Grant now?" onConfirm={() => { op.mutate({ id: editing.id, op: "complete" }); setEditing(null); }} />
                )}
                <ConfirmButton size="xs" label="Delete" onConfirm={() => { op.mutate({ id: editing.id, op: "delete" }); setEditing(null); }} />
              </>
            ) : null
          }
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form });
              setEditing(null);
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="Name" className="md:col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Kind" hint={MISSION_KIND_META[form.kind].blurb}>
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MissionKind })} style={{ color: `var(--color-${MISSION_KIND_META[form.kind].color})` }}>
                  {MISSION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {MISSION_KIND_META[k].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MissionInput["status"] })}>
                  {["available", "active", "completed", "failed"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div>
              <div className="hud-title mb-1 text-[0.6rem]">Objectives</div>
              {form.objectives.map((o, i) => (
                <div key={o.id} className="mb-1 flex gap-1">
                  <Input value={o.text} onChange={(e) => setForm({ ...form, objectives: form.objectives.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  <Button size="xs" variant="ghost" icon="x" onClick={() => setForm({ ...form, objectives: form.objectives.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <Button size="xs" icon="plus" onClick={() => setForm({ ...form, objectives: [...form.objectives, { id: `o${Date.now().toString(36)}`, text: "", done: false }] })}>
                Add objective
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="XP reward">
                <Input type="number" min={0} value={form.rewards.xp} onChange={(e) => setForm({ ...form, rewards: { ...form.rewards, xp: Number(e.target.value) } })} />
              </Field>
              <Field label="Kamas">
                <Input type="number" min={0} value={form.rewards.credits} onChange={(e) => setForm({ ...form, rewards: { ...form.rewards, credits: Number(e.target.value) } })} />
              </Field>
              <Field label="Progression points">
                <Input type="number" min={0} value={form.rewards.progressionPoints} onChange={(e) => setForm({ ...form, rewards: { ...form.rewards, progressionPoints: Number(e.target.value) } })} />
              </Field>
              <Field label="Visible to" hint={form.kind === "personal" ? "Personal missions are seen by the assigned character alone" : form.visibleToPlayers && form.assignedOnly ? "Only players whose character is in the crew below see it and get notified" : form.visibleToPlayers ? "Every player sees it (completed and failed missions stay with you)" : "DM only until you reveal it"}>
                <Select
                  value={!form.visibleToPlayers ? "dm" : form.assignedOnly || form.kind === "personal" ? "crew" : "all"}
                  onChange={(e) => setForm({ ...form, visibleToPlayers: e.target.value !== "dm", assignedOnly: e.target.value === "crew" })}
                >
                  {form.kind !== "personal" && <option value="all">all players</option>}
                  <option value="crew">{form.kind === "personal" ? "the assigned character" : "assigned crew only"}</option>
                  <option value="dm">DM only (hidden)</option>
                </Select>
              </Field>
            </div>
            <div>
              <div className="hud-title mb-1 text-[0.6rem]">Item rewards</div>
              <div className="flex flex-wrap gap-1">
                {items.data?.map((d) => {
                  const on = form.rewards.itemDefinitionIds.includes(d.id);
                  return (
                    <button key={d.id} type="button" className={clsx("hud-btn !py-0.5 !text-[0.55rem]", !on && "hud-btn-ghost")} style={{ ["--btn-color" as string]: "var(--color-violet)" }} onClick={() => setForm({ ...form, rewards: { ...form.rewards, itemDefinitionIds: on ? form.rewards.itemDefinitionIds.filter((x) => x !== d.id) : [...form.rewards.itemDefinitionIds, d.id] } })}>
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="hud-title mb-1 text-[0.6rem]">Assigned characters{form.kind === "personal" ? " (pick one)" : ""}</div>
              {editing !== "new" && editing.assignments.length > 0 && MISSION_KIND_META[form.kind].refusable && (
                <div className="mb-1 flex flex-wrap gap-2 text-[0.65rem]">
                  {editing.assignments.map((a) => (
                    <span key={a.characterId} className={clsx(a.response === "accepted" ? "text-ok" : a.response === "declined" ? "text-crimson" : "text-amber")} title={a.note || undefined}>
                      {a.response === "accepted" ? "✓" : a.response === "declined" ? "✗" : "…"} {chars.data?.find((c) => c.id === a.characterId)?.name ?? "?"}
                      {a.note ? ` — ${a.note}` : ""}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {chars.data?.map((c) => {
                  const on = form.assignedCharacterIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" className={clsx("hud-btn !py-0.5 !text-[0.55rem]", !on && "hud-btn-ghost")} onClick={() => setForm({ ...form, assignedCharacterIds: on ? form.assignedCharacterIds.filter((x) => x !== c.id) : [...form.assignedCharacterIds, c.id] })}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
              <Button type="submit" variant="solid" color="crimson" icon="save" disabled={save.isPending}>
                Save mission
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
