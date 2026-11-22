import { ATTRIBUTES, ATTRIBUTE_META, type NpcDto, type NpcInput } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useConditionDefinitions, useDeleteNpc, useNpcs, useSaveNpc } from "@/api/hooks";
import { InstantEffectListEditor, PassiveEffectListEditor } from "@/components/editors/EffectEditors";
import { Portrait, PortraitPicker } from "@/components/hud/Portrait";
import { Badge, Button, ConfirmButton, Empty, Field, Input, NumberStepper, Panel, Select, Textarea } from "@/components/ui";
import { Chips, FilterBar, FilterSelect, matches } from "@/components/dm/Filters";
import { Section } from "./WorkshopPage";
import { useDm } from "./DmShell";

const empty = (): NpcInput => ({
  name: "",
  description: "",
  portraitUrl: null,
  faction: "",
  attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  hpMax: 10,
  ac: 10,
  speed: 9,
  abilities: [],
  effects: [],
  ruleIds: [],
  visibleToPlayers: false,
  isEnemy: true,
});

export function NpcsPage() {
  const { campaign } = useDm();
  const npcs = useNpcs(campaign.id);
  const save = useSaveNpc(campaign.id);
  const del = useDeleteNpc(campaign.id);
  const conditions = useConditionDefinitions(campaign.id);
  const [editing, setEditing] = useState<NpcDto | "new" | null>(null);
  const [form, setForm] = useState<NpcInput>(empty());
  const [search, setSearch] = useState("");
  const [side, setSide] = useState<"" | "hostile" | "friendly">("");
  const [vis, setVis] = useState<"" | "visible" | "hidden">("");
  const [faction, setFaction] = useState("");
  const open = (n: NpcDto | "new") => {
    setEditing(n);
    setForm(n === "new" ? empty() : { ...n });
  };
  const all = npcs.data ?? [];
  const factions = [...new Set(all.map((n) => n.faction.trim()).filter(Boolean))].sort();
  const list = all
    .filter((n) => matches(search, n.name, n.description, n.faction, ...n.abilities.map((a) => a.name)))
    .filter((n) => (side === "hostile" ? n.isEnemy : side === "friendly" ? !n.isEnemy : true))
    .filter((n) => (vis === "visible" ? n.visibleToPlayers : vis === "hidden" ? !n.visibleToPlayers : true))
    .filter((n) => !faction || n.faction.trim() === faction);
  const dirty = Boolean(search || side || vis || faction);
  const reset = () => { setSearch(""); setSide(""); setVis(""); setFaction(""); };
  const selectedId = editing && editing !== "new" ? editing.id : null;

  return (
    <div className={clsx("grid grid-cols-1 gap-3", editing && "xl:grid-cols-[360px_1fr]")}>
      <Panel title="NPCs & enemies" icon="users-round" color="crimson" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        <div className="mb-2">
          <FilterBar search={search} onSearch={setSearch} placeholder="Search NPCs…" count={list.length} total={all.length} dirty={dirty} onReset={reset} testId="npc-filters">
            <Chips label="Disposition" size="xs" value={side} onChange={setSide} options={[{ value: "", label: "All" }, { value: "hostile", label: "Hostile", count: all.filter((n) => n.isEnemy).length, color: "crimson" }, { value: "friendly", label: "Friendly", count: all.filter((n) => !n.isEnemy).length, color: "ok" }]} />
            <Chips label="Visibility" size="xs" value={vis} onChange={setVis} options={[{ value: "", label: "Any" }, { value: "visible", label: "Known", count: all.filter((n) => n.visibleToPlayers).length }, { value: "hidden", label: "Hidden", count: all.filter((n) => !n.visibleToPlayers).length }]} />
            {factions.length > 0 && <FilterSelect label="Faction" value={faction} onChange={setFaction} options={factions.map((f) => ({ value: f, label: f }))} />}
          </FilterBar>
        </div>
        {all.length === 0 && <Empty>No NPCs yet.</Empty>}
        {all.length > 0 && list.length === 0 && <Empty>No NPC matches.</Empty>}
        <div className={clsx(editing ? "space-y-1" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")} data-testid="npc-list">
          {list.map((n) =>
            editing ? (
              <button key={n.id} type="button" onClick={() => open(n)} className={clsx("hud-panel flex w-full items-center gap-2 p-2 text-left text-xs", selectedId === n.id && "border-crimson")} style={{ ["--panel-accent" as string]: n.isEnemy ? "var(--color-crimson)" : "var(--color-ok)" }}>
                <Portrait url={n.portraitUrl} name={n.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{n.name}</span>
                  <span className="text-dim">
                    HP {n.hpMax} · AC {n.ac} · {n.faction || "unaffiliated"}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <Badge color={n.isEnemy ? "crimson" : "ok"}>{n.isEnemy ? "hostile" : "friendly"}</Badge>
                  {!n.visibleToPlayers && <Badge color="muted">hidden</Badge>}
                </span>
              </button>
            ) : (
              <button key={n.id} type="button" onClick={() => open(n)} className="hud-panel flex min-w-0 flex-col gap-2 overflow-hidden p-2.5 text-left text-xs transition hover:brightness-125" style={{ ["--panel-accent" as string]: n.isEnemy ? "var(--color-crimson)" : "var(--color-ok)" }} data-testid="npc-card">
                <span className="flex items-center gap-2">
                  <Portrait url={n.portraitUrl} name={n.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[0.85rem] font-bold uppercase tracking-[0.05em] text-text">{n.name}</span>
                    <span className="block truncate text-dim">{n.faction || "unaffiliated"}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <Badge color={n.isEnemy ? "crimson" : "ok"}>{n.isEnemy ? "hostile" : "friendly"}</Badge>
                    {!n.visibleToPlayers && <Badge color="muted">hidden</Badge>}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.68rem]">
                  <span className="num text-crimson">HP {n.hpMax}</span>
                  <span className="num text-blue">AC {n.ac}</span>
                  <span className="num text-cyan">{n.speed} m</span>
                  <span className="text-muted">{n.abilities.length} abilit{n.abilities.length === 1 ? "y" : "ies"}</span>
                  {n.effects.length > 0 && <span className="text-violet">{n.effects.length} effect{n.effects.length === 1 ? "" : "s"}</span>}
                </span>
                {n.description && <span className="line-clamp-2 break-words text-muted">{n.description}</span>}
              </button>
            ),
          )}
        </div>
      </Panel>
      {editing && (
        <Panel title={editing === "new" ? "New NPC" : `Edit ${form.name}`} icon="hammer" color="crimson" actions={editing !== "new" ? <ConfirmButton size="xs" label="Delete" onConfirm={() => { del.mutate(editing.id); setEditing(null); }} /> : null}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form });
              setEditing(null);
            }}
          >
            <div className="flex items-center gap-3">
              <PortraitPicker url={form.portraitUrl} name={form.name || "NPC"} size={80} onChange={(url) => setForm({ ...form, portraitUrl: url })} />
              <div className="min-w-0 flex-1 text-xs text-muted">Upload or drop a portrait (resized automatically), or paste an image link below.</div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="Name" className="md:col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Faction">
                <Input value={form.faction} onChange={(e) => setForm({ ...form, faction: e.target.value })} />
              </Field>
              <Field label="Portrait URL">
                <Input value={form.portraitUrl?.startsWith("data:") ? "" : form.portraitUrl ?? ""} placeholder={form.portraitUrl?.startsWith("data:") ? "(uploaded image)" : "https://…"} onChange={(e) => setForm({ ...form, portraitUrl: e.target.value || null })} />
              </Field>
              <Field label="Max HP">
                <Input type="number" min={1} value={form.hpMax} onChange={(e) => setForm({ ...form, hpMax: Number(e.target.value) })} />
              </Field>
              <Field label="AC">
                <Input type="number" min={0} value={form.ac} onChange={(e) => setForm({ ...form, ac: Number(e.target.value) })} />
              </Field>
              <Field label="Speed (m)">
                <Input type="number" min={0} value={form.speed} onChange={(e) => setForm({ ...form, speed: Number(e.target.value) })} />
              </Field>
              <Field label="Disposition / visibility">
                <div className="flex gap-1">
                  <Select value={form.isEnemy ? "1" : "0"} onChange={(e) => setForm({ ...form, isEnemy: e.target.value === "1" })}>
                    <option value="1">hostile</option>
                    <option value="0">friendly</option>
                  </Select>
                  <Select value={form.visibleToPlayers ? "1" : "0"} onChange={(e) => setForm({ ...form, visibleToPlayers: e.target.value === "1" })}>
                    <option value="0">hidden</option>
                    <option value="1">visible</option>
                  </Select>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ATTRIBUTES.map((a) => (
                <div key={a} className="text-center">
                  <div className="font-display text-[0.6rem] tracking-widest" style={{ color: `var(--color-${ATTRIBUTE_META[a].color})` }}>
                    {ATTRIBUTE_META[a].short}
                  </div>
                  <NumberStepper value={form.attributes[a]} min={1} max={30} color={ATTRIBUTE_META[a].color} onChange={(v) => setForm({ ...form, attributes: { ...form.attributes, [a]: v } })} />
                </div>
              ))}
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Section title="Passive effects / resistances">
              <PassiveEffectListEditor value={form.effects} onChange={(v) => setForm({ ...form, effects: v })} />
            </Section>
            <Section title="Abilities">
              <div className="space-y-2">
                {form.abilities.map((ab, i) => (
                  <div key={i} className="hud-panel space-y-2 p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
                      <Input placeholder="Name" value={ab.name} onChange={(e) => setForm({ ...form, abilities: form.abilities.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <Input placeholder="Description (attack bonus, damage, save…)" value={ab.description} onChange={(e) => setForm({ ...form, abilities: form.abilities.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                      <Button size="xs" variant="ghost" icon="x" onClick={() => setForm({ ...form, abilities: form.abilities.filter((_, j) => j !== i) })} />
                    </div>
                    <InstantEffectListEditor value={ab.effects} onChange={(v) => setForm({ ...form, abilities: form.abilities.map((x, j) => (j === i ? { ...x, effects: v } : x)) })} conditionKeys={conditions.data ?? []} />
                  </div>
                ))}
                <Button size="sm" icon="plus" onClick={() => setForm({ ...form, abilities: [...form.abilities, { name: "", description: "", effects: [] }] })}>
                  Add ability
                </Button>
              </div>
            </Section>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
              <Button type="submit" variant="solid" color="crimson" icon="save" disabled={save.isPending}>
                Save NPC
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
