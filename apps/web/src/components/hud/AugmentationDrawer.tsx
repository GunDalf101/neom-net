import {
  AUGMENTATION_SLOT_META,
  describePassiveEffect,
  describeRequirement,
  unmetRequirements,
  ATTRIBUTES,
  SPECIAL_SKILLS,
  type AugmentationSlot,
  type CharacterView,
  type ItemInstanceDto,
  type AttributeKey,
  type SpecialSkillKey,
} from "@neom/shared";
import { useItemAction } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Drawer, Icon } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";

export function requirementContext(view: CharacterView) {
  const attributes = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES) attributes[a] = view.derived.attributes[a].value;
  const specialRanks = {} as Record<SpecialSkillKey, number>;
  for (const s of SPECIAL_SKILLS) specialRanks[s] = view.derived.specialSkills[s].rank;
  return {
    level: view.character.level,
    attributes,
    specialRanks,
    unlockedNodes: view.unlocks.map((u) => ({ key: u.nodeKey, rank: u.rank })),
    augmentations: view.items.filter((i) => i.installedSlot).map((i) => ({ slot: i.installedSlot as AugmentationSlot, definitionId: i.definitionId })),
  };
}

export function AugmentationDrawer({ view, slot, onClose }: { view: CharacterView; slot: AugmentationSlot | null; onClose: () => void }) {
  const act = useItemAction(view.character.id);
  if (!slot) return null;
  const installed = view.items.find((i) => i.installedSlot === slot);
  const candidates = view.items.filter((i) => !i.installedSlot && i.definition.category === "cyberware" && (i.definition.augmentationSlot === slot || !i.definition.augmentationSlot));
  const { derived, permissions } = view;
  const canInstall = permissions.canInstallCyberware;
  const freeCap = derived.capacity.value - derived.capacityUsed + (installed?.definition.capacityCost ?? 0);
  const ctx = requirementContext(view);

  return (
    <Drawer open={Boolean(slot)} onClose={onClose} title={`${AUGMENTATION_SLOT_META[slot].name} slot`} color={installed ? RARITY_COLOR[installed.definition.rarity] : "cyan"}>
      {installed ? (
        <AugDetails item={installed} view={view}>
          <div className="mt-3 flex flex-wrap gap-2">
            {canInstall && <ConfirmButton label="Remove" confirmLabel="Remove?" color="amber" variant="outline" onConfirm={() => act.mutate({ itemId: installed.id, action: { action: "uninstall" } })} />}
            {permissions.isDm && (
              <>
                {installed.status !== "installed" && (
                  <Button color="ok" size="sm" icon="wrench" onClick={() => act.mutate({ itemId: installed.id, action: { action: "setStatus", status: "installed" } })}>
                    Repair
                  </Button>
                )}
                {installed.status !== "damaged" && (
                  <Button color="amber" size="sm" icon="zap-off" onClick={() => act.mutate({ itemId: installed.id, action: { action: "setStatus", status: "damaged" } })}>
                    Damage
                  </Button>
                )}
                {installed.status !== "disabled" && (
                  <Button color="crimson" size="sm" icon="power-off" onClick={() => act.mutate({ itemId: installed.id, action: { action: "setStatus", status: "disabled" } })}>
                    Disable
                  </Button>
                )}
              </>
            )}
          </div>
        </AugDetails>
      ) : (
        <div className="text-sm text-muted">Nothing installed in this slot.</div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <div className="hud-title mb-2">{installed ? "Replace with" : "Install from inventory"}</div>
        {candidates.length === 0 && <div className="text-xs text-dim">No compatible cyberware in inventory. The DM can grant augmentations, or buy them from a ripperdoc.</div>}
        <div className="space-y-2">
          {candidates.map((i) => {
            const unmet = unmetRequirements(i.definition.requirements, ctx);
            const tooBig = i.definition.capacityCost > freeCap;
            const blocked = (unmet.length > 0 || tooBig) && !permissions.isDm;
            return (
              <div key={i.id} className="hud-panel p-2" style={{ ["--panel-accent" as string]: accent(RARITY_COLOR[i.definition.rarity]) }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Icon name={i.definition.icon} size={16} style={{ color: accent(RARITY_COLOR[i.definition.rarity]) }} />
                    {i.customName ?? i.definition.name}
                  </span>
                  <Badge color={RARITY_COLOR[i.definition.rarity]}>{rarityName(i.definition.rarity)}</Badge>
                </div>
                <div className="mt-1 text-[0.65rem] text-muted">{i.definition.effects.map(describePassiveEffect).join(" · ")}</div>
                <div className="mt-1 flex items-center justify-between text-[0.65rem]">
                  <span className={tooBig ? "text-crimson" : "text-muted"}>
                    Capacity {i.definition.capacityCost} (free {freeCap})
                  </span>
                  {unmet.length > 0 && <span className="text-crimson">Needs {unmet.join(", ")}</span>}
                </div>
                {canInstall && (
                  <Button
                    size="sm"
                    variant="solid"
                    className="mt-2 w-full"
                    disabled={blocked || act.isPending}
                    icon="plug"
                    onClick={() => act.mutate({ itemId: i.id, action: { action: "install", slot, replace: Boolean(installed) } })}
                  >
                    {installed ? "Replace" : "Install"}
                    {(unmet.length > 0 || tooBig) && permissions.isDm ? " (DM override)" : ""}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}

export function AugDetails({ item, view, children }: { item: ItemInstanceDto; view: CharacterView; children?: React.ReactNode }) {
  const d = item.definition;
  const color = RARITY_COLOR[d.rarity];
  const unmet = unmetRequirements(d.requirements, requirementContext(view));
  const effects = [...d.effects, ...(item.customEffects ?? [])];
  const statusColor = { installed: "ok", damaged: "amber", disabled: "crimson", stored: "muted", equipped: "cyan" }[item.status] ?? "muted";
  return (
    <div className="text-sm">
      <div className="flex items-start gap-3">
        <span className="hud-clip-sm flex h-14 w-14 shrink-0 items-center justify-center border" style={{ borderColor: accent(color), color: accent(color), background: `color-mix(in srgb, ${accent(color)} 10%, transparent)` }}>
          <Icon name={d.icon} size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-bold tracking-wider text-text">{item.customName ?? d.name}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge color={color}>{rarityName(d.rarity)}</Badge>
            <Badge color="muted">{d.category}</Badge>
            {d.augmentationSlot && <Badge color="cyan">{AUGMENTATION_SLOT_META[d.augmentationSlot].name}</Badge>}
            <Badge color={statusColor}>{item.status}</Badge>
          </div>
        </div>
      </div>
      <p className="mt-2 text-muted">{d.description || "No description."}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-dim">Capacity cost</dt>
        <dd className="num">{d.capacityCost}</dd>
        <dt className="text-dim">Price</dt>
        <dd className="num">{d.price.toLocaleString()} ₭</dd>
        {d.weight > 0 && (
          <>
            <dt className="text-dim">Weight</dt>
            <dd className="num">{d.weight} kg</dd>
          </>
        )}
        {d.damage && (
          <>
            <dt className="text-dim">Damage</dt>
            <dd className="num">
              {d.damage} {d.damageType}
            </dd>
          </>
        )}
        {item.charges !== null && (
          <>
            <dt className="text-dim">Charges</dt>
            <dd className="num">
              {item.charges}
              {d.maxCharges !== null ? ` / ${d.maxCharges}` : ""}
            </dd>
          </>
        )}
      </dl>
      {d.requirements.length > 0 && (
        <div className="mt-2">
          <div className="hud-title text-[0.6rem]">Requirements</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {d.requirements.map((r, i) => {
              const text = describeRequirement(r);
              const ok = !unmet.includes(text);
              return (
                <li key={i} className={ok ? "text-ok" : "text-crimson"}>
                  {ok ? "✓" : "✗"} {text}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {effects.length > 0 && (
        <div className="mt-2">
          <div className="hud-title text-[0.6rem]">Mechanical effects</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {effects.map((e, i) => (
              <li key={i} className={item.status === "installed" || item.status === "equipped" ? "text-text" : "text-dim line-through"}>
                + {describePassiveEffect(e)}
                {e.kind === "trait" && e.description && <span className="text-muted"> — {e.description}</span>}
              </li>
            ))}
          </ul>
          {item.status === "damaged" || item.status === "disabled" ? <div className="mt-1 text-[0.65rem] text-amber">Effects suppressed while {item.status}. Capacity is still consumed.</div> : null}
        </div>
      )}
      {d.useEffects.length > 0 && (
        <div className="mt-2">
          <div className="hud-title text-[0.6rem]">On use</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {d.useEffects.map((e, i) => (
              <li key={i}>• {e.kind === "heal" ? `Heal ${e.amount}` : e.kind === "damage" ? `Deal ${e.amount} ${e.damageType}` : e.kind === "applyCondition" ? `Apply ${e.conditionKey}` : e.kind === "removeCondition" ? `Remove ${e.conditionKey}` : e.kind}</li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
}
