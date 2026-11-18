import { describePassiveEffect, type CharacterView } from "@neom/shared";
import { useState } from "react";
import { useAbilities, useUpdateCharacter, useUseAbility } from "@/api/hooks";
import { Badge, Button, Icon, Select } from "@/components/ui";

const COST_LABEL: Record<string, string> = { progressionPoints: "pts", credits: "₭", hitDice: "hit dice", inspiration: "inspiration" };

/**
 * Abilities the character holds: granted directly by the DM, or by gear and conditions through effects.
 * Players activate; the DM grants and revokes from here (and from the live controls).
 */
export function AbilitiesPanel({ view }: { view: CharacterView }) {
  const { character: c, permissions } = view;
  const activate = useUseAbility(c.id);
  const update = useUpdateCharacter(c.id);
  const catalog = useAbilities(c.campaignId);
  const [pick, setPick] = useState("");
  const direct = new Set(c.abilityIds);
  const grantable = (catalog.data ?? []).filter((a) => !direct.has(a.id));

  return (
    <section className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }} data-testid="abilities-panel">
      <div className="hud-title mb-1.5 flex items-center justify-between">
        <span>Abilities</span>
        <span className="text-[0.55rem] text-dim">{view.abilities.length} held</span>
      </div>
      {view.abilities.length === 0 && <div className="text-xs text-dim">No abilities yet. The DM grants them here; gear and conditions can grant more.</div>}
      <ul className="space-y-1.5">
        {view.abilities.map((a) => {
          const cost = a.cost.resource !== "none" && a.cost.amount > 0 ? ` · ${a.cost.amount} ${COST_LABEL[a.cost.resource] ?? a.cost.resource}` : "";
          return (
            <li key={a.id} className="border-b border-line/50 pb-1.5 text-xs last:border-0" data-testid="ability-row">
              <div className="flex items-center gap-2">
                <Icon name={a.icon} size={14} className="text-amber" />
                <span className="flex-1 font-semibold text-text">{a.name}</span>
                <Badge color="amber">{a.actionType}</Badge>
                {direct.has(a.id) && (
                  <Badge color="muted" title="Granted by the DM">
                    DM
                  </Badge>
                )}
              </div>
              {a.description && <p className="mt-0.5 text-muted">{a.description}</p>}
              {a.passiveEffects.length > 0 && <div className="mt-0.5 text-[0.65rem] text-violet">{a.passiveEffects.map(describePassiveEffect).join(" · ")}</div>}
              <div className="mt-1 flex items-center gap-2">
                {permissions.canEdit && a.actionType !== "passive" && (
                  <Button size="xs" color="amber" icon="play" disabled={activate.isPending} onClick={() => activate.mutate(a.id)}>
                    Activate{cost}
                  </Button>
                )}
                {permissions.isDm && direct.has(a.id) && (
                  <Button size="xs" variant="ghost" icon="x" onClick={() => update.mutate({ abilityIds: c.abilityIds.filter((id) => id !== a.id) })}>
                    Revoke
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {permissions.isDm && (
        <div className="mt-2 flex items-center gap-2 border-t border-line/60 pt-2 text-xs" title="DM: grant an ability from the workshop catalog">
          <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span>
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="!py-1 text-xs" aria-label="Ability to grant">
            <option value="">— grant an ability —</option>
            {grantable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Button
            size="xs"
            color="amber"
            icon="plus"
            disabled={!pick || update.isPending}
            onClick={() => {
              update.mutate({ abilityIds: [...c.abilityIds, pick] });
              setPick("");
            }}
          >
            Grant
          </Button>
        </div>
      )}
    </section>
  );
}
