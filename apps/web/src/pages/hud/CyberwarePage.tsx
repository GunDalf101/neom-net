import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_META, describePassiveEffect } from "@neom/shared";
import { useItemDefinitions } from "@/api/hooks";
import { CyberwareDisplay } from "@/components/hud/CyberwareDisplay";
import { Badge, Empty, Icon, Panel } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { useHud } from "./HudShell";

export function CyberwarePage() {
  const { view, campaign } = useHud();
  const defs = useItemDefinitions(campaign.id);
  const installed = view.items.filter((i) => i.installedSlot);
  const stored = view.items.filter((i) => !i.installedSlot && i.definition.category === "cyberware");
  const catalog = (defs.data ?? []).filter((d) => d.category === "cyberware");

  return (
    <div className="mx-auto grid max-w-[1700px] gap-3 lg:grid-cols-[minmax(560px,1.5fr)_minmax(320px,1fr)]">
      <div className="min-h-[600px]">
        <CyberwareDisplay view={view} />
      </div>
      <div className="space-y-3">
        <Panel title="Installed systems" icon="cpu">
          {installed.length === 0 && <Empty>No cyberware installed.</Empty>}
          <ul className="space-y-1.5 text-xs">
            {installed.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 border-b border-line/60 pb-1">
                <span className="flex items-center gap-2">
                  <Icon name={i.definition.icon} size={14} style={{ color: accent(RARITY_COLOR[i.definition.rarity]) }} />
                  <span>
                    <span className="text-text">{i.customName ?? i.definition.name}</span>
                    <span className="text-dim"> · {AUGMENTATION_SLOT_META[i.installedSlot!].name}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Badge color={i.status === "installed" ? "ok" : i.status === "damaged" ? "amber" : "crimson"}>{i.status}</Badge>
                  <span className="num text-muted">cap {i.definition.capacityCost}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Uninstalled cyberware" icon="package" color="amber">
          {stored.length === 0 && <div className="text-xs text-dim">None in inventory. Open a body slot on the left to install when you acquire some.</div>}
          <ul className="space-y-1 text-xs">
            {stored.map((i) => (
              <li key={i.id} className="flex items-center justify-between">
                <span>
                  {i.definition.name}
                  <span className="text-dim"> → {i.definition.augmentationSlot ? AUGMENTATION_SLOT_META[i.definition.augmentationSlot].name : "any slot"}</span>
                </span>
                <span className="num text-muted">cap {i.definition.capacityCost}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Known cyberware catalog" icon="book" color="muted">
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 text-xs">
            {AUGMENTATION_SLOTS.map((slot) => {
              const list = catalog.filter((d) => d.augmentationSlot === slot);
              if (list.length === 0) return null;
              return (
                <div key={slot}>
                  <div className="hud-title text-[0.55rem]">{AUGMENTATION_SLOT_META[slot].name}</div>
                  {list.map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-2 py-0.5">
                      <span>
                        <span className="text-text">{d.name}</span>
                        <span className="block text-dim">{d.effects.map(describePassiveEffect).join(" · ")}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <Badge color={RARITY_COLOR[d.rarity]}>{rarityName(d.rarity)}</Badge>
                        <span className="num text-muted">
                          {d.price.toLocaleString()} ¢ · cap {d.capacityCost}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
