import { RARITIES, itemUpkeep, type ItemBulkInput, type ItemDefinitionDto } from "@neom/shared";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBulkItems, useGrantItem, useItemDefinitions, useSaveItemDefinition } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Empty, Icon, Input, Select, Spinner } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { SHELF_META, SHELF_ORDER, shelfOf, toItemInput } from "@/lib/itemMeta";
import { Chips, FilterBar, FilterSelect, matches } from "./Filters";

type Status = "" | "listed" | "unlisted" | "hidden" | "limited" | "soldOut";
type Sort = "name" | "price" | "priceDesc" | "rarity" | "stock";

/**
 * DM shop management: every item definition as a row, with the shelf state editable in place (price, stock,
 * upkeep, listed, visible) and bulk actions over a selection. `grantTo` adds a "Give" button for that character.
 */
export function ShopManager({ campaignId, grantTo }: { campaignId: string; grantTo?: { id: string; name: string } }) {
  const items = useItemDefinitions(campaignId);
  const save = useSaveItemDefinition(campaignId);
  const bulk = useBulkItems(campaignId);
  const grant = useGrantItem(campaignId);
  const [search, setSearch] = useState("");
  const [shelf, setShelf] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [stockIn, setStockIn] = useState("");
  const [pctIn, setPctIn] = useState("");
  const [upkeepIn, setUpkeepIn] = useState("");
  const all = items.data ?? [];
  const is = (d: ItemDefinitionDto, s: Status) => (s === "listed" ? d.forSale : s === "unlisted" ? !d.forSale : s === "hidden" ? !d.visibleToPlayers : s === "limited" ? d.forSale && d.stock !== null && d.stock > 0 : s === "soldOut" ? d.forSale && d.stock === 0 : true);
  const rank = (r: string) => RARITIES.indexOf(r as (typeof RARITIES)[number]);
  const list = useMemo(
    () =>
      all
        .filter((d) => matches(search, d.name, d.description, d.category, ...d.tags))
        .filter((d) => !shelf || shelfOf(d) === shelf)
        .filter((d) => is(d, status))
        .filter((d) => !rarity || d.rarity === rarity)
        .sort((a, b) => (sort === "price" ? a.price - b.price : sort === "priceDesc" ? b.price - a.price : sort === "rarity" ? rank(b.rarity) - rank(a.rarity) || a.name.localeCompare(b.name) : sort === "stock" ? (a.stock ?? 1e9) - (b.stock ?? 1e9) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, search, shelf, status, rarity, sort],
  );
  const dirty = Boolean(search || shelf || status || rarity || sort !== "name");
  const reset = () => { setSearch(""); setShelf(""); setStatus(""); setRarity(""); setSort("name"); };
  const visibleIds = list.map((d) => d.id);
  const sel = visibleIds.filter((id) => picked.has(id));
  const allPicked = sel.length === list.length && list.length > 0;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (body: Omit<ItemBulkInput, "ids" | "patch"> & { patch?: ItemBulkInput["patch"] }) => bulk.mutate({ ids: sel, patch: body.patch ?? {}, pricePercent: body.pricePercent });
  const patchOne = (d: ItemDefinitionDto, patch: Partial<ReturnType<typeof toItemInput>>) => save.mutate({ id: d.id, body: { ...toItemInput(d), ...patch } });
  const shelves = SHELF_ORDER.filter((s) => all.some((d) => shelfOf(d) === s));
  const count = (s: Status) => all.filter((d) => is(d, s)).length;

  return (
    <div className="space-y-2" data-testid="shop-manager">
      <FilterBar search={search} onSearch={setSearch} placeholder="Search every item…" count={list.length} total={all.length} dirty={dirty} onReset={reset} testId="manager-filters">
        <FilterSelect label="Rarity" value={rarity} onChange={setRarity} options={RARITIES.map((r) => ({ value: r, label: rarityName(r) }))} />
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!w-auto !py-1 text-xs" aria-label="Sort">
          <option value="name">Name A–Z</option>
          <option value="price">Price ↑</option>
          <option value="priceDesc">Price ↓</option>
          <option value="rarity">Rarity ↓</option>
          <option value="stock">Stock ↑</option>
        </Select>
      </FilterBar>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Chips label="Shelf" size="xs" value={shelf} onChange={setShelf} options={[{ value: "", label: "All shelves", count: all.length }, ...shelves.map((s) => ({ value: s, label: SHELF_META[s]?.label ?? s, count: all.filter((d) => shelfOf(d) === s).length }))]} />
        <Chips<Status> label="Status" size="xs" value={status} onChange={setStatus} options={[{ value: "", label: "Any" }, { value: "listed", label: "On the shelf", count: count("listed"), color: "amber" }, { value: "unlisted", label: "Off the shelf", count: count("unlisted"), color: "cyan" }, { value: "hidden", label: "Hidden", count: count("hidden"), color: "crimson" }, { value: "limited", label: "Limited stock", count: count("limited"), color: "violet" }, { value: "soldOut", label: "Sold out", count: count("soldOut"), color: "crimson" }]} />
      </div>

      <div className={clsx("hud-panel flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs", sel.length === 0 && "opacity-60")} style={{ ["--panel-accent" as string]: sel.length ? "var(--color-amber)" : "var(--color-line-2)" }} data-testid="manager-bulk">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(visibleIds))} aria-label="Select everything shown" data-testid="manager-pick-all" />
          <span className="num text-text">{sel.length}</span>
          <span className="text-muted">selected</span>
        </label>
        <Button size="xs" color="amber" icon="store" disabled={!sel.length || bulk.isPending} onClick={() => run({ patch: { forSale: true } })}>List</Button>
        <Button size="xs" variant="ghost" icon="archive" disabled={!sel.length || bulk.isPending} onClick={() => run({ patch: { forSale: false } })}>Unlist</Button>
        <Button size="xs" variant="ghost" icon="eye" disabled={!sel.length || bulk.isPending} onClick={() => run({ patch: { visibleToPlayers: true } })}>Show</Button>
        <Button size="xs" variant="ghost" icon="eye-off" disabled={!sel.length || bulk.isPending} onClick={() => run({ patch: { visibleToPlayers: false } })}>Hide</Button>
        <span className="flex items-center gap-1">
          <Input value={stockIn} placeholder="∞" inputMode="numeric" aria-label="Stock for the selection" className="num !w-14 !py-0.5 text-xs" onChange={(e) => setStockIn(e.target.value.replace(/[^0-9]/g, ""))} />
          <Button size="xs" variant="ghost" disabled={!sel.length || bulk.isPending} title="Blank = unlimited" onClick={() => run({ patch: { stock: stockIn === "" ? null : Number(stockIn) } })}>Set stock</Button>
        </span>
        <span className="flex items-center gap-1">
          <Input value={pctIn} placeholder="±%" inputMode="numeric" aria-label="Price change in percent" className="num !w-14 !py-0.5 text-xs" onChange={(e) => setPctIn(e.target.value.replace(/[^0-9-]/g, ""))} />
          <ConfirmButton size="xs" variant="outline" color="amber" label="Reprice" confirmLabel={`${Number(pctIn) > 0 ? "+" : ""}${pctIn || 0}% on ${sel.length}?`} disabled={!sel.length || !Number(pctIn) || Number(pctIn) < -90 || Number(pctIn) > 500 || bulk.isPending} onConfirm={() => { run({ pricePercent: Number(pctIn) }); setPctIn(""); }} />
        </span>
        <span className="flex items-center gap-1">
          <Input value={upkeepIn} placeholder="default" inputMode="numeric" aria-label="Monthly upkeep for the selection" className="num !w-16 !py-0.5 text-xs" onChange={(e) => setUpkeepIn(e.target.value.replace(/[^0-9]/g, ""))} />
          <Button size="xs" variant="ghost" disabled={!sel.length || bulk.isPending} title="Blank = default (cyberware by rarity, else none)" onClick={() => run({ patch: { maintenance: upkeepIn === "" ? null : Number(upkeepIn) } })}>Set upkeep</Button>
        </span>
      </div>

      {items.isLoading && <Spinner />}
      {!items.isLoading && list.length === 0 && <Empty icon="store">{all.length ? "Nothing matches these filters." : "No items yet. Import the NEOM catalog or create one in the workshop."}</Empty>}
      <div className="max-h-[70vh] overflow-auto pr-1">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-xs" data-testid="manager-table">
          <thead className="sticky top-0 z-[1] bg-bg-1/95 font-display text-[0.5rem] uppercase tracking-[0.16em] text-muted backdrop-blur">
            <tr>
              <th className="w-6 py-1" />
              <th className="py-1 text-left">Item</th>
              <th className="py-1 text-left">Price ₭</th>
              <th className="py-1 text-left">Stock</th>
              <th className="py-1 text-left">Upkeep</th>
              <th className="py-1 text-left">Shelf</th>
              <th className="py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const rc = accent(RARITY_COLOR[d.rarity]);
              const on = picked.has(d.id);
              return (
                <tr key={d.id} className={clsx("bg-bg-2/60", on && "outline outline-1 outline-amber/60", !d.forSale && "opacity-70")} data-testid="manager-row" data-listed={d.forSale}>
                  <td className="px-1.5" style={{ borderLeft: `2px solid ${rc}` }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(d.id)} aria-label={`Select ${d.name}`} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2">
                      <Icon name={d.icon} size={14} style={{ color: rc }} />
                      <span className="min-w-0">
                        <span className="block max-w-[260px] truncate text-text">{d.name}</span>
                        <span className="text-dim">
                          {SHELF_META[shelfOf(d)]?.label ?? d.category} · <span style={{ color: rc }}>{rarityName(d.rarity)}</span>
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <CellInput value={String(d.price)} label={`Price of ${d.name}`} width="w-20" onSave={(v) => { const n = Number(v); if (v !== "" && Number.isFinite(n) && n !== d.price) patchOne(d, { price: n }); }} />
                  </td>
                  <td>
                    <CellInput value={d.stock === null ? "" : String(d.stock)} placeholder="∞" label={`Stock of ${d.name}`} width="w-14" onSave={(v) => { const n = v === "" ? null : Number(v); if (n !== d.stock) patchOne(d, { stock: n }); }} />
                  </td>
                  <td>
                    <CellInput value={d.maintenance === null ? "" : String(d.maintenance)} placeholder={String(itemUpkeep(d, true))} label={`Upkeep of ${d.name}`} width="w-16" onSave={(v) => { const n = v === "" ? null : Number(v); if (n !== d.maintenance) patchOne(d, { maintenance: n }); }} />
                  </td>
                  <td>
                    <span className="flex items-center gap-1">
                      <button type="button" className={clsx("hud-btn !px-1.5 !py-0.5 !text-[0.5rem]", !d.forSale && "hud-btn-ghost")} style={{ ["--btn-color" as string]: "var(--color-amber)" }} onClick={() => patchOne(d, { forSale: !d.forSale })} aria-pressed={d.forSale} title={d.forSale ? "On the shelf: click to unlist" : "Off the shelf: click to list"}>
                        {d.forSale ? "listed" : "unlisted"}
                      </button>
                      <button type="button" className={clsx("hud-btn !px-1.5 !py-0.5 !text-[0.5rem]", d.visibleToPlayers && "hud-btn-ghost")} style={{ ["--btn-color" as string]: "var(--color-crimson)" }} onClick={() => patchOne(d, { visibleToPlayers: !d.visibleToPlayers })} aria-pressed={!d.visibleToPlayers} title={d.visibleToPlayers ? "Players can see it: click to hide" : "Hidden from players: click to show"}>
                        {d.visibleToPlayers ? "visible" : "hidden"}
                      </button>
                      {d.forSale && d.stock === 0 && <Badge color="crimson">sold out</Badge>}
                    </span>
                  </td>
                  <td className="pr-1.5 text-right">
                    <span className="flex items-center justify-end gap-1">
                      {grantTo && (
                        <Button size="xs" variant="ghost" icon="gift" disabled={grant.isPending} title={`Give one to ${grantTo.name} for free`} onClick={() => grant.mutate({ characterId: grantTo.id, definitionId: d.id, quantity: 1 })}>
                          Give
                        </Button>
                      )}
                      <Link to={`/c/${campaignId}/dm/workshop?item=${d.id}`} className="hud-btn hud-btn-ghost !px-2 !py-1 !text-[0.55rem]" title="Edit stats, effects and description">
                        <Icon name="hammer" size={11} /> Edit
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A table cell that saves on blur or Enter; digits only. */
function CellInput({ value, placeholder, label, width, onSave }: { value: string; placeholder?: string; label: string; width: string; onSave: (v: string) => void }) {
  return (
    <Input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      inputMode="numeric"
      aria-label={label}
      className={clsx("num !py-0.5 text-xs", `!${width}`)}
      onBlur={(e) => onSave(e.target.value.replace(/[^0-9]/g, ""))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
