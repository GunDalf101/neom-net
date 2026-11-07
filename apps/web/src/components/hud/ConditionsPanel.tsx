import type { CharacterView } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useApplyCondition, useConditionDefinitions, useRemoveCondition } from "@/api/hooks";
import { Icon, Input } from "@/components/ui";
import { accent } from "@/lib/format";

const CYBER_KEYS = new Set(["hacked", "cyberwareMalfunction", "mentalStrain", "exhaustion"]);

function SqCheck({ on, color, onChange, disabled, label, title }: { on: boolean; color: string; onChange?: () => void; disabled?: boolean; label: React.ReactNode; title?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onChange} title={title} className={clsx("inline-flex items-center gap-1.5 text-[0.8rem] text-text/85", disabled && "cursor-default")}>
      <span className={clsx("sq-check", on && "on")} style={{ ["--check-color" as string]: color }} />
      {label}
    </button>
  );
}

function Meter({ filled, max = 4, color }: { filled: number; max?: number; color: string }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className="h-3 w-3 border" style={i < filled ? { background: color, borderColor: color, boxShadow: `0 0 5px ${color}` } : { borderColor: "var(--color-line-2)" }} />
      ))}
    </span>
  );
}

export function ConditionsPanel({ view }: { view: CharacterView }) {
  const { character: c, permissions } = view;
  const defs = useConditionDefinitions(c.campaignId);
  const apply = useApplyCondition(c.id);
  const remove = useRemoveCondition(c.id);
  const [duration, setDuration] = useState<number | "">("");
  const active = new Map(view.conditions.map((x) => [x.key, x]));
  const canEdit = permissions.canEdit;

  const toggle = (key: string) => {
    const existing = active.get(key);
    if (existing) remove.mutate(existing.id);
    else apply.mutate({ conditionKey: key, durationTurns: duration === "" ? null : duration });
  };

  const all = defs.data ?? [];
  const dnd = all.filter((d) => d.builtin && !CYBER_KEYS.has(d.key));
  const cyber = all.filter((d) => CYBER_KEYS.has(d.key) || !d.builtin);

  return (
    <div className="grid grid-cols-1 gap-2 @md:grid-cols-[1.15fr_1fr]">
      <section className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1.5 text-text">Conditions</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 @md:grid-cols-2 @sm:grid-cols-3">
          {dnd.map((d) => {
            const on = active.get(d.key);
            return (
              <SqCheck key={d.key} on={Boolean(on)} color="var(--color-crimson)" disabled={!canEdit} onChange={() => toggle(d.key)} title={d.description} label={<span className={clsx(on && "text-crimson")}>{d.name}{on?.remainingTurns !== null && on ? <span className="text-dim"> ({on.remainingTurns})</span> : null}</span>} />
            );
          })}
        </div>
        {canEdit && (
          <div className="mt-2 flex items-center gap-1 border-t border-line/50 pt-1.5 text-[0.65rem] text-muted">
            New conditions last
            <Input type="number" min={1} placeholder="∞" value={duration} onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))} className="num !w-12 !py-0.5 text-center" />
            turns
          </div>
        )}
      </section>
      <section className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1.5 text-text">Cyberpunk status</div>
        <div className="space-y-1">
          {cyber.map((d) => {
            const on = active.get(d.key);
            const color = d.builtin ? "var(--color-cyan)" : accent(d.color);
            const level = on?.level ?? 0;
            return (
              <div key={d.key} className="flex items-center justify-between gap-2" title={d.description}>
                <SqCheck on={Boolean(on)} color={color} disabled={!canEdit} onChange={() => toggle(d.key)} label={<span className={clsx(on && "text-text")}>{d.name}</span>} />
                <span className="flex items-center gap-1">
                  {d.key === "exhaustion" ? (
                    <>
                      <Meter filled={level} max={6} color="var(--color-amber)" />
                      {on && canEdit && (
                        <button type="button" className="text-dim hover:text-amber" onClick={() => apply.mutate({ conditionKey: "exhaustion", level: Math.min(10, level + 1) })} aria-label="Increase exhaustion">
                          <Icon name="plus" size={12} />
                        </button>
                      )}
                    </>
                  ) : (
                    <Meter filled={on ? (on.remainingTurns !== null ? Math.min(4, Math.max(1, on.remainingTurns)) : 4) : 0} color={color} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
