import { AUGMENTATION_SLOT_META, DISTRICTS, DISTRICT_META, PLAN_KINDS, PLAN_KIND_META, RARITIES, defaultPlanFor, describePassiveEffect, itemUpkeep, netSalary, planDue, type CharacterPlanDto, type CharacterView, type ItemDefinitionDto, type District, type PlanDefinitionDto, type PlanKind, type Rarity } from "@neom/shared";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { useBillMonth, useBuy, useImportCatalog, useItemDefinitions, usePlans, useSaveItemDefinition, useSession, useShop, useSponsorPlan, useSubscribePlan, useSetTaxDistrict, useTransferSavings, useUnsubscribePlan, useUpdateCharacter } from "@/api/hooks";
import { Link } from "react-router-dom";
import { ShopManager } from "@/components/dm/ShopManager";
import { Badge, Button, ConfirmButton, Empty, Icon, Input, Modal, Select, Spinner } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { SHELF_META, SHELF_ORDER, metaRows, shelfOf, toItemInput } from "@/lib/itemMeta";
import { useHud } from "./HudShell";

type ShopItem = ItemDefinitionDto;
type SortKey = "price" | "priceDesc" | "name" | "rarity";
const RARITY_RANK: Record<string, number> = Object.fromEntries(RARITIES.map((r, i) => [r, i]));

/** The sub-type a shelf filters on: weapon class, attachment type, body slot or ammo type. */
function typeOf(it: ShopItem): string | null {
  if (it.category === "weapon") return (it.meta.weaponClass as string | undefined) ?? null;
  if (it.category === "attachment") return (it.meta.attachmentType as string | undefined) ?? null;
  if (it.category === "cyberware") return it.augmentationSlot ? AUGMENTATION_SLOT_META[it.augmentationSlot].name : null;
  if (it.category === "ammo") return (it.meta.ammoType as string | undefined) ?? null;
  return it.equipmentSlot ?? null;
}
/** Compatibility tags an item advertises (weapons and attachments share one vocabulary: Pistol, SMG, Rifle, Smart…). */
function compatOf(it: Pick<ItemDefinitionDto, "meta">): string[] {
  const tags = it.meta.compatTags;
  return Array.isArray(tags) ? (tags as string[]) : [];
}
/** What the character's own weapons accept: their compatibility tags and ammunition types. */
function ownedCompat(view: CharacterView): { tags: Set<string>; ammo: Set<string> } {
  const tags = new Set<string>();
  const ammo = new Set<string>();
  for (const i of view.items) {
    if (i.definition.category !== "weapon") continue;
    for (const t of compatOf(i.definition)) tags.add(t);
    const a = i.definition.meta.ammoType;
    if (typeof a === "string" && a !== "None") ammo.add(a);
  }
  return { tags, ammo };
}

/** The Neo City storefront: catalog shelves by kind, district-taxed prices, and the subscriptions a runner lives on. */
export function ShopPage() {
  const { view, campaign, isDm } = useHud();
  const shop = useShop(campaign.id);
  const importCatalog = useImportCatalog(campaign.id);
  const [shelf, setShelf] = useState<string>("plans");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<Rarity | "">("");
  const [type, setType] = useState("");
  const [compat, setCompat] = useState("");
  const [affordable, setAffordable] = useState(false);
  const [sort, setSort] = useState<SortKey>("price");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The DM lands on the storefront like a player; "Manage" swaps it for the editable table of every item.
  const [manage, setManage] = useState(false);
  const items = shop.data?.items ?? [];
  const shelves = useMemo(() => SHELF_ORDER.filter((s) => items.some((i) => shelfOf(i) === s)), [items]);
  const active = shelves.includes(shelf) ? shelf : shelf === "plans" ? "plans" : (shelves[0] ?? "plans");
  const onShelf = items.filter((i) => shelfOf(i) === active);
  const types = useMemo(() => [...new Set(onShelf.map(typeOf).filter((t): t is string => Boolean(t)))].sort(), [onShelf]);
  const compatTags = useMemo(() => [...new Set(onShelf.flatMap(compatOf))].sort(), [onShelf]);
  const mine = useMemo(() => ownedCompat(view), [view]);
  const list = useMemo(() => {
    const q = search.toLowerCase();
    const out = onShelf.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q) && !i.description.toLowerCase().includes(q)) return false;
      if (rarity && i.rarity !== rarity) return false;
      if (type && typeOf(i) !== type) return false;
      if (affordable && i.price > view.character.credits) return false;
      if (compat === "mine") {
        if (i.category === "ammo") return typeof i.meta.ammoType === "string" && mine.ammo.has(i.meta.ammoType);
        const tags = compatOf(i);
        return tags.length === 0 || tags.some((t) => mine.tags.has(t));
      }
      if (compat) return compatOf(i).includes(compat);
      return true;
    });
    const cmp: Record<SortKey, (a: ShopItem, b: ShopItem) => number> = {
      price: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
      rarity: (a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || a.price - b.price,
    };
    return [...out].sort(cmp[sort]);
  }, [onShelf, search, rarity, type, compat, affordable, sort, view.character.credits, mine]);
  const filtersOn = Boolean(rarity || type || compat || affordable || search);
  const showCompat = active === "attachment" || active === "weapon" || active === "ammo";

  return (
    <div className="mx-auto max-w-[1200px] space-y-3" data-testid="shop">
      <section className="hud-panel flex flex-wrap items-center gap-3 px-3 py-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
        <span className="font-display text-[1.1rem] font-black uppercase tracking-[0.08em] text-amber glow-text">Shop</span>
        <span className="text-xs text-muted">
          {items.length} items on the shelves · listed prices, no tax
        </span>
        <span className="ml-auto flex items-center gap-2 border border-amber/50 bg-bg-0/60 px-3 py-1" data-testid="shop-kamas">
          <Icon name="coins" size={14} className="text-amber" />
          <span className="num text-[1.1rem] font-black text-amber">{view.character.credits.toLocaleString()}</span>
          <span className="text-[0.6rem] uppercase tracking-wider text-muted">kamas</span>
        </span>
        {isDm && (
          <span className="flex flex-wrap items-center gap-1" data-testid="shop-dm-tools">
            <Button size="xs" color="crimson" variant={manage ? "solid" : "outline"} icon={manage ? "store" : "sliders-horizontal"} onClick={() => setManage((m) => !m)} data-testid="shop-manage-toggle">
              {manage ? "Back to storefront" : "Manage shop"}
            </Button>
            <Button size="xs" color="amber" icon="plus" onClick={() => setAdding(true)}>
              Add items
            </Button>
            <ConfirmButton size="xs" color="amber" variant="outline" label={items.length ? "Refresh NEOM catalog" : "Import NEOM catalog"} confirmLabel={items.length ? "Refresh prices & stats?" : "Import 150+ items?"} disabled={importCatalog.isPending} onConfirm={() => importCatalog.mutate()} />
          </span>
        )}
      </section>
      {isDm && <AddItemsModal open={adding} onClose={() => setAdding(false)} campaignId={campaign.id} />}

      {isDm && manage && <ShopManager campaignId={campaign.id} grantTo={{ id: view.character.id, name: view.character.name }} />}
      <div className={clsx("flex flex-wrap items-center gap-1", isDm && manage && "hidden")} data-testid="shop-shelves">
        <button type="button" className={clsx("hud-tab flex items-center gap-2", active === "plans" && "active")} style={active === "plans" ? { background: "var(--color-violet)", boxShadow: "0 0 12px var(--color-violet)" } : { color: "var(--color-violet)" }} onClick={() => setShelf("plans")}>
          <Icon name="receipt" size={12} /> Plans
          <span className="num text-[0.55rem] opacity-70">{view.plans.length}</span>
        </button>
        {shelves.map((s) => (
          <button key={s} type="button" className={clsx("hud-tab flex items-center gap-2", active === s && "active")} onClick={() => { setShelf(s); setType(""); setCompat(""); }}>
            <Icon name={SHELF_META[s]?.icon ?? "package"} size={12} /> {SHELF_META[s]?.label ?? s}
            <span className="num text-[0.55rem] opacity-70">{items.filter((i) => shelfOf(i) === s).length}</span>
          </button>
        ))}
      </div>

      {active !== "plans" && !(isDm && manage) && (
        <div className="hud-panel flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs" style={{ ["--panel-accent" as string]: "var(--color-line-2)" }} data-testid="shop-filters">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-36 !py-1 text-xs" aria-label="Search the shop" />
          <span className="flex items-center gap-1" role="group" aria-label="Rarity">
            {(["", ...RARITIES.filter((r) => onShelf.some((i) => i.rarity === r))] as (Rarity | "")[]).map((r) => (
              <button key={r || "all"} type="button" className={clsx("hud-btn !px-2 !py-0.5 !text-[0.5rem]", rarity !== r && "hud-btn-ghost")} style={{ ["--btn-color" as string]: r ? accent(RARITY_COLOR[r]) : "var(--color-cyan)" }} onClick={() => setRarity(r)} aria-pressed={rarity === r}>
                {r ? rarityName(r) : "All tiers"}
              </button>
            ))}
          </span>
          {types.length > 1 && (
            <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto !py-1 text-xs" aria-label="Type">
              <option value="">{active === "cyberware" || active === "shimmer" ? "Any body slot" : active === "ammo" ? "Any calibre" : "Any type"}</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
          {showCompat && (
            <Select value={compat} onChange={(e) => setCompat(e.target.value)} className="!w-auto !py-1 text-xs" aria-label="Compatibility" data-testid="shop-compat">
              <option value="">Any compatibility</option>
              <option value="mine" disabled={mine.tags.size === 0 && mine.ammo.size === 0}>
                {mine.tags.size || mine.ammo.size ? "Fits my weapons" : "Fits my weapons (none tagged yet)"}
              </option>
              {compatTags.map((t) => (
                <option key={t} value={t}>
                  Fits {t}
                </option>
              ))}
            </Select>
          )}
          <button type="button" className={clsx("hud-btn !px-2 !py-0.5 !text-[0.5rem]", !affordable && "hud-btn-ghost")} style={{ ["--btn-color" as string]: "var(--color-amber)" }} onClick={() => setAffordable((v) => !v)} aria-pressed={affordable}>
            <Icon name="coins" size={10} /> I can afford
          </button>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="ml-auto !w-auto !py-1 text-xs" aria-label="Sort">
            <option value="price">Price ↑</option>
            <option value="priceDesc">Price ↓</option>
            <option value="rarity">Rarity</option>
            <option value="name">Name</option>
          </Select>
          <span className="num text-dim">{list.length}/{onShelf.length}</span>
          {filtersOn && (
            <Button size="xs" variant="ghost" icon="x" onClick={() => { setSearch(""); setRarity(""); setType(""); setCompat(""); setAffordable(false); }}>
              Clear
            </Button>
          )}
        </div>
      )}

      {shop.isLoading && <Spinner />}
      {isDm && manage ? null : active === "plans" ? (
        <PlansPanel view={view} campaignId={campaign.id} isDm={isDm} />
      ) : (
        <>
          {!shop.isLoading && items.length === 0 && <Empty icon="store">{isDm ? "The shelves are empty. Import the NEOM catalog above, or mark workshop items as for sale." : "The shop has nothing on the shelves yet."}</Empty>}
          {items.length > 0 && list.length === 0 && <Empty icon="store">Nothing matches these filters.</Empty>}
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((it) => (
              <ShopCard key={it.id} item={it} view={view} campaignId={campaign.id} isDm={isDm} open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ShopCard({ item: it, view, campaignId, isDm, open, onToggle }: { item: ShopItem; view: CharacterView; campaignId: string; isDm: boolean; open: boolean; onToggle: () => void }) {
  const buy = useBuy(campaignId);
  const save = useSaveItemDefinition(campaignId);
  const [qty, setQty] = useState(1);
  const [stockDraft, setStockDraft] = useState<string | null>(null);
  const setShelf = (patch: Partial<ReturnType<typeof toItemInput>>) => save.mutate({ id: it.id, body: { ...toItemInput(it), ...patch } });
  const rc = accent(RARITY_COLOR[it.rarity]);
  const total = it.price * (it.stackable ? qty : 1);
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
        {itemUpkeep(it, true) > 0 && <Badge color="violet" title={it.category === "cyberware" ? "Monthly upkeep once installed, billed with your plans" : "Monthly upkeep, billed with your plans"}>{itemUpkeep(it, true).toLocaleString()} ₭/mo</Badge>}
        <span className="rarity-pill hidden sm:inline">{rarityName(it.rarity)}</span>
        <span className={clsx("num shrink-0 text-[0.95rem] font-bold", broke ? "text-dim" : "text-amber")}>{it.price.toLocaleString()} ₭</span>
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
              <span className="num text-text">{it.price.toLocaleString()} ₭</span>
              {it.stackable && qty > 1 ? ` × ${qty} = ${total.toLocaleString()} ₭` : ""}
              {compatOf(it).length > 0 && <span className="ml-2">fits {compatOf(it).join(", ")}</span>}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {it.stackable && <Input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="num !w-16 !py-1" aria-label="Quantity" />}
              <Button size="sm" variant="solid" color="amber" icon="shopping-cart" disabled={broke || soldOut || buy.isPending} title={broke ? `Not enough balance (${total.toLocaleString()} needed)${view.character.savings >= total ? " — withdraw from savings in the Plans tab" : ""}` : soldOut ? "Sold out" : undefined} onClick={() => buy.mutate({ characterId: view.character.id, definitionId: it.id, quantity: it.stackable ? qty : 1 })} data-testid="shop-buy">
                {broke ? (view.character.savings >= total ? "Withdraw from savings first" : "Not enough kamas") : `Buy for ${total.toLocaleString()} ₭`}
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
              <Link to={`/c/${campaignId}/dm/workshop?item=${it.id}`} className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.55rem]" title="Edit stats, effects and description in the workshop">
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
  const session = useSession(campaignId);
  const subscribe = useSubscribePlan(campaignId);
  const unsubscribe = useUnsubscribePlan(campaignId);
  const transfer = useTransferSavings(view.character.id);
  const setDistrict = useSetTaxDistrict(view.character.id);
  const sponsor = useSponsorPlan(campaignId);
  const update = useUpdateCharacter(view.character.id);
  const payMonth = useBillMonth(campaignId);
  const [move, setMove] = useState("");
  const canMove = view.permissions.isOwner || isDm;
  // Downtime only: players cannot touch plans while the DM's session is live.
  const locked = !isDm && Boolean(session.data);
  const held = new Map(view.plans.map((p) => [p.plan.kind, p]));
  const upkeep = view.items.map((i) => ({ name: i.customName ?? i.definition.name, cost: itemUpkeep(i.definition, Boolean(i.installedSlot)) * Math.max(1, i.quantity) })).filter((u) => u.cost > 0);
  // Required kinds are never "none": without a plan the cheapest one is billed (and taken) when the month turns.
  const defaults = PLAN_KINDS.filter((k) => PLAN_KIND_META[k].required && !held.has(k))
    .map((k) => defaultPlanFor(k, plans.data ?? []))
    .filter((p): p is PlanDefinitionDto => Boolean(p));
  const planTotal = view.plans.reduce((s, p) => s + p.monthlyDue, 0) + defaults.reduce((s, p) => s + p.monthlyCost, 0);
  const upkeepTotal = upkeep.reduce((s, u) => s + u.cost, 0);
  const total = planTotal + upkeepTotal;
  // Housing decides the tax district; without housing the player registers wherever they like (Dogtown by default).
  const housingDistrict = (held.get("housing")?.plan.district ?? null) as District | null;
  const district: District = housingDistrict ?? view.character.taxDistrict ?? "dogtown";
  const tax = DISTRICT_META[district].taxPercent;
  const canPickDistrict = !housingDistrict && canMove && !locked;
  const net = netSalary(view.character.salary, tax);
  const monthNet = net - total;
  const balanceAfter = view.character.credits + monthNet;
  const byKind = (k: PlanKind) => (plans.data ?? []).filter((p) => p.kind === k);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]" data-testid="plans">
      <div className="space-y-3">
        {locked && (
          <div className="flex items-center gap-2 border border-amber/50 bg-amber/5 px-3 py-2 text-xs text-amber" data-testid="plans-locked">
            <Icon name="lock" size={13} /> Session in progress: plans are locked until the DM ends it. You can still browse.
          </div>
        )}
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
                <span className="flex items-center gap-1.5 text-[0.55rem] text-dim">
                  {m.required && <Badge color={current ? "muted" : "crimson"}>{current ? "required" : "required · none picked"}</Badge>}
                  {current ? `current: ${current.plan.name}` : m.blurb}
                </span>
              </div>
              {m.required && !current && defaults.find((d) => d.kind === k) && (
                <div className="mb-1.5 text-[0.65rem] text-crimson/90" data-testid={`plan-default-${k}`}>
                  Not optional: until you pick one, {defaults.find((d) => d.kind === k)!.name} ({defaults.find((d) => d.kind === k)!.monthlyCost.toLocaleString()} ₭ / month) is billed and taken when the month turns.
                </div>
              )}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    color={m.color}
                    held={current?.planId === p.id ? current : null}
                    canCancel={isDm || !m.required}
                    isDm={isDm}
                    canAfford={view.character.credits >= p.purchasePrice}
                    busy={locked || subscribe.isPending || unsubscribe.isPending || sponsor.isPending}
                    onSubscribe={() => subscribe.mutate({ characterId: view.character.id, planId: p.id })}
                    onCancel={() => unsubscribe.mutate({ characterId: view.character.id, planId: p.id })}
                    onSponsor={(discountPercent, who) => sponsor.mutate({ characterId: view.character.id, planId: p.id, discountPercent, sponsor: who })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <aside className="hud-panel h-fit p-3 text-xs" style={{ ["--panel-accent" as string]: "var(--color-amber)" }} data-testid="plans-outlook">
        <div className="hud-title mb-2 text-amber">Accounts</div>
        <div className="mb-2 grid grid-cols-2 gap-2" data-testid="accounts">
          <div className="border border-amber/50 bg-bg-0/60 px-2 py-1.5">
            <div className="text-[0.55rem] uppercase tracking-wider text-muted">Balance</div>
            {isDm ? <MoneyBox value={view.character.credits} color="amber" label="Balance" testId="dm-balance" onSave={(n) => update.mutate({ credits: n })} /> : <div className="num text-[1.05rem] font-bold text-amber">{view.character.credits.toLocaleString()} ₭</div>}
            <div className="text-[0.55rem] text-dim">{isDm ? "DM: type to set" : "spendable"}</div>
          </div>
          <div className="border border-cyan/40 bg-bg-0/60 px-2 py-1.5">
            <div className="text-[0.55rem] uppercase tracking-wider text-muted">Savings</div>
            {isDm ? <MoneyBox value={view.character.savings} color="cyan" label="Savings" testId="dm-savings" onSave={(n) => update.mutate({ savings: n })} /> : <div className="num text-[1.05rem] font-bold text-cyan">{view.character.savings.toLocaleString()} ₭</div>}
            <div className="text-[0.55rem] text-dim">{isDm ? "DM: type to set" : "yours, banked at session end"}</div>
          </div>
        </div>
        {canMove && (
          <div className="mb-2 flex items-center gap-1" data-testid="savings-transfer">
            <Input value={move} inputMode="numeric" placeholder="amount" aria-label="Amount to move" className="num !w-20 !py-1 text-xs" onChange={(e) => setMove(e.target.value.replace(/[^0-9]/g, ""))} />
            <Button size="xs" color="cyan" icon="arrow-down-to-line" disabled={!Number(move) || Number(move) > view.character.credits || transfer.isPending} title="Balance → savings" onClick={() => { transfer.mutate({ direction: "deposit", amount: Number(move) }); setMove(""); }}>
              Deposit
            </Button>
            <Button size="xs" color="amber" icon="arrow-up-from-line" disabled={!Number(move) || Number(move) > view.character.savings || transfer.isPending} title="Savings → balance" onClick={() => { transfer.mutate({ direction: "withdraw", amount: Number(move) }); setMove(""); }}>
              Withdraw
            </Button>
          </div>
        )}
        <div className="hud-title mb-2 text-amber">Monthly outlook</div>
        <div className="mb-2 border-b border-line/60 pb-2" data-testid="payday">
          <div className="flex items-center justify-between gap-2">
            <span className="text-text">Salary{isDm && <span className="text-dim"> · DM sets</span>}</span>
            {isDm ? <MoneyBox value={view.character.salary} color="text" label="Monthly salary" testId="dm-salary" small onSave={(n) => update.mutate({ salary: n })} /> : <span className="num text-text">{view.character.salary.toLocaleString()}</span>}
          </div>
          <div className="flex items-center justify-between gap-2 text-muted">
            {canPickDistrict ? (
              <label className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">Taxed in</span>
                <Select
                  className="!w-auto !py-0.5 text-[0.75rem]"
                  value={district}
                  title="No housing: pick the district you are registered in. A housing plan will set it for you."
                  data-testid="tax-district"
                  onChange={(e) => setDistrict.mutate(e.target.value as District)}
                >
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {DISTRICT_META[d].name} · {DISTRICT_META[d].taxPercent}%
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <span title={housingDistrict ? "Set by your housing plan" : locked ? "Locked while the session is live" : undefined} data-testid="tax-district-label">
                {DISTRICT_META[district].name} tax {tax}%{housingDistrict ? " · housing" : ""}
              </span>
            )}
            <span className="num">−{(view.character.salary - net).toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-display text-[0.6rem] uppercase tracking-wider text-muted">Payday</span>
            <span className="num font-bold text-ok">+{net.toLocaleString()} ₭</span>
          </div>
        </div>
        {view.plans.length === 0 && defaults.length === 0 && upkeep.length === 0 && <div className="text-dim">Nothing due. No plans, no chrome to maintain.</div>}
        <ul className="space-y-0.5">
          {view.plans.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span className="truncate text-text">
                {p.plan.name}
                {p.discountPercent > 0 && <span className="text-ok"> · {p.discountPercent === 100 ? "paid" : `−${p.discountPercent}%`}{p.sponsor ? ` by ${p.sponsor}` : ""}</span>}
              </span>
              <span className={clsx("num", p.monthlyDue ? "text-crimson/80" : "text-ok")}>−{p.monthlyDue.toLocaleString()}</span>
            </li>
          ))}
          {defaults.map((p) => (
            <li key={p.id} className="flex justify-between gap-2" data-testid="outlook-default">
              <span className="truncate text-crimson/90">{p.name} <span className="text-dim">· default {PLAN_KIND_META[p.kind].label.toLowerCase()}</span></span>
              <span className="num text-crimson/80">−{p.monthlyCost.toLocaleString()}</span>
            </li>
          ))}
          {upkeep.map((u, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate text-muted">upkeep · {u.name}</span>
              <span className="num text-crimson/80">−{u.cost.toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2" data-testid="month-net">
          <span className="font-display text-[0.6rem] uppercase tracking-wider text-muted">Net this month</span>
          <span className={clsx("num text-[1.1rem] font-bold", monthNet < 0 ? "text-crimson" : monthNet > 0 ? "text-ok" : "text-amber")}>
            {monthNet > 0 ? "+" : ""}
            {monthNet.toLocaleString()} ₭
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-muted">
          <span>Balance after the month</span>
          <span className={clsx("num", balanceAfter < 0 ? "text-crimson" : "text-text")}>{balanceAfter.toLocaleString()} ₭</span>
        </div>
        {isDm && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/60 pt-2" data-testid="pay-month">
            <span className="text-[0.65rem] text-muted">Pay this character's month now (salary in, bills out).</span>
            <ConfirmButton size="xs" color="ok" variant="solid" label="Pay month" confirmLabel={`${monthNet >= 0 ? "+" : ""}${monthNet.toLocaleString()} ₭?`} disabled={payMonth.isPending} onConfirm={() => payMonth.mutate({ characterId: view.character.id })} />
          </div>
        )}
        <div className="mt-1 text-[0.65rem] text-dim">
          The DM turns the month: salary lands in your balance first (taxed where you live), then plans and upkeep are collected from it. Plans you cannot pay lapse (dearest first) and unpaid chrome upkeep leaves your cyberware malfunctioning. When a session ends, whatever balance is left is banked into savings.
        </div>
      </aside>
    </div>
  );
}

function PlanCard({ plan, color, held, canCancel, isDm, canAfford, busy, onSubscribe, onCancel, onSponsor }: { plan: PlanDefinitionDto; color: string; held: CharacterPlanDto | null; canCancel: boolean; isDm: boolean; canAfford: boolean; busy: boolean; onSubscribe: () => void; onCancel: () => void; onSponsor: (discountPercent: number, sponsor: string | null) => void }) {
  const effects = plan.effects.filter((e) => e.kind !== "trait").map(describePassiveEffect);
  const current = Boolean(held);
  const [discount, setDiscount] = useState<number | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const pct = discount ?? held?.discountPercent ?? 0;
  const payer = who ?? held?.sponsor ?? "";
  const dirty = held ? pct !== held.discountPercent || (payer.trim() || null) !== (held.sponsor ?? null) : false;
  return (
    <div className={clsx("hud-panel p-2", current && "lit")} style={{ ["--panel-accent" as string]: current ? `var(--color-${color})` : "var(--color-line-2)" }} data-testid="plan-card" data-current={current}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-text">{plan.name}</div>
          <div className="text-[0.7rem] text-muted">{plan.description}</div>
          {effects.length > 0 && <div className="text-[0.68rem] text-violet">{effects.join(" · ")}</div>}
          {held && held.discountPercent > 0 && (
            <div className="text-[0.68rem] text-ok" data-testid="plan-sponsor">
              {held.discountPercent === 100 ? "Paid in full" : `${held.discountPercent}% covered`} by {held.sponsor || "a benefactor"} · you pay {held.monthlyDue.toLocaleString()} ₭
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[0.95rem] font-bold text-amber">
            {held && held.discountPercent > 0 ? (
              <>
                <s className="text-muted">{plan.monthlyCost.toLocaleString()}</s> {held.monthlyDue.toLocaleString()}
              </>
            ) : (
              plan.monthlyCost.toLocaleString()
            )}{" "}
            ₭
          </div>
          <div className="text-[0.55rem] uppercase tracking-wider text-muted">per month</div>
          {plan.purchasePrice > 0 && <div className="num text-[0.65rem] text-cyan">+ {plan.purchasePrice.toLocaleString()} ₭ once</div>}
        </div>
      </div>
      {isDm && held && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line/40 pt-1.5" data-testid="sponsor-controls">
          <Select value={String(pct)} onChange={(e) => setDiscount(Number(e.target.value))} className="!w-auto !py-0.5 text-[0.7rem]" aria-label="Sponsorship">
            <option value="0">Pays in full</option>
            <option value="25">25% off</option>
            <option value="50">Half paid</option>
            <option value="75">75% off</option>
            <option value="100">Free</option>
          </Select>
          <Input value={payer} placeholder="who pays (Arasaka…)" aria-label="Sponsor" className="!w-36 !py-0.5 text-[0.7rem]" disabled={pct === 0} onChange={(e) => setWho(e.target.value)} />
          <Button
            size="xs"
            color="ok"
            icon="check"
            disabled={busy || !dirty}
            onClick={() => {
              onSponsor(pct, pct ? payer.trim() || null : null);
              setDiscount(null);
              setWho(null);
            }}
          >
            Apply
          </Button>
        </div>
      )}
      <div className="mt-1.5 flex justify-end">
        {current ? (
          canCancel ? (
            <Button size="xs" variant="ghost" icon="x" disabled={busy} onClick={onCancel}>
              Cancel plan
            </Button>
          ) : (
            <span className="text-[0.65rem] text-dim" title="Not optional: pick another plan of this kind to switch">
              Required · switch to change
            </span>
          )
        ) : (
          <Button size="xs" color={color} icon="check" disabled={busy || !canAfford} title={!canAfford ? `Needs ${plan.purchasePrice.toLocaleString()} ₭ up front` : undefined} onClick={onSubscribe}>
            {plan.purchasePrice > 0 ? "Buy & subscribe" : "Subscribe"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** DM-editable kama figure: type a number, blur or Enter saves. */
function MoneyBox({ value, color, label, testId, small, onSave }: { value: number; color: string; label: string; testId: string; small?: boolean; onSave: (n: number) => void }) {
  return (
    <input
      key={`${testId}-${value}`}
      className={clsx("valbox", small ? "!text-[0.85rem] w-20" : "!text-[1rem] w-24")}
      style={{ ["--val-color" as string]: `var(--color-${color})` }}
      defaultValue={value}
      inputMode="numeric"
      aria-label={label}
      data-testid={testId}
      onBlur={(e) => {
        const n = Number(e.target.value.replace(/[^0-9]/g, ""));
        if (Number.isFinite(n) && n !== value) onSave(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
