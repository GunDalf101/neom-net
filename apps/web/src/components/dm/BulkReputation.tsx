import { REPUTATION_MAX, REPUTATION_MIN, type CharacterSummaryDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useBulkReputation, useFactions } from "@/api/hooks";
import { Button, Icon, Input, Panel, Select } from "@/components/ui";

/** DM dashboard: one reputation change for several (or all) PCs at once. */
export function BulkReputation({ campaignId, characters }: { campaignId: string; characters: CharacterSummaryDto[] }) {
  const factions = useFactions(campaignId);
  const bulk = useBulkReputation(campaignId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [factionId, setFactionId] = useState("");
  const [mode, setMode] = useState<"delta" | "value">("delta");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const all = picked.size === characters.length && characters.length > 0;
  const list = factions.data ?? [];
  const faction = factionId || list[0]?.id || "";
  const n = Number(amount);
  const valid = Number.isInteger(n) && (mode === "delta" ? n !== 0 && Math.abs(n) <= 200 : n >= REPUTATION_MIN && n <= REPUTATION_MAX);
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Panel title="Reputation" icon="users-round" color="cyan">
      <div className="space-y-2 text-xs" data-testid="bulk-reputation">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={clsx("hud-tab !px-2 !py-1 !text-[0.55rem]", all && "active")} onClick={() => setPicked(all ? new Set() : new Set(characters.map((c) => c.id)))} data-testid="bulk-rep-all">
            Everyone
          </button>
          {characters.map((c) => (
            <button key={c.id} type="button" className={clsx("hud-tab !px-2 !py-1 !text-[0.55rem]", picked.has(c.id) && "active")} onClick={() => toggle(c.id)} aria-pressed={picked.has(c.id)}>
              {c.name}
            </button>
          ))}
          {characters.length === 0 && <span className="text-dim">No characters yet.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={faction} onChange={(e) => setFactionId(e.target.value)} className="!w-40 !py-1 text-xs" aria-label="Faction" data-testid="bulk-rep-faction">
            {list.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="!w-28 !py-1 text-xs" aria-label="Mode">
            <option value="delta">Nudge by</option>
            <option value="value">Set to</option>
          </Select>
          <Input value={amount} inputMode="numeric" className="num !w-20 !py-1 text-xs" aria-label="Amount" onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))} data-testid="bulk-rep-amount" />
          <Input value={reason} placeholder="reason (players see it)" className="!w-48 !py-1 text-xs" aria-label="Reason" onChange={(e) => setReason(e.target.value)} />
          <Button
            variant="solid"
            color="cyan"
            icon="check"
            disabled={!faction || picked.size === 0 || !valid || bulk.isPending}
            onClick={() => bulk.mutateAsync({ characterIds: all ? undefined : [...picked], factionId: faction, ...(mode === "delta" ? { delta: n } : { value: n }), reason: reason.trim() || undefined }).then(() => setReason(""))}
            data-testid="bulk-rep-apply"
          >
            {mode === "delta" ? `${n > 0 ? "+" : ""}${amount || "…"}` : `Set ${amount || "…"}`} for {picked.size || "…"}
          </Button>
          <span className="flex items-center gap-1 text-[0.62rem] text-dim">
            <Icon name="bell" size={11} /> Each player is told, with the reason.
          </span>
        </div>
      </div>
    </Panel>
  );
}
