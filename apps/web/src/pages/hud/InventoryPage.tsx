import { AUGMENTATION_SLOT_META, describePassiveEffect, describeRequirement, unmetRequirements, type ItemInstanceDto } from "@neom/shared";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { useDmGrant, useItemAction } from "@/api/hooks";
import { requirementContext } from "@/components/hud/AugmentationDrawer";
import { IdentityCard } from "@/components/hud/IdentityCard";
import { CompactAttributes } from "@/components/hud/SheetPanel";
import { Bar, ConfirmButton, Icon, Input, Select } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { useHud } from "./HudShell";

const CATS: { id: string; label: string; icon: string; match: (i: ItemInstanceDto) => boolean }[] = [
  { id: "all", label: "All", icon: "layout-grid", match: () => true },
  { id: "weapon", label: "Weapons", icon: "crosshair", match: (i) => i.definition.category === "weapon" },
  { id: "cyberware", label: "Augments", icon: "cpu", match: (i) => i.definition.category === "cyberware" },
  { id: "armor", label: "Armor", icon: "shield", match: (i) => i.definition.category === "armor" },
  { id: "consumable", label: "Consumables", icon: "syringe", match: (i) => i.definition.category === "consumable" },
  { id: "tool", label: "Gear", icon: "wrench", match: (i) => i.definition.category === "tool" || i.definition.category === "misc" || i.definition.category === "custom" },
  { id: "quest", label: "Quest", icon: "key-round", match: (i) => i.definition.category === "quest" },
];

const RARITY_ORDER = ["artifact", "legendary", "veryRare", "rare", "uncommon", "common"];

export function InventoryPage() {
  const { view, isDm } = useHud();
  const { character: c, derived, permissions } = view;
  const act = useItemAction(c.id);
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"type" | "name" | "rarity" | "value">("type");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(view.items[0]?.id ?? null);

  const items = useMemo(() => {
    const m = CATS.find((x) => x.id === cat) ?? CATS[0]!;
    const list = view.items.filter((i) => m.match(i) && (!search || (i.customName ?? i.definition.name).toLowerCase().includes(search.toLowerCase())));
    const cmp: Record<typeof sort, (a: ItemInstanceDto, b: ItemInstanceDto) => number> = {
      type: (a, b) => a.definition.category.localeCompare(b.definition.category) || a.definition.name.localeCompare(b.definition.name),
      name: (a, b) => (a.customName ?? a.definition.name).localeCompare(b.customName ?? b.definition.name),
      rarity: (a, b) => RARITY_ORDER.indexOf(a.definition.rarity) - RARITY_ORDER.indexOf(b.definition.rarity),
      value: (a, b) => b.definition.price - a.definition.price,
    };
    return [...list].sort(cmp[sort]);
  }, [view.items, cat, search, sort]);

  const selected = view.items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const weight = view.items.reduce((s, i) => s + i.definition.weight * i.quantity, 0);
  const carry = derived.attributes.str.value * 7.5;
  const consumables = view.items.filter((i) => i.definition.category === "consumable" || (i.definition.useEffects.length > 0 && i.status === "stored"));
  const loadout = view.items.filter((i) => i.status === "equipped" || i.installedSlot);

  return (
    <div className="mx-auto grid max-w-[1900px] gap-3 xl:grid-cols-[minmax(290px,0.8fr)_minmax(620px,2.2fr)_minmax(320px,0.95fr)]">
      {/* Left: compact sheet */}
      <div className="hidden space-y-2 xl:block">
        <IdentityCard view={view} compact />
        <CompactAttributes view={view} />
      </div>

      {/* Center: grid */}
      <div className="space-y-2">
        <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
          <div className="font-display text-[1.2rem] font-black uppercase tracking-[0.08em] text-cyan glow-text">Inventory</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATS.map((x) => (
              <button key={x.id} type="button" onClick={() => setCat(x.id)} className={clsx("nav-box flex items-center gap-1.5 !px-3 !py-1.5 !text-[0.62rem]", cat === x.id && "active")}>
                <Icon name={x.icon} size={12} /> {x.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="nav-box !px-2 !py-1.5">
              <Icon name="scan-search" size={14} />
            </span>
            <div className="flex min-w-[220px] flex-1 items-center border border-cyan/35 bg-bg-0/70 px-2">
              <input className="w-full bg-transparent py-1.5 text-sm outline-none" placeholder="Search item..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Icon name="search" size={14} className="text-muted" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="!w-40 !py-1.5 text-xs">
              <option value="type">Sort by: Type</option>
              <option value="name">Sort by: Name</option>
              <option value="rarity">Sort by: Rarity</option>
              <option value="value">Sort by: Value</option>
            </Select>
            <button type="button" className={clsx("nav-box !px-2 !py-1.5", layout === "grid" && "active")} onClick={() => setLayout("grid")} aria-label="Grid view">
              <Icon name="layout-grid" size={14} />
            </button>
            <button type="button" className={clsx("nav-box !px-2 !py-1.5", layout === "list" && "active")} onClick={() => setLayout("list")} aria-label="List view">
              <Icon name="list" size={14} />
            </button>
          </div>

          {items.length === 0 && <div className="py-10 text-center text-sm text-dim">Nothing in this category.</div>}
          <div className={clsx("mt-3", layout === "grid" ? "grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-5" : "space-y-1.5")}>
            {items.map((i) => (
              <ItemTile key={i.id} item={i} selected={selected?.id === i.id} layout={layout} onSelect={() => setSelectedId(i.id)} />
            ))}
          </div>
        </section>

        <Strip title="Quick use" icon="syringe" items={consumables} empty="No consumables or charged tools." render={(i) => <span className="num text-[0.7rem] text-cyan">{i.charges !== null ? `${i.charges} ch` : `x${i.quantity}`}</span>} onSelect={setSelectedId} selectedId={selected?.id} />
        <Strip title="Loadout" icon="shield-check" items={loadout} empty="Nothing equipped or installed." render={(i) => <span className="text-[0.65rem] uppercase text-muted">{i.installedSlot ? AUGMENTATION_SLOT_META[i.installedSlot].name : i.equippedSlot}</span>} onSelect={setSelectedId} selectedId={selected?.id} />
      </div>

      {/* Right: details */}
      <div className="space-y-2">
        {selected ? <DetailPanel item={selected} view={view} act={act} canEdit={permissions.canEdit} isDm={isDm} /> : <section className="hud-panel p-4 text-sm text-dim">Select an item to inspect it.</section>}
        <CurrencyPanel view={view} />
        {selected && permissions.canEdit && (
          <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
            <div className="font-display text-[0.95rem] font-bold uppercase tracking-[0.08em] text-text">Quick actions</div>
            <QuickActions item={selected} act={act} isDm={isDm} />
          </section>
        )}
        <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
          <div className="flex items-center justify-between">
            <span className="font-display text-[0.95rem] font-bold uppercase tracking-[0.08em] text-text">Inventory capacity</span>
            <span className="num text-[1.05rem] font-bold text-cyan">
              {weight.toFixed(1)} / {carry} kg
            </span>
          </div>
          <Bar value={weight} max={carry} color={weight > carry ? "crimson" : "cyan"} className="mt-2" height={10} />
          <div className="mt-1 text-[0.65rem] text-dim">Carry capacity = STR {derived.attributes.str.value} × 7.5 kg · {view.items.length} stacks</div>
        </section>
      </div>
    </div>
  );
}

/** Credits are DM-controlled: players see a locked read-out, the DM can adjust or set them (logged as grants). */
function CurrencyPanel({ view }: { view: ReturnType<typeof useHud>["view"] }) {
  const { character: c, permissions } = view;
  const grant = useDmGrant(c.campaignId);
  const [delta, setDelta] = useState(100);
  const [setTo, setSetTo] = useState("");
  const [note, setNote] = useState("");
  return (
    <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
      <div className="flex items-center justify-between">
        <span className="font-display text-[0.95rem] font-bold uppercase tracking-[0.08em] text-text">Currency</span>
        {!permissions.isDm && (
          <span className="flex items-center gap-1 text-[0.6rem] uppercase tracking-wider text-muted" title="Only the DM can change credits">
            <Icon name="lock" size={11} /> DM controlled
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 border border-amber/50 bg-bg-0/60 px-3 py-2 shadow-[inset_0_0_14px_rgba(255,176,32,0.12)]">
        <span className="tile" style={{ ["--tile-color" as string]: "var(--color-amber)" }}>
          <Icon name="coins" size={20} />
        </span>
        <span className="font-display text-[0.9rem] font-bold uppercase tracking-[0.1em] text-amber">Credits</span>
        <span className="num ml-auto text-[1.6rem] font-black text-amber">{c.credits.toLocaleString()}</span>
      </div>
      {permissions.isDm && (
        <div className="mt-2 space-y-1.5 border-t border-amber/30 pt-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-crimson">DM</span>
            <input className="valbox !text-[0.9rem] w-20" value={delta} inputMode="numeric" onChange={(e) => setDelta(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
            <button type="button" className="hud-btn !px-2.5 !py-1.5" style={{ ["--btn-color" as string]: "var(--color-ok)" }} disabled={!delta || grant.isPending} onClick={() => grant.mutate({ characterId: c.id, resource: "credits", amount: delta, note: note || undefined })}>
              <Icon name="plus" size={12} /> Grant
            </button>
            <button type="button" className="hud-btn !px-2.5 !py-1.5" style={{ ["--btn-color" as string]: "var(--color-crimson)" }} disabled={!delta || grant.isPending} onClick={() => grant.mutate({ characterId: c.id, resource: "credits", amount: -Math.min(delta, c.credits), note: note || undefined })}>
              <Icon name="minus" size={12} /> Take
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Set to</span>
            <input className="valbox !text-[0.9rem] w-24" placeholder={String(c.credits)} value={setTo} inputMode="numeric" onChange={(e) => setSetTo(e.target.value.replace(/[^0-9]/g, ""))} />
            <button type="button" className="hud-btn !px-2.5 !py-1.5" style={{ ["--btn-color" as string]: "var(--color-amber)" }} disabled={setTo === "" || Number(setTo) === c.credits || grant.isPending} onClick={() => { grant.mutate({ characterId: c.id, resource: "credits", amount: Number(setTo) - c.credits, note: note || "set by DM" }); setSetTo(""); }}>
              Apply
            </button>
            <Input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="!py-1 text-xs" />
          </div>
          <div className="text-[0.6rem] text-dim">Every change is logged in the event history.</div>
        </div>
      )}
    </section>
  );
}

function ItemTile({ item, selected, layout, onSelect }: { item: ItemInstanceDto; selected: boolean; layout: "grid" | "list"; onSelect: () => void }) {
  const d = item.definition;
  const rc = accent(RARITY_COLOR[d.rarity]);
  const sub = d.category === "cyberware" && d.augmentationSlot ? `${AUGMENTATION_SLOT_META[d.augmentationSlot].name} Augment` : d.category === "weapon" ? (d.damage ? `${d.damageType ?? ""} weapon`.trim() : "Weapon") : d.category.charAt(0).toUpperCase() + d.category.slice(1);
  const state = item.installedSlot ? "installed" : item.status === "equipped" ? "equipped" : null;
  if (layout === "list") {
    return (
      <button type="button" onClick={onSelect} className={clsx("rarity-card flex w-full items-center gap-3 p-2 text-left", selected && "selected")} style={{ ["--rc" as string]: rc }}>
        <span className="tile" style={{ ["--tile-color" as string]: rc, width: 36, height: 36 }}>
          <Icon name={d.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text">{item.customName ?? d.name}</span>
          <span className="text-[0.7rem] text-muted">{sub}</span>
        </span>
        <span className="rarity-pill">{rarityName(d.rarity)}</span>
        {state && <span className="text-[0.6rem] uppercase text-cyan">{state}</span>}
        {item.quantity > 1 && <span className="num text-xs text-muted">x{item.quantity}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onSelect} className={clsx("rarity-card relative flex min-h-[150px] flex-col p-2 text-left transition hover:brightness-125", selected && "selected")} style={{ ["--rc" as string]: rc }}>
      <span className="rarity-pill self-start">{rarityName(d.rarity)}</span>
      <span className="relative my-1 flex flex-1 items-center justify-center">
        {d.imageUrl ? (
          <img src={d.imageUrl} alt="" className="max-h-16 object-contain" />
        ) : (
          <Icon name={d.icon} size={40} style={{ color: rc, filter: `drop-shadow(0 0 8px ${rc})` }} />
        )}
        {(item.quantity > 1 || item.charges !== null) && (
          <span className="num absolute right-0 top-0 text-[0.7rem] text-cyan">{item.charges !== null ? `${item.charges}/${d.maxCharges ?? "∞"}` : `x${item.quantity}`}</span>
        )}
      </span>
      <span className="truncate text-[0.86rem] font-semibold text-text">{item.customName ?? d.name}</span>
      <span className="truncate text-[0.68rem] text-muted">{sub}</span>
      <span className="mt-1 flex items-center gap-1">
        {d.effects.slice(0, 3).map((_, k) => (
          <span key={k} className="tile tile-sm" style={{ ["--tile-color" as string]: rc, width: 16, height: 16 }}>
            <Icon name="sparkle" size={8} />
          </span>
        ))}
        {state && <span className="ml-auto text-[0.58rem] font-bold uppercase tracking-wider text-cyan">{state}</span>}
      </span>
    </button>
  );
}

function Strip({ title, icon, items, empty, render, onSelect, selectedId }: { title: string; icon: string; items: ItemInstanceDto[]; empty: string; render: (i: ItemInstanceDto) => React.ReactNode; onSelect: (id: string) => void; selectedId?: string }) {
  return (
    <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
      <div className="flex items-center gap-2 font-display text-[0.95rem] font-bold uppercase tracking-[0.08em] text-cyan">
        <Icon name={icon} size={14} /> {title}
      </div>
      {items.length === 0 && <div className="mt-2 text-xs text-dim">{empty}</div>}
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {items.map((i) => {
          const rc = accent(RARITY_COLOR[i.definition.rarity]);
          return (
            <button key={i.id} type="button" onClick={() => onSelect(i.id)} className={clsx("rarity-card flex w-[92px] shrink-0 flex-col items-center gap-1 p-2", selectedId === i.id && "selected")} style={{ ["--rc" as string]: rc }}>
              <Icon name={i.definition.icon} size={24} style={{ color: rc }} />
              <span className="w-full truncate text-center text-[0.68rem] text-text">{i.customName ?? i.definition.name}</span>
              {render(i)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DetailPanel({ item, view, act, canEdit, isDm }: { item: ItemInstanceDto; view: ReturnType<typeof useHud>["view"]; act: ReturnType<typeof useItemAction>; canEdit: boolean; isDm: boolean }) {
  const d = item.definition;
  const rc = accent(RARITY_COLOR[d.rarity]);
  const unmet = unmetRequirements(d.requirements, requirementContext(view));
  const effects = [...d.effects, ...(item.customEffects ?? [])];
  const equippable = Boolean(d.equipmentSlot) || d.category === "weapon" || d.category === "armor";
  const run = (action: Parameters<typeof act.mutate>[0]["action"]) => act.mutate({ itemId: item.id, action });
  const typeLabel = d.category === "cyberware" ? "Augment" : d.category.charAt(0).toUpperCase() + d.category.slice(1);
  const subtype = d.category === "cyberware" && d.augmentationSlot ? `${AUGMENTATION_SLOT_META[d.augmentationSlot].name} slot` : d.category === "weapon" ? `${d.damageType ?? "melee"} weapon` : d.equipmentSlot ?? d.category;
  const mods = effects.filter((e) => e.kind === "modifier").map(describePassiveEffect).join(", ");
  const props = effects.filter((e) => e.kind !== "modifier").map(describePassiveEffect).join(", ");

  return (
    <section className="rarity-card p-3" style={{ ["--rc" as string]: rc }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-amber">
          <Icon name={d.icon} size={13} /> {typeLabel}
        </span>
        <span className="rarity-pill">{rarityName(d.rarity)}</span>
      </div>
      <div className="relative mt-2 flex h-32 items-center justify-center border bg-bg-0/70" style={{ borderColor: `color-mix(in srgb, ${rc} 60%, transparent)`, boxShadow: `inset 0 0 30px color-mix(in srgb, ${rc} 15%, transparent)` }}>
        {d.imageUrl ? <img src={d.imageUrl} alt="" className="h-full w-full object-contain" /> : <Icon name={d.icon} size={64} style={{ color: rc, filter: `drop-shadow(0 0 14px ${rc})` }} />}
        <div className="hud-scan" />
      </div>
      <div className="mt-2 font-display text-[1.15rem] font-bold text-amber" style={{ color: rc }}>
        {item.customName ?? d.name}
      </div>
      <div className="text-[0.8rem] text-muted">
        {typeLabel} · {subtype}
      </div>
      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-y-1 border-t border-line/60 pt-2 text-[0.82rem]">
        {d.damage && (
          <>
            <dt className="text-muted">Damage</dt>
            <dd className="num text-text">
              {d.damage} ({d.damageType})
            </dd>
          </>
        )}
        {props && (
          <>
            <dt className="text-muted">Properties</dt>
            <dd className="text-text">{props}</dd>
          </>
        )}
        {mods && (
          <>
            <dt className="text-muted">Modifiers</dt>
            <dd className="text-text">{mods}</dd>
          </>
        )}
        {d.category === "cyberware" && (
          <>
            <dt className="text-muted">Capacity</dt>
            <dd className="num text-text">{d.capacityCost}</dd>
          </>
        )}
        {item.charges !== null && (
          <>
            <dt className="text-muted">Charges</dt>
            <dd className="num text-text">
              {item.charges} / {d.maxCharges}
            </dd>
          </>
        )}
        <dt className="text-muted">Weight</dt>
        <dd className="num text-text">{d.weight} kg</dd>
        <dt className="text-muted">Value</dt>
        <dd className="num text-text">{d.price.toLocaleString()} credits</dd>
        {item.quantity > 1 && (
          <>
            <dt className="text-muted">Quantity</dt>
            <dd className="num text-text">{item.quantity}</dd>
          </>
        )}
      </dl>
      {d.description && <p className="mt-2 border-t border-line/60 pt-2 text-[0.8rem] italic text-text/70">{d.description}</p>}
      {d.requirements.length > 0 && (
        <div className="mt-2 text-[0.75rem]">
          {d.requirements.map((r, i) => {
            const t = describeRequirement(r);
            const ok = !unmet.includes(t);
            return (
              <span key={i} className={clsx("mr-2", ok ? "text-ok" : "text-crimson")}>
                {ok ? "✓" : "✗"} {t}
              </span>
            );
          })}
        </div>
      )}
      {d.useEffects.length > 0 && <div className="mt-2 text-[0.75rem] text-cyan">On use: {d.useEffects.map((e) => (e.kind === "heal" ? `heal ${e.amount}` : e.kind === "damage" ? `${e.amount} ${e.damageType}` : e.kind === "applyCondition" ? `apply ${e.conditionKey}` : e.kind === "removeCondition" ? `remove ${e.conditionKey}` : e.kind)).join(", ")}</div>}
      {canEdit && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {item.installedSlot ? (
            <button type="button" className="hud-btn !py-2.5 !text-[0.75rem]" style={{ ["--btn-color" as string]: "var(--color-amber)" }} onClick={() => run({ action: "uninstall" })}>
              Uninstall
            </button>
          ) : d.category === "cyberware" ? (
            <button type="button" className="hud-btn !py-2.5 !text-[0.75rem]" disabled={(unmet.length > 0 && !isDm) || !view.permissions.canInstallCyberware} onClick={() => run({ action: "install" })}>
              Install
            </button>
          ) : item.status === "equipped" ? (
            <button type="button" className="hud-btn !py-2.5 !text-[0.75rem]" style={{ ["--btn-color" as string]: "var(--color-amber)" }} onClick={() => run({ action: "unequip" })}>
              Unequip
            </button>
          ) : (
            <button type="button" className="hud-btn !py-2.5 !text-[0.75rem]" disabled={!equippable || (unmet.length > 0 && !isDm)} onClick={() => run({ action: "equip" })}>
              Equip
            </button>
          )}
          {!item.installedSlot ? (
            <ConfirmButton label="Remove" confirmLabel="Drop it?" color="crimson" variant="outline" className="!py-2.5 !text-[0.75rem]" onConfirm={() => run({ action: "drop" })} />
          ) : (
            <span className="hud-btn hud-btn-ghost !py-2.5 !text-[0.75rem] opacity-40">Remove</span>
          )}
        </div>
      )}
    </section>
  );
}

function QuickActions({ item, act, isDm }: { item: ItemInstanceDto; act: ReturnType<typeof useItemAction>; isDm: boolean }) {
  const d = item.definition;
  const [name, setName] = useState("");
  const run = (action: Parameters<typeof act.mutate>[0]["action"]) => act.mutate({ itemId: item.id, action });
  const usable = d.useEffects.length > 0 || d.category === "consumable";
  const btn = "nav-box flex items-center justify-center gap-2 !px-2 !py-2 !text-[0.62rem] disabled:opacity-40";
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button type="button" className={btn} disabled={!usable || (item.charges ?? 1) <= 0} onClick={() => run({ action: "use", quantity: 1 })}>
        <Icon name="syringe" size={13} /> Use item
      </button>
      <button type="button" className={btn} disabled={Boolean(item.installedSlot)} onClick={() => run({ action: "drop", quantity: 1 })}>
        <Icon name="trash-2" size={13} /> Drop one
      </button>
      <div className="col-span-2 flex gap-1">
        <Input placeholder="Rename…" value={name} onChange={(e) => setName(e.target.value)} className="!py-1 text-xs" />
        <button type="button" className={btn} onClick={() => run({ action: "rename", customName: name || null })}>
          <Icon name="tag" size={13} /> Rename
        </button>
      </div>
      {isDm && (
        <div className="col-span-2 flex items-center gap-2 border-t border-line/50 pt-2 text-xs">
          <span className="text-crimson">DM</span>
          <Input type="number" min={0} defaultValue={item.quantity} key={`q${item.id}${item.quantity}`} className="num !w-16 !py-1" onBlur={(e) => Number(e.target.value) !== item.quantity && run({ action: "setQuantity", quantity: Number(e.target.value) })} />
          <span className="text-muted">qty</span>
          {d.maxCharges !== null && (
            <>
              <Input type="number" min={0} defaultValue={item.charges ?? 0} key={`c${item.id}${item.charges}`} className="num !w-16 !py-1" onBlur={(e) => Number(e.target.value) !== item.charges && run({ action: "setCharges", charges: Number(e.target.value) })} />
              <span className="text-muted">charges</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
