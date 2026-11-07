import clsx from "clsx";
import { useMemo, useState } from "react";
import { useEvents } from "@/api/hooks";
import { Empty, Panel, Spinner } from "@/components/ui";
import { EventRow } from "@/pages/dm/EventsPage";
import { useHud } from "./HudShell";

const FILTERS: { id: string; label: string; match: (type: string) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "sheet", label: "Sheet", match: (t) => t.startsWith("character.") || t.startsWith("level.") || t.startsWith("grant.") },
  { id: "hp", label: "HP & status", match: (t) => t.startsWith("hp.") || t.startsWith("condition.") || t.startsWith("effect.") || t.startsWith("override.") },
  { id: "gear", label: "Gear", match: (t) => t.startsWith("item.") || t.startsWith("augmentation.") },
  { id: "rules", label: "Rules & rolls", match: (t) => t.startsWith("rule.") || t.startsWith("roll.") },
  { id: "story", label: "Progress", match: (t) => t.startsWith("node.") || t.startsWith("ability.") || t.startsWith("mission.") || t.startsWith("journal.") },
];

/** Every logged change to this character, newest first, with field-level diffs for sheet edits. */
export function LogPage() {
  const { view, campaign } = useHud();
  const events = useEvents(campaign.id, view.character.id);
  const [filter, setFilter] = useState("all");
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!;
  const rows = useMemo(() => (events.data ?? []).filter((e) => active.match(e.type)), [events.data, active]);

  return (
    <div className="mx-auto max-w-4xl">
      <Panel
        title={`Change log // ${view.character.name}`}
        icon="scroll-text"
        actions={
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={clsx("hud-tab !px-2 !py-1 !text-[0.55rem]", filter === f.id && "active")} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        <p className="mb-2 text-[0.68rem] text-muted">
          Append-only. Every change made by you, the DM or a rule is recorded here with who did it and when; sheet edits list each field before and after. Click a line for details.
        </p>
        {events.isLoading && <Spinner label="Loading log" />}
        {!events.isLoading && rows.length === 0 && <Empty icon="scroll-text">Nothing logged yet for this filter.</Empty>}
        <ul className="divide-y divide-line/60">
          {rows.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}
