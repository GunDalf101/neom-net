import { REPUTATION_MAX, REPUTATION_MIN, REPUTATION_TIER_META, reputationTier, type FactionDto, type ReputationEntryDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useChangeReputation, useDeleteFaction, useEvents, useReputation, useSaveFaction } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Empty, Field, Icon, Input, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { accent } from "@/lib/format";
import { useHud } from "./HudShell";

const TIER_COLOR: Record<ReturnType<typeof reputationTier>, string> = { hunted: "crimson", hostile: "crimson", unfriendly: "amber", neutral: "muted", friendly: "cyan", allied: "ok", family: "ok" };
const COLORS = ["cyan", "crimson", "amber", "lime", "blue", "violet", "magenta", "ok", "muted"];

/** Standing from −100 to +100 drawn around a centre line; the fill grows left (negative) or right (positive). */
function StandingBar({ value, color }: { value: number; color: string }) {
  const pct = (Math.abs(value) / REPUTATION_MAX) * 50;
  const positive = value >= 0;
  return (
    <div className="relative h-3 w-full border border-line-2 bg-bg-0/70" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
      <div className="absolute inset-y-0" style={{ left: positive ? "50%" : `${50 - pct}%`, width: `${pct}%`, background: accent(color), boxShadow: `0 0 8px ${accent(color)}` }} />
      {[-50, 50].map((t) => (
        <div key={t} className="absolute inset-y-0 w-px bg-line/60" style={{ left: `${50 + t / 2}%` }} />
      ))}
    </div>
  );
}

function FactionRow({ entry, isDm, onChange, busy }: { entry: ReputationEntryDto; isDm: boolean; onChange: (body: { delta?: number; value?: number; reason?: string }) => void; busy: boolean }) {
  const f = entry.faction;
  const tier = REPUTATION_TIER_META[entry.tier];
  const color = f.isCity ? "cyan" : f.color;
  const [reason, setReason] = useState("");
  const [setTo, setSetTo] = useState("");
  return (
    <section className={clsx("hud-panel p-3", f.isCity && "lit")} style={{ ["--panel-accent" as string]: accent(color) }} data-testid="faction-row">
      <div className="flex flex-wrap items-start gap-3">
        <span className="tile" style={{ ["--tile-color" as string]: accent(color), width: 44, height: 44 }}>
          <Icon name={f.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[0.95rem] font-bold uppercase tracking-[0.06em] text-text">{f.name}</span>
            {f.isCity && <Badge color="cyan">The city</Badge>}
            <Badge color={TIER_COLOR[entry.tier]} className="ml-auto" title={tier.hint}>
              {tier.label}
            </Badge>
            <span className={clsx("num text-[1.35rem] font-black leading-none", entry.value < 0 ? "text-crimson" : entry.value > 0 ? "text-ok" : "text-text/70")} data-testid="rep-value">
              {entry.value > 0 ? `+${entry.value}` : entry.value}
            </span>
          </div>
          {f.description && <p className="mt-0.5 text-[0.78rem] text-muted">{f.description}</p>}
          <div className="mt-2 flex items-center gap-2 text-[0.6rem] text-dim">
            <span className="num w-8">{REPUTATION_MIN}</span>
            <StandingBar value={entry.value} color={entry.value < 0 ? "crimson" : color} />
            <span className="num w-8 text-right">+{REPUTATION_MAX}</span>
          </div>
          <div className="mt-1 text-[0.65rem] text-dim">{tier.hint}</div>
          {isDm && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/50 pt-2 text-xs" data-testid="rep-controls">
              <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span>
              {[-10, -5, -1].map((d) => (
                <Button key={d} size="xs" color="crimson" variant="ghost" disabled={busy || entry.value <= REPUTATION_MIN} onClick={() => onChange({ delta: d, reason })}>
                  {d}
                </Button>
              ))}
              {[1, 5, 10].map((d) => (
                <Button key={d} size="xs" color="ok" variant="ghost" disabled={busy || entry.value >= REPUTATION_MAX} onClick={() => onChange({ delta: d, reason })}>
                  +{d}
                </Button>
              ))}
              <Input value={setTo} onChange={(e) => setSetTo(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="set" className="num !w-16 !py-1 text-xs" aria-label="Set standing" />
              <Button size="xs" variant="ghost" disabled={busy || setTo === "" || Number.isNaN(Number(setTo))} onClick={() => { onChange({ value: Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Number(setTo))), reason }); setSetTo(""); }}>
                Set
              </Button>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the player)" className="!min-w-[12rem] !flex-1 !py-1 text-xs" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FactionEditor({ campaignId, factions }: { campaignId: string; factions: FactionDto[] }) {
  const save = useSaveFaction(campaignId);
  const del = useDeleteFaction(campaignId);
  const [editing, setEditing] = useState<FactionDto | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "cyan", icon: "users", isCity: false, sortOrder: 0 });
  const open = (f: FactionDto | "new") => {
    setEditing(f);
    setForm(f === "new" ? { name: "", description: "", color: "cyan", icon: "users", isCity: false, sortOrder: factions.length } : { name: f.name, description: f.description, color: f.color, icon: f.icon, isCity: f.isCity, sortOrder: f.sortOrder });
  };
  return (
    <Panel title="Factions" icon="users-round" color="crimson" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>Add</Button>}>
      <p className="mb-2 text-[0.68rem] text-muted">DM only. Rename, re-describe or remove gangs; the city line is marked separately. Standings are per character.</p>
      <ul className="space-y-1 text-xs">
        {factions.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <Icon name={f.icon} size={12} style={{ color: accent(f.color) }} />
            <span className="flex-1 truncate text-text">{f.name}</span>
            <Button size="xs" variant="ghost" icon="pencil" onClick={() => open(f)} aria-label={`Edit ${f.name}`} />
            <ConfirmButton size="xs" variant="ghost" icon="trash-2" label="" confirmLabel="Delete?" disabled={del.isPending} onConfirm={() => del.mutate(f.id)} aria-label={`Delete ${f.name}`} />
          </li>
        ))}
      </ul>
      {editing && (
        <form
          className="mt-3 space-y-2 border-t border-line pt-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form }).then(() => setEditing(null));
          }}
        >
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[48px]" maxLength={500} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Colour">
              <Select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                {COLORS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Icon (Lucide name)">
              <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={form.isCity} onChange={(e) => setForm({ ...form, isCity: e.target.checked })} /> This is the city standing
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="solid" size="sm" icon="save" disabled={save.isPending || !form.name.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

/** Standing with each gang and with Neon City, −100..+100. The DM adjusts; players are notified of every change. */
export function ReputationPage() {
  const { view, campaign, isDm } = useHud();
  const rep = useReputation(view.character.id);
  const change = useChangeReputation(view.character.id);
  const events = useEvents(campaign.id, view.character.id);
  const history = (events.data ?? []).filter((e) => e.type === "reputation.changed").slice(0, 12);
  const factions = (rep.data ?? []).map((r) => r.faction);
  const city = rep.data?.find((r) => r.faction.isCity);
  const gangs = (rep.data ?? []).filter((r) => !r.faction.isCity);

  return (
    <div className="mx-auto max-w-6xl space-y-3" data-testid="reputation-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-[1.2rem] font-black uppercase tracking-[0.08em] text-cyan glow-text">Reputation</div>
          <p className="text-xs text-muted">Where {view.character.name} stands with the city and its gangs. {REPUTATION_MIN} is hunted, 0 is unknown, +{REPUTATION_MAX} is family.</p>
        </div>
        {!isDm && (
          <span className="flex items-center gap-1 text-[0.6rem] uppercase tracking-wider text-muted">
            <Icon name="lock" size={11} /> Changed by the DM
          </span>
        )}
      </div>
      {rep.isLoading && <Spinner label="Loading standings" />}
      {!rep.isLoading && (rep.data?.length ?? 0) === 0 && <Empty icon="users-round">No factions defined. {isDm ? "Add one below." : "Ask the DM."}</Empty>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <div className="space-y-2">
          {city && <FactionRow entry={city} isDm={isDm} busy={change.isPending} onChange={(b) => change.mutate({ factionId: city.faction.id, ...b })} />}
          {gangs.map((r) => (
            <FactionRow key={r.faction.id} entry={r} isDm={isDm} busy={change.isPending} onChange={(b) => change.mutate({ factionId: r.faction.id, ...b })} />
          ))}
        </div>
        <div className="space-y-3">
          <Panel title="Recent changes" icon="scroll-text" color="amber">
            {history.length === 0 && <div className="text-xs text-dim">No reputation changes logged yet.</div>}
            <ul className="space-y-1 text-xs">
              {history.map((e) => (
                <li key={e.id} className="border-b border-line/50 pb-1 last:border-0">
                  <div className="text-text/90">{e.summary}</div>
                  <div className="text-[0.6rem] text-dim">
                    {new Date(e.createdAt).toLocaleString()} · {e.actorName ?? "SYSTEM"}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Tiers" icon="info" color="muted">
            <ul className="space-y-0.5 text-[0.68rem]">
              {(Object.keys(REPUTATION_TIER_META) as (keyof typeof REPUTATION_TIER_META)[]).map((t) => (
                <li key={t} className="flex gap-2">
                  <Badge color={TIER_COLOR[t]} className="w-20 justify-center">
                    {REPUTATION_TIER_META[t].label}
                  </Badge>
                  <span className="text-muted">{REPUTATION_TIER_META[t].hint}</span>
                </li>
              ))}
            </ul>
          </Panel>
          {isDm && <FactionEditor campaignId={campaign.id} factions={factions} />}
        </div>
      </div>
    </div>
  );
}
