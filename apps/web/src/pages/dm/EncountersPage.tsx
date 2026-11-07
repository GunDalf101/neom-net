import type { EncounterDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useAddParticipant, useCharacters, useConditionDefinitions, useCreateEncounter, useDeleteEncounter, useEncounter, useEncounterAction, useEncounters, useNpcs } from "@/api/hooks";
import { LiveControls } from "@/components/dm/LiveControls";
import { Portrait } from "@/components/hud/Portrait";
import { Badge, Bar, Button, ConfirmButton, Empty, Field, Input, Panel, Select, Spinner } from "@/components/ui";
import { useDm } from "./DmShell";

export function EncountersPage() {
  const { campaign } = useDm();
  const encounters = useEncounters(campaign.id);
  const create = useCreateEncounter(campaign.id);
  const del = useDeleteEncounter(campaign.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const active = encounters.data?.find((e) => e.status === "active");
  const sel = selectedId ?? active?.id ?? encounters.data?.[0]?.id ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_1fr]">
      <Panel
        title="Encounters"
        icon="swords"
        color="crimson"
        actions={
          <form
            className="flex gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              const enc = await create.mutateAsync({ name, description: "" });
              setName("");
              setSelectedId(enc.id);
            }}
          >
            <Input placeholder="New encounter…" value={name} onChange={(e) => setName(e.target.value)} className="!w-36 !py-1 text-xs" required />
            <Button size="xs" type="submit" icon="plus" />
          </form>
        }
      >
        {encounters.isLoading && <Spinner />}
        {encounters.data?.length === 0 && <Empty>No encounters yet.</Empty>}
        <div className="space-y-1">
          {encounters.data?.map((e) => (
            <button key={e.id} type="button" onClick={() => setSelectedId(e.id)} className={clsx("hud-panel flex w-full items-center justify-between p-2 text-left text-xs", sel === e.id && "border-crimson")} style={{ ["--panel-accent" as string]: e.status === "active" ? "var(--color-crimson)" : e.status === "ended" ? "var(--color-line-2)" : "var(--color-amber)" }}>
              <span>
                <span className="text-text">{e.name}</span>
                <span className="block text-dim">{e.participants.length} combatants{e.status === "active" ? ` · round ${e.round}` : ""}</span>
              </span>
              <Badge color={e.status === "active" ? "crimson" : e.status === "ended" ? "muted" : "amber"}>{e.status}</Badge>
            </button>
          ))}
        </div>
      </Panel>
      {sel ? <EncounterBoard key={sel} encounterId={sel} onDelete={() => { del.mutate(sel); setSelectedId(null); }} /> : <Empty>Create an encounter to begin.</Empty>}
    </div>
  );
}

function EncounterBoard({ encounterId, onDelete }: { encounterId: string; onDelete: () => void }) {
  const { campaign } = useDm();
  const enc = useEncounter(campaign.id, encounterId);
  const act = useEncounterAction(campaign.id);
  const add = useAddParticipant(campaign.id);
  const chars = useCharacters(campaign.id);
  const npcs = useNpcs(campaign.id);
  const conditions = useConditionDefinitions(campaign.id);
  const [charId, setCharId] = useState("");
  const [npcId, setNpcId] = useState("");
  const [count, setCount] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [controlId, setControlId] = useState<string | null>(null);

  if (enc.isLoading || !enc.data) return <Spinner />;
  const e: EncounterDto = enc.data;
  const run = (action: Parameters<typeof act.mutate>[0]["action"]) => act.mutate({ eid: e.id, action });
  const current = e.status === "active" ? e.participants[e.turnIndex] : undefined;

  return (
    <div className="space-y-3">
      <Panel
        title={
          <span>
            {e.name} {e.status === "active" && <span className="text-text">· Round {e.round}</span>}
          </span>
        }
        icon="swords"
        color="crimson"
        actions={
          <>
            {e.status === "planned" && (
              <>
                <Button size="xs" icon="dices" onClick={() => run({ action: "rollInitiative" })}>
                  Roll initiative
                </Button>
                <Button size="xs" variant="solid" color="ok" icon="play" onClick={() => run({ action: "start" })}>
                  Start
                </Button>
              </>
            )}
            {e.status === "active" && (
              <>
                <Button size="xs" icon="dices" onClick={() => run({ action: "rollInitiative" })}>
                  Roll missing init
                </Button>
                <Button size="xs" variant="ghost" icon="skip-back" onClick={() => run({ action: "previous" })} />
                <Button size="xs" variant="solid" color="cyan" icon="skip-forward" onClick={() => run({ action: "next" })}>
                  Next turn
                </Button>
                <ConfirmButton size="xs" label="End encounter" confirmLabel="End it?" color="crimson" variant="outline" onConfirm={() => run({ action: "end" })} />
              </>
            )}
            {e.status !== "active" && <ConfirmButton size="xs" label="Delete" onConfirm={onDelete} />}
          </>
        }
      >
        {e.description && <p className="mb-2 text-xs text-muted">{e.description}</p>}
        {e.participants.length === 0 && <Empty>No combatants. Add characters or NPCs below.</Empty>}
        <ol className="space-y-1">
          {e.participants.map((p, idx) => {
            const isCurrent = current?.id === p.id;
            return (
              <li key={p.id} className={clsx("hud-panel flex items-center gap-2 p-2 text-xs", isCurrent && "border-cyan")} style={{ ["--panel-accent" as string]: isCurrent ? "var(--color-cyan)" : p.isNpc ? "var(--color-crimson)" : "var(--color-blue)" }}>
                <span className="num w-6 text-center text-lg font-bold text-text">{idx + 1}</span>
                <Input type="number" key={`${p.id}-${p.initiative}`} defaultValue={p.initiative ?? ""} placeholder="—" className="num !w-14 !py-0.5 text-center" onBlur={(ev) => ev.target.value !== "" && Number(ev.target.value) !== p.initiative && run({ action: "setInitiative", participantId: p.id, initiative: Number(ev.target.value) })} title="Initiative" />
                <Portrait url={p.portraitUrl} name={p.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-text">{p.name}</span>
                    {p.isNpc ? <Badge color="crimson">NPC</Badge> : <Badge color="blue">PC</Badge>}
                    {p.hidden && <Badge color="muted">hidden</Badge>}
                    {isCurrent && <Badge color="cyan">current turn</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="num text-crimson">
                      {p.hpCurrent}/{p.hpMax}
                    </span>
                    <Bar value={p.hpCurrent} max={p.hpMax} color="crimson" className="w-28" height={5} />
                    <span className="num text-blue">AC {p.ac}</span>
                    {p.conditions.map((c) => (
                      <Badge key={c} color="amber">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {p.isNpc ? (
                    <>
                      <Button size="xs" color="crimson" onClick={() => run({ action: "npcDamage", participantId: p.id, amount: 5 })}>
                        −5
                      </Button>
                      <Button size="xs" color="crimson" onClick={() => run({ action: "npcDamage", participantId: p.id, amount: 1 })}>
                        −1
                      </Button>
                      <Button size="xs" color="ok" onClick={() => run({ action: "npcDamage", participantId: p.id, amount: -5 })}>
                        +5
                      </Button>
                      <Select className="!w-28 !py-0.5 text-[0.6rem]" value="" onChange={(ev) => ev.target.value && run({ action: "npcCondition", participantId: p.id, conditionKey: ev.target.value, remove: p.conditions.includes(ev.target.value) })}>
                        <option value="">condition…</option>
                        {conditions.data?.map((c) => (
                          <option key={c.key} value={c.name}>
                            {p.conditions.includes(c.name) ? "✓ " : ""}
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      <Button size="xs" variant="ghost" icon={p.hidden ? "eye" : "eye-off"} onClick={() => run({ action: "setHidden", participantId: p.id, hidden: !p.hidden })} title={p.hidden ? "Reveal" : "Hide from players"} />
                    </>
                  ) : (
                    <Button size="xs" color="cyan" icon="joystick" onClick={() => setControlId(controlId === p.characterId ? null : p.characterId)}>
                      Control
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" icon="x" onClick={() => run({ action: "removeParticipant", participantId: p.id })} aria-label="Remove" />
                </div>
              </li>
            );
          })}
        </ol>
        {e.status !== "ended" && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-2">
            <Field label="Add character">
              <Select value={charId} onChange={(ev) => setCharId(ev.target.value)} className="!w-44">
                <option value="">—</option>
                {chars.data?.filter((c) => !e.participants.some((p) => p.characterId === c.id)).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="sm" icon="user-plus" disabled={!charId} onClick={() => { add.mutate({ eid: e.id, body: { characterId: charId, hidden: false, count: 1 } }); setCharId(""); }}>
              Add
            </Button>
            <Field label="Add NPC">
              <Select value={npcId} onChange={(ev) => setNpcId(ev.target.value)} className="!w-44">
                <option value="">—</option>
                {npcs.data?.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Count">
              <Input type="number" min={1} max={10} value={count} onChange={(ev) => setCount(Number(ev.target.value))} className="num !w-16" />
            </Field>
            <label className="flex items-center gap-1 pb-2 text-xs text-muted">
              <input type="checkbox" checked={hidden} onChange={(ev) => setHidden(ev.target.checked)} /> hidden
            </label>
            <Button size="sm" icon="skull" color="crimson" disabled={!npcId} onClick={() => { add.mutate({ eid: e.id, body: { npcId, hidden, count } }); setNpcId(""); }}>
              Add NPC
            </Button>
          </div>
        )}
      </Panel>
      {controlId && <LiveControls campaignId={campaign.id} characterId={controlId} />}
    </div>
  );
}
