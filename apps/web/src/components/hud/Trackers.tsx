import { describePassiveEffect, type CharacterView, type TrackerDto, type TrackerInput } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useChangeTracker, useUpdateCharacter } from "@/api/hooks";
import { PassiveEffectListEditor } from "@/components/editors/EffectEditors";
import { Badge, Button, ConfirmButton, Field, Icon, Input, Modal, Select } from "@/components/ui";

const COLORS = ["cyan", "amber", "violet", "crimson", "ok", "lime", "blue", "magenta"];
const blank = (): TrackerInput => ({ name: "", icon: "hash", color: "cyan", value: 0, max: null, playerEditable: false, resetOn: "never", note: "", milestones: [] });
/** Common starting points so the DM does not design from scratch. */
const PRESETS: { label: string; tracker: TrackerInput }[] = [
  { label: "Followers", tracker: { ...blank(), name: "Followers", icon: "megaphone", color: "magenta", note: "College of Propaganda: the audience you command." } },
  { label: "Resource pool", tracker: { ...blank(), name: "Ki", icon: "flame", color: "amber", value: 3, max: 3, playerEditable: true, resetOn: "short" } },
  { label: "Favours owed", tracker: { ...blank(), name: "Favours", icon: "handshake", color: "ok", playerEditable: false } },
];

/**
 * Custom trackers on the sheet: counters the DM attaches to one character for class or subclass features the app
 * does not model (a propaganda bard's followers, ki, favours). Rendered as rows under Inspiration.
 */
export function TrackerRows({ view }: { view: CharacterView }) {
  const c = view.character;
  const isDm = view.permissions.isDm;
  const change = useChangeTracker(c.id);
  const [editing, setEditing] = useState(false);
  if (c.trackers.length === 0 && !isDm) return null;
  return (
    <>
      {c.trackers.map((t) => {
        const canChange = isDm || (view.permissions.isOwner && t.playerEditable);
        const reached = t.milestones.filter((m) => t.value >= m.at);
        const next = t.milestones.find((m) => t.value < m.at);
        const sub = [t.max !== null ? `of ${t.max.toLocaleString()}` : null, next ? `next: ${next.label || "milestone"} at ${next.at.toLocaleString()}` : reached.length ? `${reached[reached.length - 1]!.label || "top milestone"} reached` : null, t.resetOn !== "never" ? `refills on a ${t.resetOn} rest` : null, t.note || null].filter(Boolean).join(" · ");
        const step = t.max !== null || t.value < 100 ? 1 : t.value < 1000 ? 10 : 100;
        return (
          <div key={t.id} className="flex items-center gap-3 border-b border-line/50 py-1.5 last:border-0" data-testid="tracker-row" data-tracker={t.name}>
            <span className="tile" style={{ ["--tile-color" as string]: `var(--color-${t.color})` }}>
              <Icon name={t.icon} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-display text-[0.8rem] font-bold uppercase tracking-[0.06em] text-text">
                <span className="truncate">{t.name}</span>
                {reached.map((m) => (
                  <Badge key={m.at} color={t.color} title={m.effects.length ? m.effects.map(describePassiveEffect).join(" · ") : `Reached at ${m.at.toLocaleString()}`}>
                    {m.label || `${m.at.toLocaleString()}+`}
                  </Badge>
                ))}
              </div>
              {sub && <div className="num truncate text-[0.68rem] text-muted" title={sub}>{sub}</div>}
            </div>
            <span className="flex shrink-0 items-center gap-1" data-testid="tracker-value">
              {canChange && (
                <button type="button" className="adj-btn" disabled={t.value <= 0 || change.isPending} onClick={() => change.mutate({ trackerId: t.id, delta: -step })} aria-label={`Lower ${t.name} by ${step}`}>
                  <Icon name="minus" size={10} />
                </button>
              )}
              {canChange ? (
                <input
                  key={`${t.id}-${t.value}`}
                  className="valbox !text-[1rem] w-20"
                  style={{ ["--val-color" as string]: `var(--color-${t.color})` }}
                  defaultValue={t.value}
                  inputMode="numeric"
                  aria-label={`${t.name} value`}
                  onBlur={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "")); if (Number.isFinite(n) && n !== t.value) change.mutate({ trackerId: t.id, value: n }); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span className="num text-[1.1rem] font-bold leading-none" style={{ color: `var(--color-${t.color})` }}>{t.value.toLocaleString()}</span>
              )}
              {t.max !== null && <span className="num text-[0.75rem] text-muted">/ {t.max.toLocaleString()}</span>}
              {canChange && (
                <button type="button" className="adj-btn" disabled={(t.max !== null && t.value >= t.max) || change.isPending} onClick={() => change.mutate({ trackerId: t.id, delta: step })} aria-label={`Raise ${t.name} by ${step}`}>
                  <Icon name="plus" size={10} />
                </button>
              )}
            </span>
          </div>
        );
      })}
      {isDm && (
        <div className="flex items-center justify-between gap-2 border-b border-line/50 py-1.5 text-[0.6rem] text-muted" data-testid="tracker-dm">
          <span>
            <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span> custom trackers: followers, class resources, favours…
          </span>
          <button type="button" className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.5rem]" onClick={() => setEditing(true)} data-testid="tracker-manage">
            <Icon name="sliders-horizontal" size={10} /> {c.trackers.length ? "Manage trackers" : "Add a tracker"}
          </button>
        </div>
      )}
      {isDm && editing && <TrackerEditor view={view} onClose={() => setEditing(false)} />}
    </>
  );
}

function TrackerEditor({ view, onClose }: { view: CharacterView; onClose: () => void }) {
  const update = useUpdateCharacter(view.character.id);
  const [list, setList] = useState<(TrackerInput | TrackerDto)[]>(view.character.trackers);
  const [open, setOpen] = useState<number | null>(view.character.trackers.length ? 0 : null);
  const patch = (i: number, p: Partial<TrackerInput>) => setList((l) => l.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const add = (t: TrackerInput) => { setList((l) => [...l, t]); setOpen(list.length); };
  const valid = list.every((t) => t.name.trim());
  return (
    <Modal open onClose={onClose} title={`Trackers · ${view.character.name}`} color="crimson" width="max-w-2xl">
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted">Add:</span>
          {PRESETS.map((p) => (
            <Button key={p.label} size="xs" icon="plus" onClick={() => add({ ...p.tracker })}>
              {p.label}
            </Button>
          ))}
          <Button size="xs" variant="ghost" icon="plus" onClick={() => add(blank())}>
            Blank
          </Button>
        </div>
        {list.length === 0 && <div className="py-4 text-center text-dim">No trackers on this sheet yet.</div>}
        {list.map((t, i) => (
          <div key={i} className="hud-panel p-2" style={{ ["--panel-accent" as string]: `var(--color-${t.color})` }} data-testid="tracker-form">
            <div className="flex items-center gap-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === i ? null : i)}>
                <Icon name={t.icon} size={14} style={{ color: `var(--color-${t.color})` }} />
                <span className="truncate font-semibold text-text">{t.name || "Unnamed tracker"}</span>
                <span className="num text-muted">
                  {t.value.toLocaleString()}
                  {t.max !== null ? ` / ${t.max.toLocaleString()}` : ""}
                </span>
                <Icon name={open === i ? "chevron-up" : "chevron-down"} size={12} className="text-muted" />
              </button>
              <ConfirmButton size="xs" label="Remove" confirmLabel="Remove?" onConfirm={() => { setList((l) => l.filter((_, j) => j !== i)); setOpen(null); }} />
            </div>
            {open === i && (
              <div className="mt-2 space-y-2 border-t border-line/50 pt-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="Name" className="col-span-2">
                    <Input value={t.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Followers" />
                  </Field>
                  <Field label="Icon (lucide)">
                    <Input value={t.icon} onChange={(e) => patch(i, { icon: e.target.value })} />
                  </Field>
                  <Field label="Colour">
                    <Select value={t.color} onChange={(e) => patch(i, { color: e.target.value })}>
                      {COLORS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Value">
                    <Input type="number" min={0} value={t.value} onChange={(e) => patch(i, { value: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                  <Field label="Maximum" hint="Blank = no ceiling">
                    <Input type="number" min={1} value={t.max ?? ""} placeholder="∞" onChange={(e) => patch(i, { max: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })} />
                  </Field>
                  <Field label="Who changes it">
                    <Select value={t.playerEditable ? "1" : "0"} onChange={(e) => patch(i, { playerEditable: e.target.value === "1" })}>
                      <option value="0">DM only</option>
                      <option value="1">Player and DM</option>
                    </Select>
                  </Field>
                  <Field label="Refills">
                    <Select value={t.resetOn} onChange={(e) => patch(i, { resetOn: e.target.value as TrackerInput["resetOn"] })}>
                      <option value="never">Never</option>
                      <option value="short">Short rest</option>
                      <option value="long">Long rest</option>
                    </Select>
                  </Field>
                  <Field label="Note on the sheet" className="col-span-2 sm:col-span-4">
                    <Input value={t.note} onChange={(e) => patch(i, { note: e.target.value })} placeholder="What it is, in a few words" />
                  </Field>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted">Milestones: effects that switch on at a count</span>
                    <Button size="xs" variant="ghost" icon="plus" onClick={() => patch(i, { milestones: [...t.milestones, { at: (t.milestones[t.milestones.length - 1]?.at ?? 0) + 1000, label: "", effects: [] }] })}>
                      Milestone
                    </Button>
                  </div>
                  {t.milestones.map((m, k) => (
                    <div key={k} className={clsx("space-y-1.5 border border-line/60 p-2", t.value >= m.at && "border-ok/60")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted">at</span>
                        <Input type="number" min={1} value={m.at} className="num !w-28 !py-1" aria-label="Milestone threshold" onChange={(e) => patch(i, { milestones: t.milestones.map((x, j) => (j === k ? { ...x, at: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
                        <Input value={m.label} placeholder="label (Local celebrity)" className="!w-48 !py-1" aria-label="Milestone label" onChange={(e) => patch(i, { milestones: t.milestones.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} />
                        {t.value >= m.at && <Badge color="ok">active</Badge>}
                        <Button size="xs" variant="ghost" icon="x" className="ml-auto" onClick={() => patch(i, { milestones: t.milestones.filter((_, j) => j !== k) })} />
                      </div>
                      <PassiveEffectListEditor value={m.effects} onChange={(v) => patch(i, { milestones: t.milestones.map((x, j) => (j === k ? { ...x, effects: v } : x)) })} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" color="crimson" icon="save" disabled={!valid || update.isPending} onClick={async () => { await update.mutateAsync({ trackers: list as TrackerInput[] }); onClose(); }} data-testid="tracker-save">
            Save trackers
          </Button>
        </div>
      </div>
    </Modal>
  );
}
