import type { MissionDto, MissionInput } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useCharacters, useItemDefinitions, useMissionOp, useMissions, useSaveMission } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Empty, Field, Input, Panel, Select, Textarea } from "@/components/ui";
import { JournalBoard } from "@/pages/hud/JournalPage";
import { useDm } from "./DmShell";

const empty = (): MissionInput => ({ name: "", description: "", objectives: [], status: "available", rewards: { xp: 0, credits: 0, progressionPoints: 0, itemDefinitionIds: [] }, assignedCharacterIds: [], visibleToPlayers: true, assignedOnly: false });

export function DmMissionsPage() {
  const { campaign, me } = useDm();
  const [tab, setTab] = useState<"missions" | "journal">("missions");
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <button className={clsx("hud-tab", tab === "missions" && "active danger")} onClick={() => setTab("missions")}>
          Missions
        </button>
        <button className={clsx("hud-tab", tab === "journal" && "active danger")} onClick={() => setTab("journal")}>
          Lore & journal
        </button>
      </div>
      {tab === "missions" ? <MissionsBoard /> : <JournalBoard campaignId={campaign.id} meId={me.id} isDm />}
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
  const [editing, setEditing] = useState<MissionDto | "new" | null>(null);
  const [form, setForm] = useState<MissionInput>(empty());
  const open = (m: MissionDto | "new") => {
    setEditing(m);
    setForm(m === "new" ? empty() : { name: m.name, description: m.description, objectives: m.objectives, status: m.status, rewards: m.rewards, assignedCharacterIds: m.assignedCharacterIds, visibleToPlayers: m.visibleToPlayers, assignedOnly: m.assignedOnly });
  };
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[380px_1fr]">
      <Panel title="Missions" icon="target" color="amber" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        {missions.data?.length === 0 && <Empty>No missions.</Empty>}
        <div className="space-y-1">
          {missions.data?.map((m) => (
            <button key={m.id} type="button" onClick={() => open(m)} className="hud-panel flex w-full items-center justify-between p-2 text-left text-xs" style={{ ["--panel-accent" as string]: `var(--color-${{ available: "cyan", active: "amber", completed: "ok", failed: "crimson" }[m.status]})` }}>
              <span>
                <span className="text-text">{m.name}</span>
                <span className="block text-dim">
                  {m.objectives.filter((o) => o.done).length}/{m.objectives.length} objectives · {m.assignedCharacterIds.length} assigned{!m.visibleToPlayers ? " · hidden" : m.assignedOnly ? " · crew only" : ""}
                </span>
              </span>
              <Badge color={{ available: "cyan", active: "amber", completed: "ok", failed: "crimson" }[m.status]}>{m.status}</Badge>
            </button>
          ))}
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Name" className="md:col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
              <Field label="Visible to" hint={form.visibleToPlayers && form.assignedOnly ? "Only players whose character is in the crew below see it and get notified" : form.visibleToPlayers ? "Every player sees it" : "DM only until you reveal it"}>
                <Select
                  value={!form.visibleToPlayers ? "dm" : form.assignedOnly ? "crew" : "all"}
                  onChange={(e) => setForm({ ...form, visibleToPlayers: e.target.value !== "dm", assignedOnly: e.target.value === "crew" })}
                >
                  <option value="all">all players</option>
                  <option value="crew">assigned crew only</option>
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
              <div className="hud-title mb-1 text-[0.6rem]">Assigned characters</div>
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
