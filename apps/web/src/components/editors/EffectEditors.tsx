import {
  ATTRIBUTES,
  ATTRIBUTE_META,
  AUGMENTATION_SLOTS,
  DAMAGE_TYPES,
  SKILLS,
  SKILL_META,
  SPECIAL_SKILLS,
  SPECIAL_SKILL_META,
  describePassiveEffect,
  describeRequirement,
  type InstantEffect,
  type PassiveEffect,
  type Requirement,
} from "@neom/shared";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

export const STAT_TARGETS: { value: string; label: string; group: string }[] = [
  { value: "ac", label: "Armor Class", group: "Combat" },
  { value: "initiative", label: "Initiative", group: "Combat" },
  { value: "speed", label: "Speed", group: "Combat" },
  { value: "maxHp", label: "Max HP", group: "Combat" },
  { value: "capacity", label: "Cyberware capacity", group: "Combat" },
  { value: "profBonus", label: "Proficiency bonus", group: "Combat" },
  ...ATTRIBUTES.map((a) => ({ value: `attr.${a}`, label: `${ATTRIBUTE_META[a].name} score`, group: "Attributes" })),
  ...ATTRIBUTES.map((a) => ({ value: `save.${a}`, label: `${ATTRIBUTE_META[a].short} save`, group: "Saves" })),
  ...SPECIAL_SKILLS.map((s) => ({ value: `special.${s}`, label: SPECIAL_SKILL_META[s].name, group: "Cyberpunk skills" })),
  ...SKILLS.map((s) => ({ value: `skill.${s}`, label: SKILL_META[s].name, group: "Skills" })),
];
export const ROLL_TARGETS = [
  { value: "attack", label: "Attack rolls" },
  { value: "initiative", label: "Initiative" },
  { value: "deathSave", label: "Death saves" },
  ...ATTRIBUTES.map((a) => ({ value: `save.${a}`, label: `${ATTRIBUTE_META[a].short} save` })),
  ...SPECIAL_SKILLS.map((s) => ({ value: `special.${s}`, label: SPECIAL_SKILL_META[s].name })),
  ...SKILLS.map((s) => ({ value: `skill.${s}`, label: SKILL_META[s].name })),
];

export function TargetSelect({ value, onChange, targets = STAT_TARGETS }: { value: string; onChange: (v: string) => void; targets?: { value: string; label: string; group?: string }[] }) {
  const groups = [...new Set(targets.map((t) => t.group ?? ""))];
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) =>
        g ? (
          <optgroup key={g} label={g}>
            {targets.filter((t) => t.group === g).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ) : (
          targets
            .filter((t) => !t.group)
            .map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))
        ),
      )}
    </Select>
  );
}

// ---------- Passive effects ----------

const PASSIVE_KINDS: { kind: PassiveEffect["kind"]; label: string }[] = [
  { kind: "modifier", label: "Stat modifier" },
  { kind: "proficiency", label: "Grant proficiency" },
  { kind: "advantage", label: "Advantage / disadvantage" },
  { kind: "resistance", label: "Resistance" },
  { kind: "sense", label: "Sense" },
  { kind: "trait", label: "Trait (text)" },
  { kind: "grantAbility", label: "Grant ability" },
];

function defaultPassive(kind: PassiveEffect["kind"]): PassiveEffect {
  switch (kind) {
    case "modifier":
      return { kind, target: "ac", value: 1, op: "add" };
    case "proficiency":
      return { kind, target: "skill.stealth", level: "proficient" };
    case "advantage":
      return { kind, on: "skill.stealth", mode: "advantage" };
    case "resistance":
      return { kind, damageType: "physical", level: "resistance" };
    case "sense":
      return { kind, name: "Darkvision", rangeMeters: 18 };
    case "trait":
      return { kind, name: "", description: "" };
    case "grantAbility":
      return { kind, abilityId: "" };
  }
}

export function PassiveEffectListEditor({ value, onChange, abilities = [] }: { value: PassiveEffect[]; onChange: (v: PassiveEffect[]) => void; abilities?: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<PassiveEffect["kind"]>("modifier");
  const set = (i: number, e: PassiveEffect) => onChange(value.map((x, j) => (j === i ? e : x)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  return (
    <div className="space-y-2">
      {value.map((e, i) => (
        <div key={i} className="hud-panel space-y-1.5 p-2" style={{ ["--panel-accent" as string]: "var(--color-violet)" }}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-violet">{describePassiveEffect(e)}</span>
            <Button size="xs" variant="ghost" icon="x" onClick={() => remove(i)} aria-label="Remove effect" />
          </div>
          <PassiveEffectFields e={e} onChange={(n) => set(i, n)} abilities={abilities} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as PassiveEffect["kind"])} className="!w-auto flex-1">
          {PASSIVE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </Select>
        <Button size="sm" icon="plus" onClick={() => onChange([...value, defaultPassive(kind)])}>
          Add effect
        </Button>
      </div>
    </div>
  );
}

function PassiveEffectFields({ e, onChange, abilities }: { e: PassiveEffect; onChange: (e: PassiveEffect) => void; abilities: { id: string; name: string }[] }) {
  switch (e.kind) {
    case "modifier":
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Target" className="sm:col-span-2">
            <TargetSelect value={e.target} onChange={(target) => onChange({ ...e, target })} />
          </Field>
          <Field label="Value">
            <Input type="number" value={e.value} onChange={(ev) => onChange({ ...e, value: Number(ev.target.value) })} />
          </Field>
          <Field label="Operation">
            <Select value={e.op} onChange={(ev) => onChange({ ...e, op: ev.target.value as typeof e.op })}>
              <option value="add">Add</option>
              <option value="setBase">Set base</option>
              <option value="min">Minimum</option>
            </Select>
          </Field>
          <Field label="Stack group" hint="Same group = highest wins" className="sm:col-span-2">
            <Input value={e.stackGroup ?? ""} onChange={(ev) => onChange({ ...e, stackGroup: ev.target.value || undefined })} placeholder="e.g. armor" />
          </Field>
          <Field label="Label" className="sm:col-span-2">
            <Input value={e.label ?? ""} onChange={(ev) => onChange({ ...e, label: ev.target.value || undefined })} />
          </Field>
        </div>
      );
    case "proficiency":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Roll">
            <TargetSelect value={e.target} onChange={(target) => onChange({ ...e, target })} targets={ROLL_TARGETS} />
          </Field>
          <Field label="Level">
            <Select value={e.level} onChange={(ev) => onChange({ ...e, level: ev.target.value as typeof e.level })}>
              <option value="proficient">Proficient</option>
              <option value="expertise">Expertise</option>
            </Select>
          </Field>
        </div>
      );
    case "advantage":
      return (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Roll">
            <TargetSelect value={e.on} onChange={(on) => onChange({ ...e, on })} targets={ROLL_TARGETS} />
          </Field>
          <Field label="Mode">
            <Select value={e.mode} onChange={(ev) => onChange({ ...e, mode: ev.target.value as typeof e.mode })}>
              <option value="advantage">Advantage</option>
              <option value="disadvantage">Disadvantage</option>
            </Select>
          </Field>
          <Field label="Note">
            <Input value={e.note ?? ""} onChange={(ev) => onChange({ ...e, note: ev.target.value || undefined })} />
          </Field>
        </div>
      );
    case "resistance":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Damage type">
            <Select value={e.damageType} onChange={(ev) => onChange({ ...e, damageType: ev.target.value as typeof e.damageType })}>
              {DAMAGE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Level">
            <Select value={e.level} onChange={(ev) => onChange({ ...e, level: ev.target.value as typeof e.level })}>
              <option value="resistance">Resistance</option>
              <option value="vulnerability">Vulnerability</option>
              <option value="immunity">Immunity</option>
            </Select>
          </Field>
        </div>
      );
    case "sense":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">
            <Input value={e.name} onChange={(ev) => onChange({ ...e, name: ev.target.value })} />
          </Field>
          <Field label="Range (m)">
            <Input type="number" value={e.rangeMeters ?? 0} onChange={(ev) => onChange({ ...e, rangeMeters: Number(ev.target.value) })} />
          </Field>
        </div>
      );
    case "trait":
      return (
        <div className="grid grid-cols-1 gap-2">
          <Field label="Name">
            <Input value={e.name} onChange={(ev) => onChange({ ...e, name: ev.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={e.description ?? ""} onChange={(ev) => onChange({ ...e, description: ev.target.value })} />
          </Field>
        </div>
      );
    case "grantAbility":
      return (
        <Field label="Ability">
          <Select value={e.abilityId} onChange={(ev) => onChange({ ...e, abilityId: ev.target.value })}>
            <option value="">— pick —</option>
            {abilities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      );
  }
}

// ---------- Instant effects ----------

const INSTANT_KINDS: { kind: InstantEffect["kind"]; label: string }[] = [
  { kind: "heal", label: "Heal" },
  { kind: "damage", label: "Damage" },
  { kind: "tempHp", label: "Temporary HP" },
  { kind: "applyCondition", label: "Apply condition" },
  { kind: "removeCondition", label: "Remove condition" },
  { kind: "grantResource", label: "Grant resource" },
  { kind: "consumeResource", label: "Consume resource" },
  { kind: "disableAugmentation", label: "Disable augmentation" },
  { kind: "notify", label: "Notify" },
];

function defaultInstant(kind: InstantEffect["kind"]): InstantEffect {
  switch (kind) {
    case "heal":
      return { kind, amount: "1d8" };
    case "damage":
      return { kind, amount: "1d6", damageType: "physical", ignoreResistance: false };
    case "tempHp":
      return { kind, amount: 5 };
    case "applyCondition":
      return { kind, conditionKey: "poisoned" };
    case "removeCondition":
      return { kind, conditionKey: "poisoned" };
    case "grantResource":
      return { kind, resource: "xp", amount: 50 };
    case "consumeResource":
      return { kind, resource: "credits", amount: 10 };
    case "disableAugmentation":
      return { kind, slot: "random" };
    case "notify":
      return { kind, message: "", audience: "all" };
    case "temporaryEffect":
      return { kind, label: "Buff", effects: [], durationTurns: 1, onExpiry: [] };
  }
}

export function describeInstant(e: InstantEffect): string {
  switch (e.kind) {
    case "heal":
      return `Heal ${e.amount}`;
    case "damage":
      return `Deal ${e.amount} ${e.damageType}`;
    case "tempHp":
      return `+${e.amount} temp HP`;
    case "applyCondition":
      return `Apply ${e.conditionKey}${e.durationTurns ? ` (${e.durationTurns} turns)` : ""}`;
    case "removeCondition":
      return `Remove ${e.conditionKey}`;
    case "grantResource":
      return `+${e.amount} ${e.resource}`;
    case "consumeResource":
      return `−${e.amount} ${e.resource}`;
    case "disableAugmentation":
      return `Disable augmentation (${e.slot})`;
    case "notify":
      return `Notify: ${e.message}`;
    case "temporaryEffect":
      return `${e.label} for ${e.durationTurns ?? "∞"} turns`;
  }
}

export function InstantEffectListEditor({ value, onChange, conditionKeys = [] }: { value: InstantEffect[]; onChange: (v: InstantEffect[]) => void; conditionKeys?: { key: string; name: string }[] }) {
  const [kind, setKind] = useState<InstantEffect["kind"]>("heal");
  const set = (i: number, e: InstantEffect) => onChange(value.map((x, j) => (j === i ? e : x)));
  return (
    <div className="space-y-2">
      {value.map((e, i) => (
        <div key={i} className="hud-panel space-y-1.5 p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber">{describeInstant(e)}</span>
            <Button size="xs" variant="ghost" icon="x" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove" />
          </div>
          <InstantFields e={e} onChange={(n) => set(i, n)} conditionKeys={conditionKeys} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as InstantEffect["kind"])} className="!w-auto flex-1">
          {INSTANT_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </Select>
        <Button size="sm" icon="plus" onClick={() => onChange([...value, defaultInstant(kind)])}>
          Add
        </Button>
      </div>
    </div>
  );
}

function InstantFields({ e, onChange, conditionKeys }: { e: InstantEffect; onChange: (e: InstantEffect) => void; conditionKeys: { key: string; name: string }[] }) {
  const amountField = (label = "Amount (number or dice)") =>
    "amount" in e ? (
      <Field label={label}>
        <Input value={String(e.amount)} onChange={(ev) => onChange({ ...e, amount: /^-?\d+$/.test(ev.target.value) ? Number(ev.target.value) : ev.target.value } as InstantEffect)} />
      </Field>
    ) : null;
  const condField = () =>
    "conditionKey" in e ? (
      <Field label="Condition">
        {conditionKeys.length ? (
          <Select value={e.conditionKey} onChange={(ev) => onChange({ ...e, conditionKey: ev.target.value } as InstantEffect)}>
            {conditionKeys.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={e.conditionKey} onChange={(ev) => onChange({ ...e, conditionKey: ev.target.value } as InstantEffect)} />
        )}
      </Field>
    ) : null;
  switch (e.kind) {
    case "heal":
    case "tempHp":
      return <div className="grid grid-cols-2 gap-2">{amountField()}</div>;
    case "damage":
      return (
        <div className="grid grid-cols-3 gap-2">
          {amountField()}
          <Field label="Type">
            <Select value={e.damageType} onChange={(ev) => onChange({ ...e, damageType: ev.target.value as typeof e.damageType })}>
              {DAMAGE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ignore resistance">
            <Select value={e.ignoreResistance ? "1" : "0"} onChange={(ev) => onChange({ ...e, ignoreResistance: ev.target.value === "1" })}>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </Select>
          </Field>
        </div>
      );
    case "applyCondition":
      return (
        <div className="grid grid-cols-3 gap-2">
          {condField()}
          <Field label="Duration (turns)">
            <Input type="number" min={0} value={e.durationTurns ?? 0} onChange={(ev) => onChange({ ...e, durationTurns: Number(ev.target.value) || undefined })} />
          </Field>
          <Field label="Level">
            <Input type="number" min={0} value={e.level ?? 0} onChange={(ev) => onChange({ ...e, level: Number(ev.target.value) || undefined })} />
          </Field>
        </div>
      );
    case "removeCondition":
      return <div className="grid grid-cols-2 gap-2">{condField()}</div>;
    case "grantResource":
    case "consumeResource":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Resource">
            <Select value={e.resource} onChange={(ev) => onChange({ ...e, resource: ev.target.value } as InstantEffect)}>
              {(e.kind === "grantResource" ? ["xp", "progressionPoints", "credits", "inspiration"] : ["hitDice", "progressionPoints", "credits", "charges", "inspiration"]).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" min={1} value={e.amount} onChange={(ev) => onChange({ ...e, amount: Number(ev.target.value) })} />
          </Field>
        </div>
      );
    case "disableAugmentation":
      return (
        <Field label="Slot">
          <Select value={e.slot} onChange={(ev) => onChange({ ...e, slot: ev.target.value as typeof e.slot })}>
            <option value="random">random</option>
            {AUGMENTATION_SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      );
    case "notify":
      return (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Message">
            <Input value={e.message} onChange={(ev) => onChange({ ...e, message: ev.target.value })} />
          </Field>
          <Field label="Audience">
            <Select value={e.audience} onChange={(ev) => onChange({ ...e, audience: ev.target.value as typeof e.audience })}>
              <option value="all">all</option>
              <option value="dm">dm</option>
              <option value="owner">owner</option>
            </Select>
          </Field>
        </div>
      );
    case "temporaryEffect":
      return <div className="text-xs text-muted">Temporary bundles are built in the rule editor.</div>;
  }
}

// ---------- Requirements ----------

export function RequirementListEditor({ value, onChange }: { value: Requirement[]; onChange: (v: Requirement[]) => void }) {
  const [kind, setKind] = useState<Requirement["kind"]>("attribute");
  const add = () => {
    const next: Requirement =
      kind === "attribute"
        ? { kind, attribute: "str", min: 13 }
        : kind === "specialRank"
          ? { kind, skill: "hacking", min: 1 }
          : kind === "level"
            ? { kind, min: 3 }
            : kind === "skillTreeNode"
              ? { kind, nodeKey: "", minRank: 1 }
              : { kind: "augmentationInstalled" };
    onChange([...value, next]);
  };
  const set = (i: number, r: Requirement) => onChange(value.map((x, j) => (j === i ? r : x)));
  return (
    <div className="space-y-2">
      {value.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 text-xs">
          <span className="text-muted">{describeRequirement(r)}</span>
          {r.kind === "attribute" && (
            <>
              <Select value={r.attribute} onChange={(e) => set(i, { ...r, attribute: e.target.value as typeof r.attribute })} className="!w-24">
                {ATTRIBUTES.map((a) => (
                  <option key={a} value={a}>
                    {ATTRIBUTE_META[a].short}
                  </option>
                ))}
              </Select>
              <Input type="number" value={r.min} onChange={(e) => set(i, { ...r, min: Number(e.target.value) })} className="!w-16" />
            </>
          )}
          {r.kind === "specialRank" && (
            <>
              <Select value={r.skill} onChange={(e) => set(i, { ...r, skill: e.target.value as typeof r.skill })} className="!w-32">
                {SPECIAL_SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {SPECIAL_SKILL_META[s].name}
                  </option>
                ))}
              </Select>
              <Input type="number" value={r.min} onChange={(e) => set(i, { ...r, min: Number(e.target.value) })} className="!w-16" />
            </>
          )}
          {r.kind === "level" && <Input type="number" value={r.min} onChange={(e) => set(i, { ...r, min: Number(e.target.value) })} className="!w-16" />}
          {r.kind === "skillTreeNode" && (
            <>
              <Input value={r.nodeKey} placeholder="node key" onChange={(e) => set(i, { ...r, nodeKey: e.target.value })} className="!w-32" />
              <Input type="number" value={r.minRank} onChange={(e) => set(i, { ...r, minRank: Number(e.target.value) })} className="!w-16" />
            </>
          )}
          {r.kind === "augmentationInstalled" && (
            <Select value={r.slot ?? ""} onChange={(e) => set(i, { ...r, slot: (e.target.value || undefined) as typeof r.slot })} className="!w-28">
              <option value="">any slot</option>
              {AUGMENTATION_SLOTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
          <Button size="xs" variant="ghost" icon="x" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove" />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as Requirement["kind"])} className="!w-auto flex-1">
          <option value="attribute">Attribute minimum</option>
          <option value="specialRank">Cyberpunk skill rank</option>
          <option value="level">Level</option>
          <option value="skillTreeNode">Skill tree node</option>
          <option value="augmentationInstalled">Augmentation installed</option>
        </Select>
        <Button size="sm" icon="plus" onClick={add}>
          Add requirement
        </Button>
      </div>
    </div>
  );
}
