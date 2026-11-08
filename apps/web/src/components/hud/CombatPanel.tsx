import { DAMAGE_TYPES, xpForLevel, type CharacterView, type DamageType } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useClearEffect, useHpAction, useRoll, useUpdateCharacter } from "@/api/hooks";
import { Badge, Bar, Button, Icon, Select } from "@/components/ui";
import { StatBreakdown } from "@/components/StatBreakdown";
import { fmtMod } from "@/lib/format";
import { breakdownText } from "@/lib/hud";
import { useUi } from "@/store/ui";
import { ConditionsPanel } from "./ConditionsPanel";

type Tab = "combat" | "status";

export function CombatPanel({ view }: { view: CharacterView }) {
  const [tab, setTab] = useState<Tab>("combat");
  return (
    <section className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-crimson)" }}>
      <div className="seg mb-2 w-72 max-w-full">
        <button className={clsx(tab === "combat" && "active")} onClick={() => setTab("combat")}>
          Combat
        </button>
        <button className={clsx(tab === "status" && "active")} onClick={() => setTab("status")}>
          Status
        </button>
      </div>
      {tab === "combat" ? <CombatTab view={view} /> : <StatusTab view={view} />}
    </section>
  );
}

function Row({ icon, color, label, sub, children, className }: { icon: string; color: string; label: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3 border-b border-line/50 py-1.5 last:border-0", className)}>
      <span className="tile" style={{ ["--tile-color" as string]: color }}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[0.8rem] font-bold uppercase tracking-[0.06em] text-text">{label}</div>
        {sub && <div className="num truncate text-[0.68rem] text-muted" title={sub}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/** Small signed integer box: type, then blur / Enter to commit. */
function IntBox({ value, min, max, onCommit, signed, title }: { value: number; min: number; max: number; onCommit: (v: number) => void; signed?: boolean; title?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (signed ? fmtMod(value) : String(value));
  return (
    <input
      className="valbox w-12 !text-[0.85rem]"
      value={shown}
      inputMode="numeric"
      title={title}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9-]/g, ""))}
      onBlur={() => {
        const n = Number(draft);
        if (draft !== null && draft !== "" && Number.isInteger(n) && n >= min && n <= max && n !== value) onCommit(n);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function CombatTab({ view }: { view: CharacterView }) {
  const { character: c, derived, permissions } = view;
  const hp = useHpAction(c.id);
  const update = useUpdateCharacter(c.id);
  const roll = useRoll(c.campaignId);
  const mode = useUi((s) => s.rollMode);
  const visibility = useUi((s) => s.rollVisibility);
  const [amount, setAmount] = useState(5);
  const [dmg, setDmg] = useState<DamageType>("physical");
  const [tempAmt, setTempAmt] = useState(5);
  const maxHp = derived.maxHp.value;
  const canEdit = permissions.canEdit;
  const nextXp = xpForLevel(Math.min(20, c.level + 1));
  const hitDiceLeft = c.level - c.hitDiceUsed;
  const num = (v: number, set: (n: number) => void, w = "w-12") => (
    <input className={clsx("valbox !text-[0.95rem]", w)} value={v} inputMode="numeric" onChange={(e) => set(Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))} />
  );

  return (
    <div>
      {/* Level */}
      <div className="flex items-center gap-3 pb-2">
        <span className="font-display text-[1.1rem] font-bold uppercase tracking-[0.1em] text-cyan">
          Level <span className="ml-1 text-[1.5rem] text-text">{c.level}</span>
        </span>
        <div className="flex-1">
          <div className="num mb-1 text-right text-[0.7rem] text-text/80">
            {c.xp.toLocaleString()} / {nextXp.toLocaleString()} XP
          </div>
          <Bar value={c.xp - xpForLevel(c.level)} max={Math.max(1, nextXp - xpForLevel(c.level))} color="cyan" height={7} />
        </div>
      </div>

      {/* HP */}
      <div className="hud-panel lit p-2" style={{ ["--panel-accent" as string]: "var(--color-crimson)" }}>
        <div className="flex items-center gap-3">
          <span className="tile" style={{ ["--tile-color" as string]: "var(--color-crimson)" }}>
            <Icon name="heart" size={20} />
          </span>
          <span className="font-display text-[0.95rem] font-bold tracking-[0.1em] text-crimson">HP</span>
          <StatBreakdown stat={derived.maxHp} label="Max HP" format={(n) => String(n)} className="ml-auto">
            <span className="num text-[1.6rem] font-black leading-none">
              <span className={clsx(c.hpCurrent === 0 && "text-crimson", c.hpCurrent > 0 && c.hpCurrent <= maxHp / 4 && "text-amber")}>{c.hpCurrent}</span>
              <span className="text-text/60"> / {maxHp}</span>
              {c.hpTemp > 0 && <span className="ml-1 text-[0.9rem] text-cyan">+{c.hpTemp}</span>}
            </span>
          </StatBreakdown>
        </div>
        <Bar value={c.hpCurrent} max={maxHp} color={c.hpCurrent <= maxHp * 0.3 ? "amber" : "crimson"} className="mt-1.5" height={9} />
        {c.hpTemp > 0 && <Bar value={c.hpTemp} max={maxHp} color="cyan" className="mt-0.5" height={4} />}
        {canEdit && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {num(amount, setAmount)}
            <Select value={dmg} onChange={(e) => setDmg(e.target.value as DamageType)} className="!w-28 !py-1 text-xs">
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <button type="button" className="hud-btn !px-2.5 !py-1.5" style={{ ["--btn-color" as string]: "var(--color-crimson)" }} disabled={hp.isPending} onClick={() => hp.mutate({ action: "damage", amount, damageType: dmg })}>
              <Icon name="minus" size={12} /> Damage
            </button>
            <button type="button" className="hud-btn !px-2.5 !py-1.5" style={{ ["--btn-color" as string]: "var(--color-ok)" }} disabled={hp.isPending} onClick={() => hp.mutate({ action: "heal", amount })}>
              <Icon name="plus" size={12} /> Heal
            </button>
            <span className="ml-auto flex items-center gap-1 border border-line-2 px-2 py-1">
              <span className="text-[0.65rem] uppercase tracking-wider text-muted">Temp HP</span>
              {num(tempAmt, setTempAmt, "w-10")}
              <button type="button" className="text-cyan hover:text-text" title="Add temporary HP" onClick={() => hp.mutate({ action: "addTemp", amount: Math.max(1, tempAmt) })}>
                <Icon name="square-plus" size={18} />
              </button>
              {c.hpTemp > 0 && (
                <button type="button" className="text-dim hover:text-text" title="Clear temporary HP" onClick={() => hp.mutate({ action: "clearTemp" })}>
                  <Icon name="square-x" size={18} />
                </button>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="mt-1">
        <Row icon="shield" color="var(--color-blue)" label="Armor class" sub={breakdownText(derived.ac)}>
          <StatBreakdown stat={derived.ac} label="Armor class" format={(n) => String(n)}>
            <span className={clsx("num text-[1.35rem] font-bold", derived.ac.override && "text-amber")}>{derived.ac.value}</span>
          </StatBreakdown>
        </Row>
        {permissions.isDm && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/50 py-1 pl-1 text-[0.65rem] text-muted" title="DM only: unarmored base AC and a flat adjustment. Armor, cyberware and conditions still add on top.">
            <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span>
            <span>base AC</span>
            <IntBox value={c.acBase} min={0} max={30} onCommit={(v) => update.mutate({ acBase: v })} title="Unarmored base AC (default 10)" />
            <span>adjust</span>
            <IntBox value={c.acBonus} min={-20} max={20} signed onCommit={(v) => update.mutate({ acBonus: v })} title="Flat AC adjustment" />
            {c.acBonus !== 0 && (
              <button type="button" className="text-dim hover:text-text" onClick={() => update.mutate({ acBonus: 0 })}>
                clear
              </button>
            )}
          </div>
        )}
        <Row icon="fast-forward" color="var(--color-crimson)" label="Initiative" sub={breakdownText(derived.initiative)}>
          <StatBreakdown stat={derived.initiative} label="Initiative">
            <span className={clsx("num text-[1.35rem] font-bold", derived.initiative.override && "text-amber")}>{fmtMod(derived.initiative.value)}</span>
          </StatBreakdown>
          <button type="button" className="hud-btn !px-4 !py-1.5" onClick={() => roll.mutate({ characterId: c.id, target: "initiative", category: "initiative", label: "Initiative", mode, visibility })}>
            Roll
          </button>
        </Row>
        <Row icon="footprints" color="var(--color-crimson)" label="Movement" sub={breakdownText(derived.speed, { unit: " m" })}>
          <StatBreakdown stat={derived.speed} label="Movement" format={(n) => `${n} m`}>
            <span className={clsx("num text-[1.35rem] font-bold", derived.speed.override && "text-amber")}>
              {derived.speed.value} <span className="text-[0.8rem] text-text/70">m</span>
            </span>
          </StatBreakdown>
        </Row>
        <Row icon="dice-6" color="var(--color-crimson)" label="Hit dice" sub={`${hitDiceLeft} of ${c.level} available`}>
          <span className="num text-[1.1rem] font-bold">
            {c.level}d{c.hitDieSize}
          </span>
          <span className="flex gap-1">
            {Array.from({ length: Math.min(10, c.level) }).map((_, i) => (
              <span key={i} className={clsx("h-3.5 w-3.5 rounded-full border", i < hitDiceLeft ? "border-cyan bg-cyan/70 shadow-[0_0_6px_var(--color-cyan)]" : "border-line-2")} />
            ))}
          </span>
          {canEdit && (
            <button type="button" className="hud-btn !px-2 !py-1 !text-[0.55rem]" disabled={hitDiceLeft <= 0} onClick={() => hp.mutate({ action: "hitDice", op: "spend", count: 1 })}>
              Spend
            </button>
          )}
        </Row>
        <Row icon="brain-circuit" color="var(--color-violet)" label="Cyberpsychosis" sub={`${derived.cyberpsychosis.current} / ${derived.cyberpsychosis.max} · ${derived.cyberpsychosis.fromCyberware} from cyberware${derived.cyberpsychosis.points ? ` + ${derived.cyberpsychosis.points} pts` : ""}`} className="!items-start">
          <div className="flex w-36 flex-col items-end gap-1">
            <StatBreakdown stat={derived.cyberpsychosisMax} label="Cyberpsychosis threshold" format={(n) => String(n)}>
              <span className={clsx("num text-[1.35rem] font-bold leading-none", derived.cyberpsychosis.percent >= 100 ? "text-crimson" : derived.cyberpsychosis.percent >= 75 ? "text-amber" : "text-violet")}>
                {derived.cyberpsychosis.percent}%
              </span>
            </StatBreakdown>
            <Bar value={Math.min(derived.cyberpsychosis.current, derived.cyberpsychosis.max)} max={derived.cyberpsychosis.max} color={derived.cyberpsychosis.percent >= 100 ? "crimson" : derived.cyberpsychosis.percent >= 75 ? "amber" : "violet"} className="w-full" height={6} />
            {permissions.isDm && (
              <span className="flex items-center gap-1 text-[0.6rem] text-muted" title="DM: cyberpsychosis points from trauma, botched installs, etc. Cyberware load is added automatically.">
                <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span> pts
                <IntBox value={c.cyberpsychosis} min={0} max={999} onCommit={(v) => update.mutate({ cyberpsychosis: v })} title="Cyberpsychosis points" />
              </span>
            )}
          </div>
        </Row>
        <Row icon="sparkle" color="var(--color-amber)" label="Inspiration" sub={`₭ ${c.credits.toLocaleString()} kamas · ${c.progressionPoints} pts`}>
          <button type="button" disabled={!canEdit} onClick={() => update.mutate({ inspiration: !c.inspiration })} className="flex items-center" title="Inspiration">
            <span className={clsx("sq-check h-5 w-5", c.inspiration && "on")} style={{ ["--check-color" as string]: "var(--color-amber)" }} />
          </button>
          {canEdit && (
            <span className="ml-auto flex gap-1">
              <button type="button" className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.5rem]" onClick={() => hp.mutate({ action: "rest", kind: "short" })}>
                Short rest
              </button>
              <button type="button" className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.5rem]" onClick={() => hp.mutate({ action: "rest", kind: "long" })}>
                Long rest
              </button>
            </span>
          )}
        </Row>
      </div>

      {/* Death saves */}
      <div className="hud-panel mt-2 flex items-center gap-3 p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <span className="tile" style={{ ["--tile-color" as string]: "var(--color-cyan)" }}>
          <Icon name="shield-alert" size={20} />
        </span>
        <div className="flex-1">
          <div className="font-display text-[0.8rem] font-bold uppercase tracking-[0.06em] text-text">Death saves</div>
          {canEdit && (
            <div className="mt-0.5 flex gap-1">
              <button type="button" className="hud-btn !px-2 !py-0.5 !text-[0.5rem]" onClick={() => roll.mutate({ characterId: c.id, target: "deathSave", category: "deathSave", label: "Death save", mode, visibility })}>
                <Icon name="dices" size={10} /> Roll
              </button>
              <button type="button" className="hud-btn hud-btn-ghost !px-2 !py-0.5 !text-[0.5rem]" onClick={() => hp.mutate({ action: "deathSave", result: "reset" })}>
                Reset
              </button>
            </div>
          )}
        </div>
        <div className="space-y-1 text-[0.72rem]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text/80">Successes</span>
            <Dots filled={c.deathSaveSuccess} color="var(--color-ok)" onAdd={canEdit ? () => hp.mutate({ action: "deathSave", result: "success" }) : undefined} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text/80">Failures</span>
            <Dots filled={c.deathSaveFailure} color="var(--color-crimson)" onAdd={canEdit ? () => hp.mutate({ action: "deathSave", result: "failure" }) : undefined} />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <ConditionsPanel view={view} />
      </div>
    </div>
  );
}

function Dots({ filled, color, onAdd }: { filled: number; color: string; onAdd?: () => void }) {
  return (
    <button type="button" onClick={onAdd} disabled={!onAdd} className="flex gap-1.5" title={onAdd ? "Click to mark one" : undefined}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-3.5 w-3.5 rounded-full border" style={i < filled ? { background: color, borderColor: color, boxShadow: `0 0 6px ${color}` } : { borderColor: color }} />
      ))}
    </button>
  );
}

function StatusTab({ view }: { view: CharacterView }) {
  const { derived, permissions } = view;
  const clearEffect = useClearEffect(view.character.id);
  return (
    <div className="space-y-2 text-sm">
      <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1">Active effects</div>
        {view.activeEffects.length === 0 && <div className="text-xs text-dim">No temporary effects.</div>}
        {view.activeEffects.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 border-b border-line/50 py-1 text-xs last:border-0">
            <span className="truncate">
              <span className="text-cyan">{e.label}</span>
              <span className="text-dim"> · {e.effects.map((x) => (x.kind === "modifier" ? `${x.target} ${fmtMod(x.value)}` : x.kind)).join(", ") || "timer"}</span>
            </span>
            <span className="flex items-center gap-1">
              <Badge color="cyan">{e.remainingTurns === null ? "until cleared" : `${e.remainingTurns} turn${e.remainingTurns === 1 ? "" : "s"}`}</Badge>
              {permissions.isDm && <Button size="xs" variant="ghost" icon="x" onClick={() => clearEffect.mutate(e.id)} aria-label="Clear" />}
            </span>
          </div>
        ))}
      </div>
      {view.overrides.length > 0 && (
        <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
          <div className="hud-title mb-1 text-amber">DM overrides</div>
          {view.overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-xs text-amber">
              <span>
                {o.target} = {o.value} <span className="text-dim">(calculated {o.originalValue})</span> {o.reason && <span className="text-muted">— {o.reason}</span>}
              </span>
              {o.remainingTurns !== null && <Badge color="amber">{o.remainingTurns} turns</Badge>}
            </div>
          ))}
        </div>
      )}
      <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-violet)" }}>
        <div className="hud-title mb-1 text-violet">Resistances, senses & traits</div>
        <div className="flex flex-wrap gap-1">
          {derived.resistances.map((r, i) => (
            <Badge key={`r${i}`} color={r.level === "vulnerability" ? "crimson" : r.level === "immunity" ? "amber" : "cyan"}>
              {r.level === "resistance" ? "RES" : r.level === "immunity" ? "IMM" : "VUL"} {r.damageType}
            </Badge>
          ))}
          {derived.senses.map((s, i) => (
            <Badge key={`s${i}`} color="violet">
              {s.name}
              {s.rangeMeters ? ` ${s.rangeMeters} m` : ""}
            </Badge>
          ))}
          {derived.traits.map((t, i) => (
            <span key={i} title={`${t.description ?? ""} (${t.sourceName})`}>
              <Badge color="muted">{t.name}</Badge>
            </span>
          ))}
          {derived.resistances.length + derived.senses.length + derived.traits.length === 0 && <span className="text-xs text-dim">Nothing granted yet.</span>}
        </div>
      </div>
      {derived.rollFlags.length > 0 && (
        <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-ok)" }}>
          <div className="hud-title mb-1 text-ok">Roll modifiers</div>
          {derived.rollFlags.map((f, i) => (
            <div key={i} className="text-xs">
              <span className={f.mode === "advantage" ? "text-ok" : "text-crimson"}>{f.mode === "advantage" ? "Advantage" : "Disadvantage"}</span> on {f.on} <span className="text-dim">— {f.sourceName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
