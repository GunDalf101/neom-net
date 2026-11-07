import type { CampaignEventDto, RuleTraceDto } from "@neom/shared";
import { ChangeList, isChangeList } from "@/components/ChangeList";
import clsx from "clsx";
import { useState } from "react";
import { useEvents, useRolls, useTraces } from "@/api/hooks";
import { RollRow } from "@/components/hud/DicePanel";
import { Badge, Empty, Input, Panel, Spinner } from "@/components/ui";
import { clock, timeAgo } from "@/lib/format";
import { useDm } from "./DmShell";

export function EventsPage() {
  const { campaign } = useDm();
  const events = useEvents(campaign.id);
  const rolls = useRolls(campaign.id);
  const traces = useTraces(campaign.id);
  const [filter, setFilter] = useState("");
  const list = (events.data ?? []).filter((e) => !filter || e.type.includes(filter) || e.summary.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="Campaign event history" icon="scroll-text" actions={<Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-44 !py-1 text-xs" />}>
        {events.isLoading && <Spinner />}
        {list.length === 0 && <Empty>No events match.</Empty>}
        <ul className="divide-y divide-line/60">
          {list.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ul>
      </Panel>
      <div className="space-y-3">
        <Panel title="Rule execution traces" icon="git-fork" color="violet">
          {traces.data?.length === 0 && <Empty>No rules have evaluated yet.</Empty>}
          <div className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
            {traces.data?.map((t) => (
              <TraceRow key={t.id} t={t} />
            ))}
          </div>
        </Panel>
        <Panel title="All rolls" icon="dices" color="crimson">
          <div className="max-h-[400px] overflow-y-auto pr-1">
            {rolls.data?.map((r) => (
              <RollRow key={r.id} r={r} showName />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const TYPE_COLOR = (type: string) => (type.startsWith("hp.damage") ? "crimson" : type.startsWith("hp.heal") ? "ok" : type.startsWith("rule") ? "violet" : type.startsWith("override") ? "amber" : type.startsWith("augmentation") || type.startsWith("item") ? "cyan" : "muted");

export function EventRow({ e, compact }: { e: CampaignEventDto; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-1 text-xs">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="num w-10 shrink-0 text-dim" title={e.createdAt}>
          {clock(e.createdAt)}
        </span>
        <Badge color={TYPE_COLOR(e.type)} className={clsx("min-w-0 truncate", compact ? "max-w-[7.5rem] @md:max-w-none" : "shrink-0")} title={e.type}>
          {e.type}
        </Badge>
        <span className={clsx("min-w-0 flex-1", compact ? "truncate" : "break-words")} title={compact ? e.summary : undefined}>{e.summary}</span>
        {e.visibility !== "public" && <Badge color="crimson" className={clsx("shrink-0", compact && "hidden @md:inline-flex")}>{e.visibility}</Badge>}
        <span className={clsx("max-w-[7rem] shrink-0 truncate text-dim", compact && "hidden @sm:inline")}>{e.actorName ?? "SYSTEM"}</span>
      </button>
      {open && isChangeList(e.payload.changes) && (
        <div className="mt-1 border border-line bg-bg-0 p-2">
          <ChangeList changes={e.payload.changes} />
        </div>
      )}
      {open && !isChangeList(e.payload.changes) && Object.keys(e.payload).length > 0 && <pre className="num mt-1 max-h-48 overflow-auto border border-line bg-bg-0 p-2 text-[0.65rem] text-muted">{JSON.stringify(e.payload, null, 2)}</pre>}
    </li>
  );
}

export function TraceRow({ t }: { t: RuleTraceDto }) {
  const [open, setOpen] = useState(false);
  const color = t.status === "applied" || t.status === "approved" ? "ok" : t.status === "pending" ? "amber" : t.status === "rejected" ? "crimson" : "muted";
  return (
    <div className="hud-panel p-2 text-xs" style={{ ["--panel-accent" as string]: `var(--color-${color})` }}>
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <Badge color={color}>{t.status}</Badge>
        <span className="text-text">{t.ruleName}</span>
        <span className="text-muted">on {t.characterName}</span>
        <span className="ml-auto text-dim">
          {t.eventType} · {t.automationMode} · {timeAgo(t.createdAt)}
        </span>
      </button>
      {open && (
        <ol className="mt-2 space-y-0.5 border-t border-line pt-2">
          {t.result.trace.map((s) => (
            <li key={s.step} className="flex gap-2">
              <span className="num w-4 text-dim">{s.step}</span>
              <span className={clsx("w-16 shrink-0 font-display text-[0.55rem] uppercase", s.outcome === "blocked" || s.outcome === "skipped" ? "text-crimson" : s.outcome === "error" ? "text-amber" : "text-ok")}>{s.outcome}</span>
              <span className="text-text">{s.label}</span>
              {s.detail && <span className="text-muted">— {s.detail}</span>}
            </li>
          ))}
          {t.result.stoppedReason && <li className="text-amber">Stopped: {t.result.stoppedReason}</li>}
          <li className="pt-1 text-muted">
            {t.result.actions.length} action(s): {t.result.actions.map((a) => (a.kind === "instant" ? a.effect.kind : a.kind === "temporary" ? `temporary(${a.effect.label})` : "cooldown use")).join(", ") || "none"}
          </li>
        </ol>
      )}
    </div>
  );
}
