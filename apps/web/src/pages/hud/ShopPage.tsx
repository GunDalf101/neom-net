import { AUGMENTATION_SLOT_META, CYBERWARE_MAINTENANCE, DISTRICT_META, PLAN_KINDS, PLAN_KIND_META, describePassiveEffect, type CharacterView, type ItemDefinitionDto, type PlanDefinitionDto, type PlanKind } from "@neom/shared";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { useBuy, useImportCatalog, useItemDefinitions, usePlans, useSaveItemDefinition, useShop, useSubscribePlan, useUnsubscribePlan } from "@/api/hooks";
import { Link } from "react-router-dom";
import { Badge, Button, ConfirmButton, Empty, Icon, Input, Modal, Spinner } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { SHELF_META, SHELF_ORDER, metaRows, shelfOf, toItemInput } from "@/lib/itemMeta";
import { useHud } from "./HudShell";

type ShopItem = ItemDefinitionDto & { shopPrice: number };

/** The Neo City storefront: catalog shelves by kind, district-taxed prices, and the subscriptions a runner lives on. */
export function ShopPage() {
  const { view, campaign, isDm } = useHud();
  const shop = useShop(campaign.id, view.character.id);
  const importCatalog = useImportCatalog(campaign.id);
  const [shelf, setShelf] = useState<string>("weapon");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const items = shop.data?.items ?? [];
  const shelves = useMemo(() => SHELF_ORDER.filter((s) => items.some((i) => shelfOf(i) === s)), [items]);
  const active = shelves.includes(shelf) ? shelf : shelf === "plans" ? "plans" : (shelves[0] ?? "plans");
  const list = items.filter((i) => shelfOf(i) === active && (!search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase())));
  const d = shop.data?.district;

  return (
    <div className="mx-auto max-w-[1200px] space-y-3" data-testid="shop">
      <section className="hud-panel flex flex-wrap items-center gap-3 px-3 py-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
        <span className="font-display text-[1.1rem] font-black uppercase tracking-[0.08em] text-amber glow-text">Shop</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <Icon name="map-pin" size={12} />
          {d ? `${d.name} · ${d.taxPercent}% district tax` : "…"}
          <span className="hidden text-dim sm:inline" title="Your housing plan sets the district. Without one you shop in Dogtown.">
            ({view.plans.find((p) => p.plan.kind === "housing")?.plan.name ?? "no housing"})
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2 border border-amber/50 bg-bg-0/60 px-3 py-1" data-testid="shop-kamas">
          <Icon name="coins" size={14} className="text-amber" />
          <span className="num text-[1.1rem] font-black text-amber">{view.character.credits.toLocaleString()}</span>
          <span className="text-[0.6rem] uppercase tracking-wider text-muted">kamas</span>
        </span>
        {isDm && (
          <span className="flex flex-wrap items-center gap-1" data-testid="shop-dm-tools">
            <Button size="xs" color="amber" icon="plus" onClick={() => setAdding(true)}>
              Add items
            </Button>
            <ConfirmButton size="xs" color="amber" variant="outline" label={items.length ? "Refresh NEOM catalog" : "Import NEOM catalog"} confirmLabel={items.length ? "Refresh prices & stats?" : "Import 150+ items?"} disabled={importCatalog.isPending} onConfirm={() => importCatalog.mutate()} />
          </span>
        )}
      </section>
      {isDm && <AddItemsModal open={adding} onClose={() => setAdding(false)} campaignId={campaign.id} />}

      <div className="flex flex-wrap items-center gap-1" data-testid="shop-shelves">
        {shelves.map((s) => (
          <button key={s} type="button" className={clsx("hud-tab flex items-center gap-2", active === s && "active")} onClick={() => setShelf(s)}>
            <Icon name={SHELF_META[s]?.icon ?? "package"} size={12} /> {SHELF_META[s]?.label ?? s}
            <span className="num text-[0.55rem] opacity-70">{items.filter((i) => shelfOf(i) === s).length}</span>
          </button>
        ))}
        <button type="button" className={clsx("hud-tab flex items-center gap-2", active === "plans" && "active")} style={active === "plans" ? { background: "var(--color-violet)", boxShadow: "0 0 12px var(--color-violet)" } : { color: "var(--color-violet)" }} onClick={() => setShelf("plans")}>
          <Icon name="receipt" size={12} /> Plans
          <span className="num text-[0.55rem] opacity-70">{view.plans.length}</span>
        </button>
        {active !== "plans" && <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="ml-auto !w-40 !py-1 text-xs" aria-label="Search the shop" />}
      </div>

      {shop.isLoading && <Spinner />}
      {active === "plans" ? (
        <PlansPanel view={view} campaignId={campaign.id} isDm={isDm} />
      ) : (
        <>
          {!shop.isLoading && items.length === 0 && <Empty icon="store">{isDm ? "The shelves are empty. Import the NEOM catalog above, or mark workshop items as for sale." : "The shop has nothing on the shelves yet."}</Empty>}
          {items.length > 0 && list.length === 0 && <Empty icon="store">Nothing matches.</Empty>}
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((it) => (
              <ShopCard key={it.id} item={it} view={view} campaignId={campaign.id} taxPercent={d?.taxPercent ?? 0} isDm={isDm} open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ShopCard({ item: it, view, campaignId, taxPercent, isDm, open, onToggle }: { item: ShopItem; view: CharacterView; campaignId: string; taxPercent: number; isDm: boolean; open: boolean; onToggle: () => void }) {
  const buy = useBuy(campaignId);
  const save = useSaveItemDefinition(campaignId);
  const [qty, setQty] = useState(1);
  const [stockDraft, setStockDraft] = useState<string | null>(null);
  const setShelf = (patch: Partial<ReturnType<typeof toItemInput>>) => save.mutate({ id: it.id, body: { ...toItemInput(it), ...patch } });
  const rc = accent(RARITY_COLOR[it.rarity]);
  const total = it.shopPrice * (it.stackable ? qty : 1);
  const broke = view.character.credits < total;
  const soldOut = it.stock !== null && it.stock <= 0;
  const sub = it.category === "cyberware" && it.augmentationSlot ? `${AUGMENTATION_SLOT_META[it.augmentationSlot].name} · strain ${it.capacityCost}` : it.category === "weapon" ? `${String(it.meta.weaponClass ?? "weapon")} · ${it.damage ?? ""}` : it.category === "attachment" ? String(it.meta.attachmentType ?? "attachment") : it.category === "ammo" ? "per magazine" : it.category;
  const rows = metaRows(it);
  const owned = view.items.filter((i) => i.definitionId === it.id).reduce((s, i) => s + i.quantity, 0);
  return (
    <article className={clsx("rarity-card min-w-0", open && "selected")} style={{ ["--rc" as string]: rc }} data-testid="shop-item" data-open={open}>
      <button type="button" className="flex w-full items-center gap-3 p-2.5 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="tile" style={{ ["--tile-color" as string]: rc, width: 38, height: 38 }}>
          <Icon name={it.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9rem] font-semibold text-text">{it.name}</span>
          <span className="block truncate text-[0.68rem] text-muted">{sub}</span>
        </span>
        {owned > 0 && <Badge color="cyan" title="Already in your inventory">owned ×{owned}</Badge>}
        {isDm && !it.visibleToPlayers && <Badge color="crimson" title="Hidden from players: they do not see this item">hidden</Badge>}
        {it.stock !== null && <Badge color={soldOut ? "crimson" : "muted"}>{soldOut ? "sold out" : `${it.stock} left`}</Badge>}
        <span className="rarity-pill hidden sm:inline">{rarityName(it.rarity)}</span>
        <span className={clsx("num shrink-0 text-[0.95rem] font-bold", broke ? "text-dim" : "text-amber")}>{it.shopPrice.toLocaleString()} ₭</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} className="text-muted" />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line/60 p-3 text-sm" data-testid="shop-item-details">
          <p className="text-muted">{it.description}</p>
          {(rows.length > 0 || it.damage) && (
            <dl className="grid grid-cols-[8rem_1fr] gap-y-0.5 text-[0.78rem]">
              {it.damage && (
                <>
                  <dt className="text-muted">Damage</dt>
                  <dd className="num text-text">{it.damage}</dd>
                </>
              )}
              {rows.map(([k, v]) => (
                <span key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-text">{v}</dd>
                </span>
              ))}
            </dl>
          )}
          {it.effects.length > 0 && <div className="text-[0.75rem] text-violet">{it.effects.filter((e) => e.kind !== "trait").map(describePassiveEffect).join(" · ") || "Rules as written (see description)"}</div>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line/50 pt-2 text-xs">
            <span className="text-dim">
              {it.price.toLocaleString()} ₭ + {taxPercent}% tax = <span className="num text-text">{it.shopPrice.toLocaleString()} ₭</span>
              {it.stackable && qty > 1 ? ` × ${qty} = ${total.toLocaleString()} ₭` : ""}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {it.stackable && <Input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="num !w-16 !py-1" aria-label="Quantity" />}
              <Button size="sm" variant="solid" color="amber" icon="shopping-cart" disabled={broke || soldOut || buy.isPending} title={broke ? `Not enough kamas (${total.toLocaleString()} needed)` : soldOut ? "Sold out" : undefined} onClick={() => buy.mutate({ characterId: view.character.id, definitionId: it.id, quantity: it.stackable ? qty : 1 })} data-testid="shop-buy">
                {broke ? "Not enough kamas" : `Buy for ${total.toLocaleString()} ₭`}
              </Button>
            </span>
          </div>
          {isDm && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line/50 pt-2 text-xs" data-testid="shop-dm-row">
              <span className="font-display text-[0.5rem] tracking-[0.2em] text-crimson">DM</span>
              <span className="text-muted">stock</span>
              <Input
                className="num !w-20 !py-1"
                placeholder="∞"
                value={stockDraft ?? (it.stock === null ? "" : String(it.stock))}
                inputMode="numeric"
                onFocus={() => setStockDraft(it.stock === null ? "" : String(it.stock))}
                onChange={(e) => setStockDraft(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => {
                  if (stockDraft !== null) {
                    const next = stockDraft === "" ? null : Number(stockDraft);
                    if (next !== it.stock) setShelf({ stock: next });
                  }
                  setStockDraft(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label="Stock (blank = unlimited)"
              />
              <span className="text-muted">price</span>
              <Input className="num !w-24 !py-1" key={`p${it.price}`} defaultValue={it.price} inputMode="numeric" aria-label="Base price" onBlur={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "")); if (Number.isFinite(n) && n !== it.price) setShelf({ price: n }); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              <Button size="xs" variant="ghost" icon={it.visibleToPlayers ? "eye-off" : "eye"} disabled={save.isPending} onClick={() => setShelf({ visibleToPlayers: !it.visibleToPlayers })}>
                {it.visibleToPlayers ? "Hide" : "Show"}
              </Button>
              <Link to={`/c/${campaignId}/dm/workshop`} className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.55rem]" title="Edit stats, effects and description in the workshop">
                <Icon name="hammer" size={11} /> Edit
              </Link>
              <ConfirmButton size="xs" color="crimson" variant="outline" label="Remove from shop" confirmLabel="Take it off the shelf?" disabled={save.isPending} onConfirm={() => setShelf({ forSale: false })} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** DM: put existing workshop items on the shelves. New items are created in the workshop and show up here unlisted. */
function AddItemsModal({ open, onClose, campaignId }: { open: boolean; onClose: () => void; campaignId: string }) {
  const items = useItemDefinitions(campaignId);
  const save = useSaveItemDefinition(campaignId);
  const [q, setQ] = useState("");
  const unlisted = (items.data ?? []).filter((d) => !d.forSale && (!q || d.name.toLowerCase().includes(q.toLowerCase()) || d.category.includes(q.toLowerCase())));
  return (
    <Modal open={open} onClose={onClose} title="Add items to the shop" color="amber">
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Input placeholder="Search unlisted items…" value={q} onChange={(e) => setQ(e.target.value)} className="!py-1 text-xs" autoFocus />
          <Link to={`/c/${campaignId}/dm/workshop`} className="hud-btn !px-2 !py-1 !text-[0.55rem]" style={{ ["--btn-color" as string]: "var(--color-crimson)" }}>
            <Icon name="hammer" size={11} /> New item
          </Link>
        </div>
        {unlisted.length === 0 && <div className="py-4 text-center text-dim">{items.data?.length ? "Everything is already on the shelves." : "No items yet. Create one in the workshop or import the NEOM catalog."}</div>}
        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1" data-testid="shop-add-list">
          {unlisted.map((d) => (
            <div key={d.id} className="hud-panel flex items-center gap-2 p-2" style={{ ["--panel-accent" as string]: accent(RARITY_COLOR[d.rarity]) }}>
              <Icon name={d.icon} size={14} style={{ color: accent(RARITY_COLOR[d.rarity]) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text">{d.name}</span>
                <span className="text-dim">
                  {d.category} · {d.price.toLocaleString()} ₭{!d.visibleToPlayers ? " · hidden from players" : ""}
                </span>
              </span>
              <Button size="xs" color="amber" icon="plus" disabled={save.isPending} onClick={() => save.mutate({ id: d.id, body: { ...toItemInput(d), forSale: true } })}>
                Add
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function PlansPanel({ view, campaignId, isDm }: { view: CharacterView; campaignId: string; isDm: boolean }) {
  const plans = usePlans(campaignId);
  const subscribe = useSubscribePlan(campaignId);
  const unsubscribe = useUnsubscribePlan(campaignId);
  const held = new Map(view.plans.map((p) => [p.plan.kind, p]));
  const upkeep = view.items.filter((i) => i.installedSlot).map((i) => ({ name: i.customName ?? i.definition.name, cost: CYBERWARE_MAINTENANCE[i.definition.rarity] }));
  const planTotal = view.plans.reduce((s, p) => s + p.plan.monthlyCost, 0);
  const upkeepTotal = upkeep.reduce((s, u) => s + u.cost, 0);
  const total = planTotal + upkeepTotal;
  const byKind = (k: PlanKind) => (plans.data ?? []).filter((p) => p.kind === k);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]" data-testid="plans">
      <div className="space-y-3">
        {plans.isLoading && <Spinner />}
        {!plans.isLoading && (plans.data ?? []).length === 0 && <Empty icon="receipt">{isDm ? "No plans yet: import the NEOM catalog or add plans in the workshop." : "No plans on offer yet."}</Empty>}
        {PLAN_KINDS.map((k) => {
          const group = byKind(k);
          if (group.length === 0) return null;
          const m = PLAN_KIND_META[k];
          const current = held.get(k);
          return (
            <section key={k} className="hud-panel p-2" style={{ ["--panel-accent" as string]: `var(--color-${m.color})` }} data-testid={`plans-${k}`}>
              <div className="hud-title mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ color: `var(--color-${m.color})` }}>
                  <Icon name={m.icon} size={12} /> {m.label}
                </span>
                <span className="text-[0.55rem] text-dim">{current ? `current: ${current.plan.name}` : m.blurb}</span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.map((p) => (
                  <PlanCard key={p.id} plan={p} color={m.color} current={current?.planId === p.id} canAfford={view.character.credits >= p.purchasePrice} busy={subscribe.isPending || unsubscribe.isPending} onSubscribe={() => subscribe.mutate({ characterId: view.character.id, planId: p.id })} onCancel={() => unsubscribe.mutate({ characterId: view.character.id, planId: p.id })} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <aside className="hud-panel h-fit p-3 text-xs" style={{ ["--panel-accent" as string]: "var(--color-amber)" }} data-testid="plans-outlook">
        <div className="hud-title mb-2 text-amber">Monthly outlook</div>
        {view.plans.length === 0 && upkeep.length === 0 && <div className="text-dim">Nothing due. No plans, no chrome to maintain.</div>}
        <ul className="space-y-0.5">
          {view.plans.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span className="truncate text-text">{p.plan.name}</span>
              <span className="num text-muted">{p.plan.monthlyCost.toLocaleString()}</span>
            </li>
          ))}
          {upkeep.map((u, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate text-muted">upkeep · {u.name}</span>
              <span className="num text-muted">{u.cost}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2">
          <span className="font-display text-[0.6rem] uppercase tracking-wider text-muted">Due per month</span>
          <span className={clsx("num text-[1.1rem] font-bold", total > view.character.credits ? "text-crimson" : "text-amber")}>{total.toLocaleString()} ₭</span>
        </div>
        <div className="mt-1 text-[0.65rem] text-dim">
          The DM turns the month; plans you cannot pay lapse (dearest first) and unpaid chrome upkeep leaves your cyberware malfunctioning. District: {DISTRICT_META[(held.get("housing")?.plan.district ?? "dogtown") as keyof typeof DISTRICT_META].name}.
        </div>
      </aside>
    </div>
  );
}

function PlanCard({ plan, color, current, canAfford, busy, onSubscribe, onCancel }: { plan: PlanDefinitionDto; color: string; current: boolean; canAfford: boolean; busy: boolean; onSubscribe: () => void; onCancel: () => void }) {
  const effects = plan.effects.filter((e) => e.kind !== "trait").map(describePassiveEffect);
  return (
    <div className={clsx("hud-panel p-2", current && "lit")} style={{ ["--panel-accent" as string]: current ? `var(--color-${color})` : "var(--color-line-2)" }} data-testid="plan-card" data-current={current}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-text">{plan.name}</div>
          <div className="text-[0.7rem] text-muted">{plan.description}</div>
          {effects.length > 0 && <div className="text-[0.68rem] text-violet">{effects.join(" · ")}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[0.95rem] font-bold text-amber">{plan.monthlyCost.toLocaleString()} ₭</div>
          <div className="text-[0.55rem] uppercase tracking-wider text-muted">per month</div>
          {plan.purchasePrice > 0 && <div className="num text-[0.65rem] text-cyan">+ {plan.purchasePrice.toLocaleString()} ₭ once</div>}
        </div>
      </div>
      <div className="mt-1.5 flex justify-end">
        {current ? (
          <Button size="xs" variant="ghost" icon="x" disabled={busy} onClick={onCancel}>
            Cancel plan
          </Button>
        ) : (
          <Button size="xs" color={color} icon="check" disabled={busy || !canAfford} title={!canAfford ? `Needs ${plan.purchasePrice.toLocaleString()} ₭ up front` : undefined} onClick={onSubscribe}>
            {plan.purchasePrice > 0 ? "Buy & subscribe" : "Subscribe"}
          </Button>
        )}
      </div>
    </div>
  );
}
