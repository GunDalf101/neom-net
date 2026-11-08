import {
  AUGMENTATION_SLOTS,
  DAMAGE_TYPES,
  EQUIPMENT_SLOTS,
  ITEM_CATEGORIES,
  RARITIES,
  SPECIAL_SKILLS,
  SPECIAL_SKILL_META,
  describePassiveEffect,
  type AbilityDto,
  type AbilityInput,
  type ConditionDefinitionDto,
  type ConditionDefinitionInput,
  type ItemDefinitionDto,
  type ItemDefinitionInput,
  type SkillTreeDto,
  type SkillTreeNodeInput,
} from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import {
  useAbilities,
  useConditionDefinitions,
  useDeleteAbility,
  useDeleteCondition,
  useDeleteItemDefinition,
  useItemDefinitions,
  useRules,
  useSaveAbility,
  useSaveCondition,
  useSaveItemDefinition,
  useSaveSkillTree,
  useSkillTrees,
} from "@/api/hooks";
import { InstantEffectListEditor, PassiveEffectListEditor, RequirementListEditor } from "@/components/editors/EffectEditors";
import { Badge, Button, ConfirmButton, Empty, Field, Icon, Input, Panel, Select, Textarea } from "@/components/ui";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { useDm } from "./DmShell";

type Tab = "items" | "conditions" | "abilities" | "trees";

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
            ["trees", "Skill trees", "git-branch"],
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
      {tab === "trees" && <TreesWorkshop />}
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
  const empty = (): AbilityInput => ({ name: "", description: "", icon: "zap", actionType: "action", cost: { resource: "none", amount: 0 }, usesPer: "unlimited", maxUses: 1, effects: [], passiveEffects: [], ruleIds: [] });
  const [editing, setEditing] = useState<AbilityDto | "new" | null>(null);
  const [form, setForm] = useState<AbilityInput>(empty());
  const open = (a: AbilityDto | "new") => {
    setEditing(a);
    setForm(a === "new" ? empty() : { name: a.name, description: a.description, icon: a.icon, actionType: a.actionType, cost: a.cost as AbilityInput["cost"], usesPer: a.usesPer, maxUses: a.maxUses, effects: a.effects, passiveEffects: a.passiveEffects, ruleIds: a.ruleIds });
  };
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
          {abilities.data?.length === 0 && <Empty>No abilities yet. Grant them through skill-tree nodes or item effects.</Empty>}
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
            <Section title="On activation">
              <InstantEffectListEditor value={form.effects} onChange={(v) => setForm({ ...form, effects: v })} conditionKeys={conditions.data ?? []} />
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

// ---------- Skill trees ----------

function TreesWorkshop() {
  const { campaign } = useDm();
  const trees = useSkillTrees(campaign.id);
  const save = useSaveSkillTree(campaign.id);
  const abilities = useAbilities(campaign.id);
  const [branch, setBranch] = useState<(typeof SPECIAL_SKILLS)[number]>("hacking");
  const existing = trees.data?.find((t) => t.branch === branch);
  const [draft, setDraft] = useState<{ branch: string; name: string; description: string; nodes: SkillTreeNodeInput[] } | null>(null);
  const [loadedBranch, setLoadedBranch] = useState<string | null>(null);

  const fromTree = (t: SkillTreeDto | undefined) => ({
    branch,
    name: t?.name ?? SPECIAL_SKILL_META[branch].name,
    description: t?.description ?? "",
    nodes: (t?.nodes ?? []).map((n) => ({ key: n.key, name: n.name, description: n.description, icon: n.icon, maxRank: n.maxRank, cost: n.cost, parentKeys: n.parentKeys, requirements: n.requirements, effects: n.effects, ruleIds: n.ruleIds, position: n.position, tier: n.tier })),
  });
  if (!trees.isLoading && loadedBranch !== branch) {
    setLoadedBranch(branch);
    setDraft(fromTree(existing));
  }
  if (!draft) return null;
  const setNode = (i: number, n: SkillTreeNodeInput) => setDraft({ ...draft, nodes: draft.nodes.map((x, j) => (j === i ? n : x)) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {SPECIAL_SKILLS.map((s) => (
          <button key={s} className={clsx("hud-tab", branch === s && "active")} onClick={() => setBranch(s)}>
            {SPECIAL_SKILL_META[s].name}
          </button>
        ))}
      </div>
      <Panel title={`${SPECIAL_SKILL_META[branch].name} tree`} icon="git-branch" color="crimson" actions={<Button size="xs" variant="solid" color="crimson" icon="save" disabled={save.isPending} onClick={() => save.mutate({ branch, name: draft.name, description: draft.description, nodes: draft.nodes })}>Save tree</Button>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Tree name">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 space-y-2">
          {draft.nodes.map((n, i) => (
            <div key={i} className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                <Field label="Key">
                  <Input value={n.key} onChange={(e) => setNode(i, { ...n, key: e.target.value })} />
                </Field>
                <Field label="Name" className="md:col-span-2">
                  <Input value={n.name} onChange={(e) => setNode(i, { ...n, name: e.target.value })} />
                </Field>
                <Field label="Icon">
                  <Input value={n.icon} onChange={(e) => setNode(i, { ...n, icon: e.target.value })} />
                </Field>
                <Field label="Tier">
                  <Input type="number" min={0} value={n.tier} onChange={(e) => setNode(i, { ...n, tier: Number(e.target.value) })} />
                </Field>
                <Field label="Cost / max rank">
                  <div className="flex gap-1">
                    <Input type="number" min={0} value={n.cost} onChange={(e) => setNode(i, { ...n, cost: Number(e.target.value) })} />
                    <Input type="number" min={1} value={n.maxRank} onChange={(e) => setNode(i, { ...n, maxRank: Number(e.target.value) })} />
                  </div>
                </Field>
                <Field label="Description" className="md:col-span-4">
                  <Input value={n.description} onChange={(e) => setNode(i, { ...n, description: e.target.value })} />
                </Field>
                <Field label="Parents (keys, comma-separated)" className="md:col-span-2">
                  <Input value={n.parentKeys.join(", ")} onChange={(e) => setNode(i, { ...n, parentKeys: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </Field>
              </div>
              <Section title="Effects per rank">
                <PassiveEffectListEditor value={n.effects} onChange={(v) => setNode(i, { ...n, effects: v })} abilities={abilities.data ?? []} />
              </Section>
              <Section title="Requirements">
                <RequirementListEditor value={n.requirements} onChange={(v) => setNode(i, { ...n, requirements: v })} />
              </Section>
              <div className="mt-2 flex justify-end">
                <ConfirmButton size="xs" label="Remove node" onConfirm={() => setDraft({ ...draft, nodes: draft.nodes.filter((_, j) => j !== i) })} />
              </div>
            </div>
          ))}
          <Button icon="plus" onClick={() => setDraft({ ...draft, nodes: [...draft.nodes, { key: `node${draft.nodes.length + 1}`, name: "New node", description: "", icon: "zap", maxRank: 1, cost: 1, parentKeys: [], requirements: [], effects: [], ruleIds: [], position: { x: 0, y: 0 }, tier: 0 }] })}>
            Add node
          </Button>
        </div>
      </Panel>
    </div>
  );
}
