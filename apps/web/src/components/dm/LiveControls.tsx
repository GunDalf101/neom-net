import { DAMAGE_TYPES, type DamageType } from "@neom/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useApplyCondition,
  useCharacter,
  useConditionDefinitions,
  useCreateOverride,
  useCreateRollRequest,
  useDmGrant,
  useGrantItem,
  useHpAction,
  useItemAction,
  useItemDefinitions,
  useRemoveCondition,
  useRevokeOverride,
  useRules,
  useSendMessage,
  useTriggerRule,
  useUpdateCharacter,
} from "@/api/hooks";
import { ROLL_TARGETS, STAT_TARGETS, TargetSelect } from "@/components/editors/EffectEditors";
import { Badge, Bar, Button, Field, Icon, Input, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { HandOffLink } from "@/components/HandOffLink";
import { SendSheet } from "@/components/SendSheet";
import { fmtMod } from "@/lib/format";

type Tab = "hp" | "status" | "grant" | "override" | "comms" | "cyber";

export function LiveControls({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const view = useCharacter(characterId);
  const [tab, setTab] = useState<Tab>("hp");
  if (view.isLoading || !view.data) return <Spinner label="Loading character" />;
  const v = view.data;
  const { character: c, derived } = v;
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "hp", label: "HP", icon: "heart" },
    { id: "status", label: "Status", icon: "alert-triangle" },
    { id: "grant", label: "Grant", icon: "gift" },
    { id: "override", label: "Override", icon: "sliders-horizontal" },
    { id: "cyber", label: "Cyberware", icon: "cpu" },
    { id: "comms", label: "Comms", icon: "radio" },
  ];
  return (
    <Panel
      title={
        <span>
          Live control // <span className="text-text">{c.name}</span>
        </span>
      }
      icon="joystick"
      color="crimson"
      actions={
        <>
          <SendSheet view={v} compact />
          <HandOffLink view={v} compact />
          <Link to={`/c/${campaignId}/hud/${c.id}`} className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.55rem]">
            <Icon name="scan-face" size={12} /> Sheet
          </Link>
        </>
      }
    >
      <div className="mb-2 grid grid-cols-4 gap-2 text-xs sm:grid-cols-6">
        <Stat label="HP" value={`${c.hpCurrent}/${derived.maxHp.value}${c.hpTemp ? ` +${c.hpTemp}` : ""}`} color="crimson" />
        <Stat label="AC" value={String(derived.ac.value)} color="blue" overridden={Boolean(derived.ac.override)} />
        <Stat label="Init" value={fmtMod(derived.initiative.value)} color="crimson" />
        <Stat label="Speed" value={`${derived.speed.value} m`} color="crimson" />
        <Stat label="Cap" value={`${derived.capacityUsed}/${derived.capacity.value}`} color="cyan" />
        <Stat label="Level" value={`${c.level} · ${c.xp} xp`} color="muted" />
      </div>
      <Bar value={c.hpCurrent} max={derived.maxHp.value} color="crimson" className="mb-3" />
      <div className="mb-3 flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button key={t.id} className={`hud-tab !px-2 !py-1 !text-[0.55rem] ${tab === t.id ? "active danger" : ""}`} onClick={() => setTab(t.id)}>
            <span className="flex items-center gap-1">
              <Icon name={t.icon} size={11} /> {t.label}
            </span>
          </button>
        ))}
      </div>
      {tab === "hp" && <HpTab characterId={c.id} acBase={c.acBase} acBonus={c.acBonus} ac={derived.ac.value} />}
      {tab === "status" && <StatusTab campaignId={campaignId} view={v} />}
      {tab === "grant" && <GrantTab campaignId={campaignId} characterId={c.id} />}
      {tab === "override" && <OverrideTab campaignId={campaignId} view={v} />}
      {tab === "cyber" && <CyberTab view={v} />}
      {tab === "comms" && <CommsTab campaignId={campaignId} characterId={c.id} />}
    </Panel>
  );
}

function Stat({ label, value, color, overridden }: { label: string; value: string; color: string; overridden?: boolean }) {
  return (
    <div className="hud-clip-sm border border-line bg-bg-2 px-2 py-1">
      <div className="font-display text-[0.5rem] uppercase tracking-widest text-muted">{label}</div>
      <div className={`num text-sm font-bold ${overridden ? "text-amber" : ""}`} style={!overridden ? { color: `var(--color-${color})` } : undefined}>
        {value}
      </div>
    </div>
  );
}

function HpTab({ characterId, acBase, acBonus, ac }: { characterId: string; acBase: number; acBonus: number; ac: number }) {
  const hp = useHpAction(characterId);
  const update = useUpdateCharacter(characterId);
  const [amount, setAmount] = useState(6);
  const [type, setType] = useState<DamageType>("physical");
  const [ignore, setIgnore] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Amount">
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="num !w-20" />
        </Field>
        <Field label="Damage type">
          <Select value={type} onChange={(e) => setType(e.target.value as DamageType)} className="!w-32">
            {DAMAGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shock baton" className="!w-40" />
        </Field>
        <label className="flex items-center gap-1 pb-2 text-muted">
          <input type="checkbox" checked={ignore} onChange={(e) => setIgnore(e.target.checked)} /> ignore resistance
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button color="crimson" variant="solid" icon="sword" disabled={hp.isPending} onClick={() => hp.mutate({ action: "damage", amount, damageType: type, ignoreResistance: ignore, note: note || undefined })}>
          Apply damage
        </Button>
        <Button color="ok" icon="plus" onClick={() => hp.mutate({ action: "heal", amount, note: note || undefined })}>
          Heal
        </Button>
        <Button color="cyan" icon="shield-plus" onClick={() => hp.mutate({ action: "addTemp", amount: Math.max(1, amount) })}>
          Temp HP
        </Button>
        <Button variant="ghost" onClick={() => hp.mutate({ action: "rest", kind: "short" })}>
          Short rest
        </Button>
        <Button variant="ghost" onClick={() => hp.mutate({ action: "rest", kind: "long" })}>
          Long rest
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">Set base max HP</span>
        <Input type="number" min={1} className="num !w-20" placeholder="max" onKeyDown={(e) => e.key === "Enter" && hp.mutate({ action: "setMax", value: Number((e.target as HTMLInputElement).value) })} />
        <span className="text-dim">Enter to apply</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2">
        <span className="text-muted">Armor class</span>
        <span className="num font-bold text-blue">{ac}</span>
        <span className="text-dim">= base</span>
        <Input type="number" min={0} max={30} key={`b${acBase}`} defaultValue={acBase} className="num !w-16" title="Unarmored base AC (default 10)" onBlur={(e) => Number(e.target.value) !== acBase && update.mutate({ acBase: Number(e.target.value) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <span className="text-dim">+ DEX + gear + adjustment</span>
        <Input type="number" min={-20} max={20} key={`a${acBonus}`} defaultValue={acBonus} className="num !w-16" title="Flat DM adjustment" onBlur={(e) => Number(e.target.value) !== acBonus && update.mutate({ acBonus: Number(e.target.value) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </div>
    </div>
  );
}

function StatusTab({ campaignId, view }: { campaignId: string; view: NonNullable<ReturnType<typeof useCharacter>["data"]> }) {
  const defs = useConditionDefinitions(campaignId);
  const apply = useApplyCondition(view.character.id);
  const remove = useRemoveCondition(view.character.id);
  const [key, setKey] = useState("");
  const [turns, setTurns] = useState<number | "">("");
  const active = new Set(view.conditions.map((c) => c.key));
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1">
        {view.conditions.length === 0 && <span className="text-dim">No active conditions.</span>}
        {view.conditions.map((c) => (
          <button key={c.id} className="hud-btn !py-0.5 !text-[0.55rem]" style={{ ["--btn-color" as string]: `var(--color-${c.color})` }} onClick={() => remove.mutate(c.id)} title="Click to remove">
            {c.name}
            {c.remainingTurns !== null ? ` (${c.remainingTurns})` : ""} ✕
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Condition">
          <Select value={key} onChange={(e) => setKey(e.target.value)} className="!w-48">
            <option value="">— pick —</option>
            {defs.data?.map((d) => (
              <option key={d.key} value={d.key} disabled={active.has(d.key)}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Turns">
          <Input type="number" min={1} value={turns} placeholder="∞" onChange={(e) => setTurns(e.target.value === "" ? "" : Number(e.target.value))} className="num !w-16" />
        </Field>
        <Button color="crimson" icon="plus" disabled={!key} onClick={() => apply.mutate({ conditionKey: key, durationTurns: turns === "" ? null : turns })}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function GrantTab({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const grant = useDmGrant(campaignId);
  const items = useItemDefinitions(campaignId);
  const giveItem = useGrantItem(campaignId);
  const [resource, setResource] = useState<"xp" | "progressionPoints" | "credits">("xp");
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState("");
  const [defId, setDefId] = useState("");
  const [qty, setQty] = useState(1);
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Resource">
          <Select value={resource} onChange={(e) => setResource(e.target.value as typeof resource)} className="!w-40">
            <option value="xp">Experience</option>
            <option value="progressionPoints">Progression points</option>
            <option value="credits">Credits</option>
          </Select>
        </Field>
        <Field label="Amount (negative removes)">
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="num !w-24" />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="!w-40" />
        </Field>
        <Button variant="solid" color="amber" icon="gift" disabled={grant.isPending} onClick={() => grant.mutate({ characterId, resource, amount, note: note || undefined })}>
          Grant
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
        <Field label="Item definition">
          <Select value={defId} onChange={(e) => setDefId(e.target.value)} className="!w-64">
            <option value="">— pick —</option>
            {items.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.category})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Qty">
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="num !w-16" />
        </Field>
        <Button variant="solid" icon="package-plus" disabled={!defId || giveItem.isPending} onClick={() => giveItem.mutate({ characterId, definitionId: defId, quantity: qty })}>
          Give item
        </Button>
      </div>
    </div>
  );
}

function OverrideTab({ campaignId, view }: { campaignId: string; view: NonNullable<ReturnType<typeof useCharacter>["data"]> }) {
  const create = useCreateOverride(campaignId);
  const revoke = useRevokeOverride(campaignId);
  const [target, setTarget] = useState("ac");
  const [value, setValue] = useState(16);
  const [reason, setReason] = useState("");
  const [turns, setTurns] = useState<number | "">("");
  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted">Overrides replace a calculated value without touching base statistics. The original calculation stays visible in the breakdown.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Statistic">
          <div className="w-48">
            <TargetSelect value={target} onChange={setTarget} targets={STAT_TARGETS} />
          </div>
        </Field>
        <Field label="Value">
          <Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} className="num !w-20" />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="!w-44" />
        </Field>
        <Field label="Turns">
          <Input type="number" min={1} value={turns} placeholder="∞" onChange={(e) => setTurns(e.target.value === "" ? "" : Number(e.target.value))} className="num !w-16" />
        </Field>
        <Button variant="solid" color="amber" icon="sliders-horizontal" disabled={create.isPending} onClick={() => create.mutate({ characterId: view.character.id, target, value, reason: reason || undefined, durationTurns: turns === "" ? null : turns })}>
          Override
        </Button>
      </div>
      {view.overrides.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-2">
          {view.overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2">
              <span className="text-amber">
                {o.target} = {o.value} <span className="text-dim">(calculated {o.originalValue})</span> {o.reason && <span className="text-muted">— {o.reason}</span>}
                {o.remainingTurns !== null && <Badge color="amber" className="ml-1">{o.remainingTurns} turns</Badge>}
              </span>
              <Button size="xs" variant="ghost" icon="undo-2" onClick={() => revoke.mutate(o.id)}>
                Lift
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CyberTab({ view }: { view: NonNullable<ReturnType<typeof useCharacter>["data"]> }) {
  const act = useItemAction(view.character.id);
  const installed = view.items.filter((i) => i.installedSlot);
  return (
    <div className="space-y-1 text-xs">
      {installed.length === 0 && <span className="text-dim">No cyberware installed.</span>}
      {installed.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 border-b border-line/60 py-1">
          <span>
            <span className="text-text">{i.customName ?? i.definition.name}</span> <span className="text-dim">· {i.installedSlot}</span>
            <Badge color={i.status === "installed" ? "ok" : i.status === "damaged" ? "amber" : "crimson"} className="ml-2">
              {i.status}
            </Badge>
          </span>
          <span className="flex gap-1">
            {i.status !== "installed" && (
              <Button size="xs" color="ok" onClick={() => act.mutate({ itemId: i.id, action: { action: "setStatus", status: "installed" } })}>
                Repair
              </Button>
            )}
            {i.status !== "damaged" && (
              <Button size="xs" color="amber" onClick={() => act.mutate({ itemId: i.id, action: { action: "setStatus", status: "damaged" } })}>
                Damage
              </Button>
            )}
            {i.status !== "disabled" && (
              <Button size="xs" color="crimson" onClick={() => act.mutate({ itemId: i.id, action: { action: "setStatus", status: "disabled" } })}>
                Disable
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => act.mutate({ itemId: i.id, action: { action: "uninstall" } })}>
              Remove
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
}

function CommsTab({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const send = useSendMessage(campaignId);
  const request = useCreateRollRequest(campaignId);
  const trigger = useTriggerRule(campaignId);
  const rules = useRules(campaignId);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"whisper" | "reveal" | "broadcast">("whisper");
  const [target, setTarget] = useState("skill.perception");
  const [label, setLabel] = useState("Perception check");
  const [dc, setDc] = useState<number | "">(12);
  const [ruleId, setRuleId] = useState("");
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Request a roll">
          <div className="w-48">
            <TargetSelect value={target} onChange={(v) => { setTarget(v); setLabel(ROLL_TARGETS.find((t) => t.value === v)?.label ?? v); }} targets={ROLL_TARGETS} />
          </div>
        </Field>
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="!w-40" />
        </Field>
        <Field label="DC">
          <Input type="number" value={dc} onChange={(e) => setDc(e.target.value === "" ? "" : Number(e.target.value))} className="num !w-16" />
        </Field>
        <Button icon="bell-ring" color="amber" disabled={request.isPending} onClick={() => request.mutate({ characterId, target, label, dc: dc === "" ? undefined : dc })}>
          Request
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
        <Field label="Message" className="flex-1">
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="min-h-[48px]" placeholder="You notice the enforcer's badge is a forgery…" />
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="!w-32">
            <option value="whisper">Whisper</option>
            <option value="reveal">Reveal info</option>
            <option value="broadcast">Broadcast</option>
          </Select>
        </Field>
        <Button icon="send" disabled={!msg || send.isPending} onClick={() => { send.mutate({ characterId: kind === "broadcast" ? undefined : characterId, message: msg, kind }); setMsg(""); }}>
          Send
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
        <Field label="Trigger a rule manually">
          <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="!w-64">
            <option value="">— pick a published rule —</option>
            {rules.data?.filter((r) => r.publishedVersion).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button icon="zap" color="violet" disabled={!ruleId || trigger.isPending} onClick={() => trigger.mutate({ characterId, ruleId })}>
          Fire
        </Button>
      </div>
    </div>
  );
}
