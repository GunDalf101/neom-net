import { ATTRIBUTES, ATTRIBUTE_META, type NpcDto, type NpcInput } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useConditionDefinitions, useDeleteNpc, useNpcs, useSaveNpc } from "@/api/hooks";
import { InstantEffectListEditor, PassiveEffectListEditor } from "@/components/editors/EffectEditors";
import { Portrait, PortraitPicker } from "@/components/hud/Portrait";
import { Badge, Button, ConfirmButton, Empty, Field, Input, NumberStepper, Panel, Select, Textarea } from "@/components/ui";
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
  const open = (n: NpcDto | "new") => {
    setEditing(n);
    setForm(n === "new" ? empty() : { ...n });
  };

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[360px_1fr]">
      <Panel title="NPCs & enemies" icon="users-round" color="crimson" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        {npcs.data?.length === 0 && <Empty>No NPCs yet.</Empty>}
        <div className="space-y-1">
          {npcs.data?.map((n) => (
            <button key={n.id} type="button" onClick={() => open(n)} className={clsx("hud-panel flex w-full items-center gap-2 p-2 text-left text-xs", editing !== "new" && editing?.id === n.id && "border-crimson")} style={{ ["--panel-accent" as string]: n.isEnemy ? "var(--color-crimson)" : "var(--color-ok)" }}>
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
          ))}
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
