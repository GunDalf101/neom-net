import {
  AUGMENTATION_SLOTS,
  DAMAGE_TYPES,
  DISTRICTS,
  DISTRICT_META,
  PLAN_KINDS,
  PLAN_KIND_META,
  EQUIPMENT_SLOTS,
  ITEM_CATEGORIES,
  RARITIES,
  describePassiveEffect,
  type AbilityDto,
  type AbilityInput,
  type ConditionDefinitionDto,
  type ConditionDefinitionInput,
  type ItemDefinitionDto,
  type ItemDefinitionInput,
  type PlanDefinitionDto,
  type PlanDefinitionInput,
  type PlanKind,
} from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import {
  useAbilities,
  useBillMonth,
  useBillPreview,
  useConditionDefinitions,
  useDeletePlan,
  useImportCatalog,
  usePlans,
  useSavePlan,
  useDeleteAbility,
  useDeleteCondition,
  useDeleteItemDefinition,
  useItemDefinitions,
  useRules,
  useSaveAbility,
  useSaveCondition,
  useSaveItemDefinition,
} from "@/api/hooks";
import { InstantEffectListEditor, PassiveEffectListEditor, RequirementListEditor } from "@/components/editors/EffectEditors";
import { Badge, Button, ConfirmButton, Empty, Field, Icon, Input, Panel, Select, Textarea } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { metaRows } from "@/lib/itemMeta";
import { useDm } from "./DmShell";

type Tab = "items" | "conditions" | "abilities" | "shop";

export function WorkshopPage() {
  const [tab, setTab] = useState<Tab>("items");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["items", "Items & cyberware", "package"],
            ["conditions", "Conditions", "alert-triangle"],
            ["abilities", "Abilities", "zap"],
            ["shop", "Shop & plans", "store"],
          ] as [Tab, string, string][]
        ).map(([id, label, icon]) => (
          <button key={id} className={clsx("hud-tab flex items-center gap-2", tab === id && "active danger")} onClick={() => setTab(id)}>
            <Icon name={icon} size={12} /> {label}
          </button>
        ))}
      </div>
      {tab === "items" && <ItemsWorkshop />}
      {tab === "conditions" && <ConditionsWorkshop />}
      {tab === "abilities" && <AbilitiesWorkshop />}
      {tab === "shop" && <ShopWorkshop />}
    </div>
  );
}

// ---------- Items ----------

const emptyItem = (): ItemDefinitionInput => ({
  name: "",
  description: "",
  icon: "box",
  imageUrl: null,
  category: "cyberware",
  rarity: "common",
  price: 0,
  weight: 0,
  requirements: [],
  effects: [],
  useEffects: [],
  augmentationSlot: "eyes",
  equipmentSlot: null,
  capacityCost: 1,
  stackable: false,
  maxCharges: null,
  damage: null,
  damageType: null,
  ruleIds: [],
  tags: [],
  visibleToPlayers: true,
  meta: {},
  forSale: false,
  stock: null,
});

function toItemInput(d: ItemDefinitionDto): ItemDefinitionInput {
  return { ...d, imageUrl: d.imageUrl ?? null };
}

function ItemsWorkshop() {
  const { campaign } = useDm();
  const items = useItemDefinitions(campaign.id);
  const save = useSaveItemDefinition(campaign.id);
  const del = useDeleteItemDefinition(campaign.id);
  const rules = useRules(campaign.id);
  const abilities = useAbilities(campaign.id);
  const conditions = useConditionDefinitions(campaign.id);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ItemDefinitionInput>(emptyItem());
  const [filter, setFilter] = useState("");
  const set = <K extends keyof ItemDefinitionInput>(k: K, v: ItemDefinitionInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const open = (d: ItemDefinitionDto | "new") => {
    setEditingId(d === "new" ? "new" : d.id);
    setForm(d === "new" ? emptyItem() : toItemInput(d));
  };
  const list = (items.data ?? []).filter((d) => !filter || d.name.toLowerCase().includes(filter.toLowerCase()) || d.category.includes(filter));

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[380px_1fr]">
      <Panel title="Catalog" icon="package" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2 !py-1 text-xs" />
        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {list.map((d) => (
            <button key={d.id} type="button" onClick={() => open(d)} className={clsx("hud-panel flex w-full items-center gap-2 p-2 text-left text-xs", editingId === d.id && "border-crimson")} style={{ ["--panel-accent" as string]: accent(RARITY_COLOR[d.rarity]) }}>
              <Icon name={d.icon} size={16} style={{ color: accent(RARITY_COLOR[d.rarity]) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text">{d.name}</span>
                <span className="text-dim">
                  {d.category}
                  {d.augmentationSlot ? ` · ${d.augmentationSlot}` : ""}
                  {!d.visibleToPlayers ? " · hidden" : ""}
                </span>
              </span>
              <Badge color={RARITY_COLOR[d.rarity]}>{rarityName(d.rarity)}</Badge>
            </button>
          ))}
          {list.length === 0 && <Empty>No definitions.</Empty>}
        </div>
      </Panel>

      {editingId ? (
        <Panel title={editingId === "new" ? "New definition" : "Edit definition"} icon="hammer" color="crimson" actions={editingId !== "new" ? <ConfirmButton size="xs" label="Delete" confirmLabel="Delete?" onConfirm={() => { del.mutate(editingId); setEditingId(null); }} /> : null}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const saved = await save.mutateAsync({ id: editingId === "new" ? undefined : editingId, body: form });
              setEditingId(saved.id);
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Name" className="md:col-span-2">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
              <Field label="Icon (lucide name)">
                <div className="flex items-center gap-2">
                  <Input value={form.icon} onChange={(e) => set("icon", e.target.value)} />
                  <Icon name={form.icon} size={18} className="text-cyan" />
                </div>
              </Field>
              <Field label="Category">
                <Select value={form.category} onChange={(e) => set("category", e.target.value as ItemDefinitionInput["category"])}>
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Rarity">
                <Select value={form.rarity} onChange={(e) => set("rarity", e.target.value as ItemDefinitionInput["rarity"])}>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {rarityName(r)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visible to players">
                <Select value={form.visibleToPlayers ? "1" : "0"} onChange={(e) => set("visibleToPlayers", e.target.value === "1")}>
                  <option value="1">Yes</option>
                  <option value="0">No (DM only)</option>
                </Select>
              </Field>
              <Field label="Price (₭ kamas)">
                <Input type="number" min={0} value={form.price} onChange={(e) => set("price", Number(e.target.value))} />
              </Field>
              <Field label="Weight (kg)">
                <Input type="number" min={0} step={0.1} value={form.weight} onChange={(e) => set("weight", Number(e.target.value))} />
              </Field>
              <Field label="Stackable">
                <Select value={form.stackable ? "1" : "0"} onChange={(e) => set("stackable", e.target.value === "1")}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </Select>
              </Field>
              <Field label="In the shop" hint="Players buy it with kamas at this price">
                <Select value={form.forSale ? "1" : "0"} onChange={(e) => set("forSale", e.target.value === "1")}>
                  <option value="0">Not listed</option>
                  <option value="1">For sale</option>
                </Select>
              </Field>
              <Field label="Stock (blank = unlimited)">
                <Input type="number" min={0} value={form.stock ?? ""} onChange={(e) => set("stock", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
              {form.category === "cyberware" ? (
                <>
                  <Field label="Augmentation slot">
                    <Select value={form.augmentationSlot ?? ""} onChange={(e) => set("augmentationSlot", (e.target.value || null) as ItemDefinitionInput["augmentationSlot"])}>
                      {AUGMENTATION_SLOTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Capacity cost">
                    <Input type="number" min={0} value={form.capacityCost} onChange={(e) => set("capacityCost", Number(e.target.value))} />
                  </Field>
                </>
              ) : (
                <Field label="Equipment slot">
                  <Select value={form.equipmentSlot ?? ""} onChange={(e) => set("equipmentSlot", (e.target.value || null) as ItemDefinitionInput["equipmentSlot"])}>
                    <option value="">none</option>
                    {EQUIPMENT_SLOTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Max charges (blank = none)">
                <Input type="number" min={0} value={form.maxCharges ?? ""} onChange={(e) => set("maxCharges", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
              {form.category === "weapon" && (
                <>
                  <Field label="Damage dice">
                    <Input value={form.damage ?? ""} placeholder="1d8" onChange={(e) => set("damage", e.target.value || null)} />
                  </Field>
                  <Field label="Damage type">
                    <Select value={form.damageType ?? ""} onChange={(e) => set("damageType", (e.target.value || null) as ItemDefinitionInput["damageType"])}>
                      <option value="">—</option>
                      {DAMAGE_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            {metaRows(form).length > 0 && (
              <Section title="Catalog data (from the NEOM catalog; shown on cards)">
                <div className="flex flex-wrap gap-1 text-xs">
                  {metaRows(form).map(([k, v]) => (
                    <Badge key={k} color="muted">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}
            <Section title="Requirements">
              <RequirementListEditor value={form.requirements} onChange={(v) => set("requirements", v)} />
            </Section>
            <Section title="Passive effects (while equipped / installed)">
              <PassiveEffectListEditor value={form.effects} onChange={(v) => set("effects", v)} abilities={abilities.data ?? []} />
            </Section>
            <Section title="On-use effects (consumables, charged tools)">
              <InstantEffectListEditor value={form.useEffects} onChange={(v) => set("useEffects", v)} conditionKeys={conditions.data ?? []} />
            </Section>
            <Section title="Attached rules (run while equipped / installed)">
              <RulePicker value={form.ruleIds} onChange={(v) => set("ruleIds", v)} rules={rules.data ?? []} />
            </Section>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted">{form.effects.map(describePassiveEffect).join(" · ")}</div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Close
                </Button>
                <Button type="submit" variant="solid" color="crimson" icon="save" disabled={save.isPending}>
                  Save definition
                </Button>
              </div>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel title="Workshop" icon="hammer" color="crimson">
          <Empty icon="hammer">Pick a definition to edit or create a new one. Definitions describe what an item normally does; granted instances track their own charges, status and custom names.</Empty>
        </Panel>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-2">
      <div className="hud-title mb-2 text-[0.6rem]">{title}</div>
      {children}
    </div>
  );
}

export function RulePicker({ value, onChange, rules }: { value: string[]; onChange: (v: string[]) => void; rules: { id: string; name: string; scope: string; publishedVersion: number | null }[] }) {
  const attachable = rules.filter((r) => r.scope === "attached");
  if (attachable.length === 0) return <div className="text-xs text-dim">No rules with scope "attached" yet. Create one in the Rules editor to link it here.</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {attachable.map((r) => {
        const on = value.includes(r.id);
        return (
          <button key={r.id} type="button" className={clsx("hud-btn !py-1 !text-[0.55rem]", !on && "hud-btn-ghost")} style={{ ["--btn-color" as string]: "var(--color-violet)" }} onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}>
            {r.name}
            {!r.publishedVersion && " (draft)"}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Conditions ----------

function ConditionsWorkshop() {
  const { campaign } = useDm();
  const defs = useConditionDefinitions(campaign.id);
  const save = useSaveCondition(campaign.id);
  const del = useDeleteCondition(campaign.id);
  const rules = useRules(campaign.id);
  const empty = (): ConditionDefinitionInput => ({ key: "", name: "", description: "", color: "crimson", effects: [], ruleIds: [] });
  const [editing, setEditing] = useState<ConditionDefinitionDto | "new" | null>(null);
  const [form, setForm] = useState<ConditionDefinitionInput>(empty());
  const open = (d: ConditionDefinitionDto | "new") => {
    setEditing(d);
    setForm(d === "new" ? empty() : { key: d.key, name: d.name, description: d.description, color: d.color, effects: d.effects, ruleIds: d.ruleIds });
  };
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[380px_1fr]">
      <Panel title="Conditions" icon="alert-triangle" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1 text-xs">
          {defs.data?.map((d) => (
            <button key={d.id} type="button" disabled={d.builtin} onClick={() => open(d)} className={clsx("hud-panel flex w-full items-center justify-between p-2 text-left", d.builtin && "opacity-60")} style={{ ["--panel-accent" as string]: accent(d.color) }}>
              <span>
                <span className="text-text">{d.name}</span> <span className="text-dim">({d.key})</span>
                <span className="block text-muted">{d.effects.map(describePassiveEffect).join(" · ") || "narrative only"}</span>
              </span>
              {d.builtin ? <Badge color="muted">builtin</Badge> : <Badge color={d.color}>custom</Badge>}
            </button>
          ))}
        </div>
      </Panel>
      {editing && (
        <Panel title={editing === "new" ? "New condition" : `Edit ${form.name}`} icon="hammer" color="crimson" actions={editing !== "new" ? <ConfirmButton size="xs" label="Delete" onConfirm={() => { del.mutate(editing.id); setEditing(null); }} /> : null}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form });
              setEditing(null);
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Key (camelCase)">
                <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required pattern="^[a-zA-Z][a-zA-Z0-9_]*$" />
              </Field>
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Accent">
                <Select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                  {["crimson", "amber", "cyan", "magenta", "violet", "lime", "blue"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Section title="Mechanical effects while active (optional)">
              <PassiveEffectListEditor value={form.effects} onChange={(v) => setForm({ ...form, effects: v })} />
            </Section>
            <Section title="Attached rules">
              <RulePicker value={form.ruleIds} onChange={(v) => setForm({ ...form, ruleIds: v })} rules={rules.data ?? []} />
            </Section>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
              <Button type="submit" variant="solid" color="crimson" icon="save">
                Save
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}

// ---------- Abilities ----------

function AbilitiesWorkshop() {
  const { campaign } = useDm();
  const abilities = useAbilities(campaign.id);
  const save = useSaveAbility(campaign.id);
  const del = useDeleteAbility(campaign.id);
  const conditions = useConditionDefinitions(campaign.id);
  const rules = useRules(campaign.id);
  const empty = (): AbilityInput => ({ name: "", description: "", icon: "zap", actionType: "action", cost: { resource: "none", amount: 0 }, usesPer: "unlimited", maxUses: 1, effects: [], passiveEffects: [], ruleIds: [] });
  const [editing, setEditing] = useState<AbilityDto | "new" | null>(null);
  const [form, setForm] = useState<AbilityInput>(empty());
  const open = (a: AbilityDto | "new") => {
    setEditing(a);
    setForm(a === "new" ? empty() : { name: a.name, description: a.description, icon: a.icon, actionType: a.actionType, cost: a.cost as AbilityInput["cost"], usesPer: a.usesPer, maxUses: a.maxUses, effects: a.effects, passiveEffects: a.passiveEffects, ruleIds: a.ruleIds });
  };
  const passiveSummary = form.passiveEffects.map(describePassiveEffect).join(" · ");
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[380px_1fr]">
      <Panel title="Abilities" icon="zap" actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
        <div className="space-y-1 text-xs">
          {abilities.data?.map((a) => (
            <button key={a.id} type="button" onClick={() => open(a)} className="hud-panel flex w-full items-center gap-2 p-2 text-left" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
              <Icon name={a.icon} size={16} className="text-amber" />
              <span className="flex-1">
                <span className="text-text">{a.name}</span>
                <span className="block text-muted">{a.description}</span>
              </span>
              <Badge color="amber">{a.actionType}</Badge>
            </button>
          ))}
          {abilities.data?.length === 0 && <Empty>No abilities yet. Create one here, then grant it from a character sheet or through item effects.</Empty>}
        </div>
      </Panel>
      {editing && (
        <Panel title={editing === "new" ? "New ability" : `Edit ${form.name}`} icon="hammer" color="crimson" actions={editing !== "new" ? <ConfirmButton size="xs" label="Delete" onConfirm={() => { del.mutate(editing.id); setEditing(null); }} /> : null}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form });
              setEditing(null);
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Icon">
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              </Field>
              <Field label="Action type">
                <Select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value as AbilityInput["actionType"] })}>
                  {["action", "bonus", "reaction", "free", "passive"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cost resource">
                <Select value={form.cost.resource} onChange={(e) => setForm({ ...form, cost: { ...form.cost, resource: e.target.value as AbilityInput["cost"]["resource"] } })}>
                  {["none", "hitDice", "progressionPoints", "credits", "inspiration"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cost amount">
                <Input type="number" min={0} value={form.cost.amount} onChange={(e) => setForm({ ...form, cost: { ...form.cost, amount: Number(e.target.value) } })} />
              </Field>
              <Field label="Uses per" hint="Informational for now; not enforced server-side">
                <Select value={form.usesPer} onChange={(e) => setForm({ ...form, usesPer: e.target.value as AbilityInput["usesPer"] })}>
                  {["unlimited", "turn", "encounter", "rest", "session"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Section title="Stat points & skills (while the character holds this ability)">
              <p className="mb-2 text-xs text-muted">
                Add or subtract attribute scores, skills, saves, AC and the rest: a modifier with a positive value adds, a negative one subtracts, and <span className="text-text">base</span> writes the base figure outright. These apply as long as the ability is granted, and every breakdown names this ability as the source.
              </p>
              <PassiveEffectListEditor value={form.passiveEffects} onChange={(v) => setForm({ ...form, passiveEffects: v })} abilities={(abilities.data ?? []).filter((a) => editing === "new" || a.id !== editing.id)} />
              {passiveSummary && <div className="mt-2 text-xs text-violet">{passiveSummary}</div>}
            </Section>
            <Section title="On activation">
              <InstantEffectListEditor value={form.effects} onChange={(v) => setForm({ ...form, effects: v })} conditionKeys={conditions.data ?? []} />
            </Section>
            <Section title="Attached rules (run while the ability is held)">
              <RulePicker value={form.ruleIds} onChange={(v) => setForm({ ...form, ruleIds: v })} rules={rules.data ?? []} />
            </Section>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
              <Button type="submit" variant="solid" color="crimson" icon="save">
                Save
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}

// ---------- Shop & plans ----------

const emptyPlan = (kind: PlanKind = "housing"): PlanDefinitionInput => ({ kind, name: "", description: "", district: kind === "housing" ? "dogtown" : null, monthlyCost: 0, purchasePrice: 0, effects: [], visibleToPlayers: true, sortOrder: 0 });

function ShopWorkshop() {
  const { campaign } = useDm();
  const items = useItemDefinitions(campaign.id);
  const plans = usePlans(campaign.id);
  const savePlan = useSavePlan(campaign.id);
  const delPlan = useDeletePlan(campaign.id);
  const importCatalog = useImportCatalog(campaign.id);
  const bill = useBillMonth(campaign.id);
  const [kind, setKind] = useState<PlanKind>("housing");
  const preview = useBillPreview(campaign.id, true);
  const [editing, setEditing] = useState<PlanDefinitionDto | "new" | null>(null);
  const [form, setForm] = useState<PlanDefinitionInput>(emptyPlan());
  const open = (p: PlanDefinitionDto | "new") => {
    setEditing(p);
    setForm(p === "new" ? emptyPlan(kind) : { kind: p.kind, name: p.name, description: p.description, district: p.district, monthlyCost: p.monthlyCost, purchasePrice: p.purchasePrice, effects: p.effects, visibleToPlayers: p.visibleToPlayers, sortOrder: p.sortOrder });
  };
  const forSale = (items.data ?? []).filter((d) => d.forSale).length;
  const meta = PLAN_KIND_META[kind];
  const inKind = (plans.data ?? []).filter((p) => p.kind === kind);
  const due = (preview.data ?? []).reduce((s, b) => s + b.total, 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Catalog" icon="store" color="amber">
          <p className="text-xs text-muted">
            The NEOM catalog (weapons, attachments, ammunition, augments, Shimmer fusions and the economy handbook's plans) ships with the app. Importing adds what is missing and refreshes stats and prices of what is already there, by name; items the players own keep their instances.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <ConfirmButton size="sm" color="amber" variant="solid" label={forSale ? "Refresh NEOM catalog" : "Import NEOM catalog"} confirmLabel={forSale ? "Refresh by name?" : "Import now?"} disabled={importCatalog.isPending} onConfirm={() => importCatalog.mutate()} />
            <span className="text-dim">
              {forSale} item{forSale === 1 ? "" : "s"} for sale · {(plans.data ?? []).length} plans
            </span>
          </div>
          <p className="mt-2 text-[0.65rem] text-dim">Shop prices are the listed prices, untaxed. Mark any workshop item "For sale" to put it on the shelves, or curate directly from the HUD Shop tab.</p>
        </Panel>
        <Panel title="Turn the month" icon="calendar-clock" color="crimson" actions={<Button size="xs" variant="ghost" icon="refresh-cw" onClick={() => preview.refetch()} aria-label="Refresh preview" />}>
          <p className="text-xs text-muted">Every character pays their plans and the upkeep of installed cyberware (common 25 · uncommon 100 · rare 250 · very rare 500 · legendary 1000 ₭). Plans they cannot pay lapse, dearest first; unpaid upkeep applies Cyberware Malfunction.</p>
          <table className="num mt-2 w-full text-[0.7rem]">
            <tbody>
              {(preview.data ?? []).map((b) => (
                <tr key={b.characterId} className="border-b border-line/40 last:border-0">
                  <td className="py-0.5 text-text">{b.characterName}</td>
                  <td className="py-0.5 text-muted">{b.plans.length} plans · {b.maintenance.length} chrome</td>
                  <td className={clsx("py-0.5 text-right", b.total > b.credits ? "text-crimson" : "text-amber")}>{b.total.toLocaleString()} ₭</td>
                  <td className="py-0.5 text-right text-dim">of {b.credits.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">Total due: <span className="num text-amber">{due.toLocaleString()} ₭</span></span>
            <ConfirmButton size="sm" color="crimson" variant="solid" label="Advance one month" confirmLabel="Bill everyone now?" disabled={bill.isPending} onConfirm={() => bill.mutate()} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[380px_1fr]">
        <Panel title="Plans" icon="receipt" color={meta.color} actions={<Button size="xs" icon="plus" onClick={() => open("new")}>New</Button>}>
          <div className="mb-2 flex flex-wrap gap-1">
            {PLAN_KINDS.map((k) => (
              <button key={k} type="button" className={clsx("hud-tab !px-2 !py-1 !text-[0.55rem]", kind === k && "active")} style={kind === k ? { background: `var(--color-${PLAN_KIND_META[k].color})` } : { color: `var(--color-${PLAN_KIND_META[k].color})` }} onClick={() => setKind(k)}>
                {PLAN_KIND_META[k].label} <span className="num opacity-70">{(plans.data ?? []).filter((p) => p.kind === k).length}</span>
              </button>
            ))}
          </div>
          <p className="mb-2 text-[0.65rem] text-dim">{meta.blurb}</p>
          {inKind.length === 0 && <Empty>No {meta.label.toLowerCase()} plans.</Empty>}
          <div className="space-y-1">
            {inKind.map((p) => (
              <button key={p.id} type="button" onClick={() => open(p)} className={clsx("hud-panel flex w-full items-center gap-2 p-2 text-left text-xs", editing !== "new" && editing?.id === p.id && "lit")} style={{ ["--panel-accent" as string]: `var(--color-${meta.color})` }}>
                <span className="min-w-0 flex-1 truncate text-text">{p.name}</span>
                {p.district && <Badge color="muted">{DISTRICT_META[p.district].name}</Badge>}
                {!p.visibleToPlayers && <Badge color="muted">hidden</Badge>}
                <span className="num text-amber">{p.monthlyCost.toLocaleString()} ₭/mo</span>
                {p.purchasePrice > 0 && <span className="num text-cyan">+{p.purchasePrice.toLocaleString()}</span>}
              </button>
            ))}
          </div>
        </Panel>
        {editing && (
          <Panel title={editing === "new" ? "New plan" : `Edit ${form.name}`} icon="hammer" color="crimson" actions={editing !== "new" ? <ConfirmButton size="xs" label="Delete" onConfirm={() => { delPlan.mutate(editing.id); setEditing(null); }} /> : null}>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await savePlan.mutateAsync({ id: editing === "new" ? undefined : editing.id, body: form });
                setEditing(null);
              }}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Kind">
                  <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PlanKind, district: e.target.value === "housing" ? (form.district ?? "dogtown") : null })}>
                    {PLAN_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PLAN_KIND_META[k].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Name" className="md:col-span-2">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </Field>
                <Field label="Monthly cost (₭)">
                  <Input type="number" min={0} value={form.monthlyCost} onChange={(e) => setForm({ ...form, monthlyCost: Number(e.target.value) })} />
                </Field>
                <Field label="Paid once (₭)" hint="Vehicles: the purchase price">
                  <Input type="number" min={0} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} />
                </Field>
                {form.kind === "housing" ? (
                  <Field label="District">
                    <Select value={form.district ?? "dogtown"} onChange={(e) => setForm({ ...form, district: e.target.value as PlanDefinitionInput["district"] })}>
                      {DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {DISTRICT_META[d].name} ({DISTRICT_META[d].taxPercent}%)
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Visible to players">
                    <Select value={form.visibleToPlayers ? "1" : "0"} onChange={(e) => setForm({ ...form, visibleToPlayers: e.target.value === "1" })}>
                      <option value="1">Yes</option>
                      <option value="0">No (DM only)</option>
                    </Select>
                  </Field>
                )}
              </div>
              <Field label="Description">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Section title="Effects while subscribed (Hacking bonus, traits…)">
                <PassiveEffectListEditor value={form.effects} onChange={(v) => setForm({ ...form, effects: v })} />
              </Section>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Close
                </Button>
                <Button type="submit" variant="solid" color="crimson" icon="save" disabled={savePlan.isPending}>
                  Save plan
                </Button>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </div>
  );
}
