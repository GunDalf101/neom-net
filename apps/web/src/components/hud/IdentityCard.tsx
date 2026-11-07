import { HIT_DIE_SIZES, hitDieForClass, levelForXp, xpForLevel, type CharacterView, type HitDieSize } from "@neom/shared";
import { useState } from "react";
import { useUpdateCharacter } from "@/api/hooks";
import { Bar, Button, Field, Icon, Input, Modal, Select, Textarea } from "@/components/ui";
import { StatBreakdown } from "@/components/StatBreakdown";
import { fmtMod } from "@/lib/format";
import { Portrait } from "./Portrait";

export function IdentityCard({ view, compact }: { view: CharacterView; compact?: boolean }) {
  const { character: c, derived, permissions } = view;
  const [edit, setEdit] = useState(false);
  const nextLevelXp = c.level >= 20 ? xpForLevel(20) : xpForLevel(c.level + 1);
  const curLevelXp = xpForLevel(c.level);
  const impliedLevel = levelForXp(c.xp);
  const size = compact ? 150 : 180;

  return (
    <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
      <div className="flex gap-3">
        <Portrait url={c.portraitUrl} name={c.name} size={size} className="border-cyan/40" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="font-display text-[1.05rem] font-black uppercase leading-tight tracking-[0.06em] text-text">{c.name}</h1>
            <span className="flex items-center gap-1">
              {permissions.canEdit && (
                <button type="button" onClick={() => setEdit(true)} className="text-muted hover:text-cyan" aria-label="Edit identity">
                  <Icon name="pencil" size={14} />
                </button>
              )}
              <Icon name="shield-half" size={30} className="text-muted/60" />
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-[0.95rem] leading-snug">
            <div className="text-text/90">{c.species || "—"}</div>
            <div className="text-cyan">
              {c.characterClass || "Unassigned"}
              {c.subclass && <span className="text-cyan/80"> // {c.subclass}</span>}
            </div>
            <div className="text-text/90">
              Level <span className="num">{c.level}</span>
              {impliedLevel > c.level && <span className="ml-2 text-[0.6rem] uppercase tracking-wider text-amber">XP for {impliedLevel}</span>}
            </div>
            <div className="uppercase text-text/80">{c.faction || "No faction"}</div>
            <div className="text-text/80">{c.alignment || "Unaligned"}</div>
          </div>
          {!compact && (
            <div className="mt-2">
              <Bar value={c.xp - curLevelXp} max={Math.max(1, nextLevelXp - curLevelXp)} color="cyan" height={7} />
              <div className="num mt-1 text-xs text-cyan">
                {c.xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP
              </div>
            </div>
          )}
        </div>
      </div>
      {compact && (
        <div className="mt-2">
          <Bar value={c.xp - curLevelXp} max={Math.max(1, nextLevelXp - curLevelXp)} color="cyan" height={6} />
          <div className="num mt-1 text-xs text-cyan">
            {c.xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border border-cyan/25 bg-bg-0/50 px-3 py-1.5">
        <span className="text-[0.95rem] text-text">Proficiency Bonus</span>
        <StatBreakdown stat={derived.profBonus} label="Proficiency bonus">
          <span className="valbox" style={{ ["--val-color" as string]: "var(--color-cyan)" }}>
            {fmtMod(derived.profBonus.value)}
          </span>
        </StatBreakdown>
      </div>
      <IdentityEditor view={view} open={edit} onClose={() => setEdit(false)} />
    </section>
  );
}

function IdentityEditor({ view, open, onClose }: { view: CharacterView; open: boolean; onClose: () => void }) {
  const { character: c, permissions } = view;
  const update = useUpdateCharacter(c.id);
  const [form, setForm] = useState({
    name: c.name,
    species: c.species,
    characterClass: c.characterClass,
    subclass: c.subclass,
    faction: c.faction,
    alignment: c.alignment,
    background: c.background,
    biography: c.biography,
    level: c.level,
    xp: c.xp,
    hitDieSize: c.hitDieSize as HitDieSize,
    portraitUrl: c.portraitUrl,
  });
  const [dieTouched, setDieTouched] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setClass = (v: string) => setForm((f) => ({ ...f, characterClass: v, hitDieSize: dieTouched ? f.hitDieSize : hitDieForClass(v) }));

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      alert("Portrait must be under 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("portraitUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <Modal open={open} onClose={onClose} title="Identity">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body: Record<string, unknown> = { ...form, expectedVersion: c.version };
          if (!permissions.canLevelUp) {
            delete body.level;
            delete body.xp;
          }
          if (!permissions.canEditAttributes || form.hitDieSize === c.hitDieSize) delete body.hitDieSize;
          await update.mutateAsync(body);
          onClose();
        }}
      >
        <div className="flex items-center gap-3">
          <Portrait url={form.portraitUrl} name={form.name} size={72} />
          <div className="space-y-1 text-xs">
            <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="block text-xs text-muted" />
            <div className="flex gap-2">
              <Input placeholder="…or image URL" value={form.portraitUrl?.startsWith("data:") ? "" : form.portraitUrl ?? ""} onChange={(e) => set("portraitUrl", e.target.value || null)} />
              {form.portraitUrl && (
                <Button size="xs" variant="ghost" onClick={() => set("portraitUrl", null)}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Species">
            <Input value={form.species} onChange={(e) => set("species", e.target.value)} />
          </Field>
          <Field label="Class" hint={!dieTouched && form.characterClass ? `hit die follows the class (d${hitDieForClass(form.characterClass)})` : undefined}>
            <Input value={form.characterClass} onChange={(e) => setClass(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Subclass">
              <Input value={form.subclass} onChange={(e) => set("subclass", e.target.value)} />
            </Field>
            <Field label="Hit die" hint={!permissions.canEditAttributes ? "DM sets the hit die" : undefined}>
              <Select value={form.hitDieSize} disabled={!permissions.canEditAttributes} onChange={(e) => { setDieTouched(true); set("hitDieSize", Number(e.target.value) as HitDieSize); }}>
                {HIT_DIE_SIZES.map((d) => (
                  <option key={d} value={d}>
                    d{d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Faction">
            <Input value={form.faction} onChange={(e) => set("faction", e.target.value)} />
          </Field>
          <Field label="Alignment">
            <Input value={form.alignment} onChange={(e) => set("alignment", e.target.value)} />
          </Field>
          <Field label="Background">
            <Input value={form.background} onChange={(e) => set("background", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Level" hint={!permissions.canLevelUp ? "DM controls levelling" : undefined}>
              <Input type="number" min={1} max={20} value={form.level} disabled={!permissions.canLevelUp} onChange={(e) => set("level", Number(e.target.value))} />
            </Field>
            <Field label="XP">
              <Input type="number" min={0} value={form.xp} disabled={!permissions.canLevelUp} onChange={(e) => set("xp", Number(e.target.value))} />
            </Field>
          </div>
        </div>
        <Field label="Biography">
          <Textarea value={form.biography} onChange={(e) => set("biography", e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" disabled={update.isPending} icon="save">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
