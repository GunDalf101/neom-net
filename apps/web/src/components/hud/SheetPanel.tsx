import {
  ATTRIBUTES,
  ATTRIBUTE_META,
  SKILLS,
  SKILL_META,
  SPECIAL_SKILLS,
  SPECIAL_SKILL_META,
  type AttributeKey,
  type CharacterView,
  type ProficiencyMultiplier,
  type SkillKey,
  type SpecialSkillKey,
} from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useRoll, useUpdateCharacter } from "@/api/hooks";
import { Icon } from "@/components/ui";
import { StatBreakdown } from "@/components/StatBreakdown";
import { fmtMod } from "@/lib/format";
import { ATTR_ICON, SPECIAL_ICON, attrColor } from "@/lib/hud";
import { useUi } from "@/store/ui";

type Tab = "attributes" | "skills" | "saves";

/** Left column: ATTRIBUTES / SKILLS / SAVING THROWS. */
export function SheetPanel({ view }: { view: CharacterView }) {
  const [tab, setTab] = useState<Tab>("attributes");
  return (
    <div className="space-y-2">
      <div className="seg">
        {(["attributes", "skills", "saves"] as Tab[]).map((t) => (
          <button key={t} className={clsx(tab === t && "active")} onClick={() => setTab(t)}>
            {t === "attributes" ? "Attributes" : t === "skills" ? "Skills" : "Saving throws"}
          </button>
        ))}
      </div>
      {tab === "attributes" && ATTRIBUTES.map((a) => <AttributeRow key={a} attr={a} view={view} />)}
      {tab === "skills" && <SkillsTab view={view} />}
      {tab === "saves" && <SavesTab view={view} />}
    </div>
  );
}

function useRoller(view: CharacterView) {
  const roll = useRoll(view.character.campaignId);
  const mode = useUi((s) => s.rollMode);
  const visibility = useUi((s) => s.rollVisibility);
  return (target: string, label: string, category: "skill" | "save") => roll.mutate({ characterId: view.character.id, target, category, label, mode, visibility });
}

/** Editable score box: type a number and blur / press Enter. */
function ScoreBox({ value, onCommit, editable, color }: { value: number; onCommit: (v: number) => void; editable: boolean; color?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!editable) return <span className="valbox">{value}</span>;
  return (
    <input
      className="valbox"
      style={color ? ({ ["--val-color" as string]: color } as React.CSSProperties) : undefined}
      value={draft ?? String(value)}
      inputMode="numeric"
      onFocus={() => setDraft(String(value))}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => {
        const n = Number(draft);
        if (draft !== null && n >= 1 && n <= 30 && n !== value) onCommit(n);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      title="Type a new score, then press Enter"
    />
  );
}

function SqCheck({ on, color, onChange, disabled, label }: { on: boolean; color: string; onChange?: (v: boolean) => void; disabled?: boolean; label?: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange?.(!on)} className={clsx("inline-flex items-center gap-1.5 text-xs text-text/80", disabled && "cursor-default")}>
      <span className={clsx("sq-check", on && "on")} style={{ ["--check-color" as string]: color }} />
      {label}
    </button>
  );
}

function SkillChip({ skill, view, color, onRoll, onToggle }: { skill: SkillKey; view: CharacterView; color: string; onRoll: () => void; onToggle: () => void }) {
  const d = view.derived.skills[skill];
  const flags = view.derived.rollFlags.filter((f) => f.on === `skill.${skill}`);
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.82rem]">
      <button type="button" onClick={onToggle} disabled={!view.permissions.canEditAttributes} className="tile tile-sm" style={{ ["--tile-color" as string]: d.proficiency > 0 ? color : "var(--color-dim)", opacity: d.proficiency > 0 ? 1 : 0.6 }} title={d.proficiency === 0 ? "Not proficient" : d.proficiency === 1 ? "Proficient" : "Expertise"}>
        <Icon name={d.proficiency === 2 ? "star" : "square"} size={10} />
      </button>
      <button type="button" onClick={onRoll} className="text-text/85 hover:text-cyan" title={`Roll ${SKILL_META[skill].name}`}>
        {SKILL_META[skill].name}
      </button>
      {flags.map((f, i) => (
        <span key={i} className={clsx("font-display text-[0.48rem]", f.mode === "advantage" ? "text-ok" : "text-crimson")} title={`${f.mode}: ${f.sourceName}`}>
          {f.mode === "advantage" ? "ADV" : "DIS"}
        </span>
      ))}
      <StatBreakdown stat={d} label={SKILL_META[skill].name}>
        <span className="num font-semibold text-text">{fmtMod(d.value)}</span>
      </StatBreakdown>
    </span>
  );
}

export function AttributeRow({ attr, view }: { attr: AttributeKey; view: CharacterView }) {
  const meta = ATTRIBUTE_META[attr];
  const color = attrColor(attr);
  const { character: c, derived, permissions } = view;
  const update = useUpdateCharacter(c.id);
  const doRoll = useRoller(view);
  const special = meta.special;
  const sMeta = SPECIAL_SKILL_META[special];
  const skills = SKILLS.filter((s) => SKILL_META[s].attribute === attr);
  const editable = permissions.canEditAttributes;
  const score = derived.attributes[attr];

  return (
    <div className="hud-panel flex items-stretch gap-3 p-2" style={{ ["--panel-accent" as string]: color }}>
      <span className="tile tile-lg self-center" style={{ ["--tile-color" as string]: color }}>
        <Icon name={ATTR_ICON[attr]} size={30} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-[0.95rem] font-bold uppercase tracking-[0.04em] text-text">{meta.name}</span>
          <span className="ml-auto flex items-center gap-2">
            {score.override || score.value !== c.attributes[attr] ? (
              <StatBreakdown stat={score} label={`${meta.name} score`} format={(n) => String(n)}>
                <span className="valbox" style={{ ["--val-color" as string]: score.override ? "var(--color-amber)" : "var(--color-text)" }}>
                  {score.value}
                </span>
              </StatBreakdown>
            ) : (
              <ScoreBox value={c.attributes[attr]} editable={editable} onCommit={(v) => update.mutate({ attributes: { ...c.attributes, [attr]: v } })} />
            )}
            <span className="valbox" style={{ ["--val-color" as string]: color }} title="Modifier">
              {fmtMod(derived.modifiers[attr])}
            </span>
          </span>
          <SqCheck on={derived.saves[attr].proficient} color={color} disabled={!editable} onChange={(v) => update.mutate({ saveProficiencies: { [attr]: v } })} label={<span className="text-[0.72rem]">Saving Throw</span>} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[0.85rem]">
            <span className="tile tile-sm" style={{ ["--tile-color" as string]: color }}>
              <Icon name={SPECIAL_ICON[special]} size={11} />
            </span>
            <button type="button" className="hover:text-cyan" style={{ color }} onClick={() => doRoll(`special.${special}`, sMeta.name, "skill")} title={sMeta.description}>
              {sMeta.name}
            </button>
            <span className="text-[0.65rem] text-dim">rk {derived.specialSkills[special].rank}</span>
            <StatBreakdown stat={derived.specialSkills[special]} label={sMeta.name}>
              <span className="num font-semibold" style={{ color }}>
                {fmtMod(derived.specialSkills[special].value)}
              </span>
            </StatBreakdown>
          </span>
        </div>
        {skills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {skills.map((s) => (
              <SkillChip key={s} skill={s} view={view} color={color} onRoll={() => doRoll(`skill.${s}`, SKILL_META[s].name, "skill")} onToggle={() => update.mutate({ skills: { [s]: ((c.skills[s] + 1) % 3) as ProficiencyMultiplier } })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkillsTab({ view }: { view: CharacterView }) {
  const { character: c, derived, permissions } = view;
  const update = useUpdateCharacter(c.id);
  const doRoll = useRoller(view);
  const editable = permissions.canEditAttributes;
  return (
    <div className="space-y-2">
      <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1.5">Cyberpunk skills</div>
        <div className="space-y-1">
          {SPECIAL_SKILLS.map((k: SpecialSkillKey) => {
            const m = SPECIAL_SKILL_META[k];
            const color = attrColor(m.attribute);
            const own = c.specialSkills[k];
            const d = derived.specialSkills[k];
            return (
              <div key={k} className="flex items-center gap-2 border-b border-line/50 py-1 text-sm last:border-0" title={m.description}>
                <span className="tile tile-sm" style={{ ["--tile-color" as string]: color }}>
                  <Icon name={SPECIAL_ICON[k]} size={11} />
                </span>
                <button type="button" className="w-28 text-left hover:text-cyan" style={{ color }} onClick={() => doRoll(`special.${k}`, m.name, "skill")}>
                  {m.name} <span className="text-[0.65rem] text-dim">({ATTRIBUTE_META[m.attribute].short})</span>
                </button>
                <span className="flex items-center gap-1 text-xs text-muted">
                  rank
                  <ScoreBox value={own.rank} editable={editable} onCommit={(v) => update.mutate({ specialSkills: { [k]: { ...own, rank: v } } })} />
                </span>
                <SqCheck on={d.proficiency > 0} color={color} disabled={!editable} onChange={(v) => update.mutate({ specialSkills: { [k]: { ...own, proficiency: v ? 1 : 0 } } })} label="prof" />
                <span className="ml-auto">
                  <StatBreakdown stat={d} label={m.name}>
                    <span className="valbox" style={{ ["--val-color" as string]: color }}>
                      {fmtMod(d.value)}
                    </span>
                  </StatBreakdown>
                </span>
                <button type="button" className="text-dim hover:text-cyan" onClick={() => doRoll(`special.${k}`, m.name, "skill")} aria-label="Roll">
                  <Icon name="dices" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1.5 flex items-center justify-between">
          <span>Standard skills</span>
          <span className="text-[0.55rem] text-dim">click the tile: none → proficient → expertise</span>
        </div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {SKILLS.map((s) => {
            const m = SKILL_META[s];
            const color = attrColor(m.attribute);
            const d = derived.skills[s];
            return (
              <div key={s} className="flex items-center gap-2 border-b border-line/40 py-0.5 text-sm">
                <button type="button" disabled={!editable} onClick={() => update.mutate({ skills: { [s]: ((c.skills[s] + 1) % 3) as ProficiencyMultiplier } })} className="tile tile-sm" style={{ ["--tile-color" as string]: d.proficiency > 0 ? color : "var(--color-dim)", opacity: d.proficiency > 0 ? 1 : 0.6 }}>
                  <Icon name={d.proficiency === 2 ? "star" : "square"} size={10} />
                </button>
                <button type="button" className="flex-1 text-left text-text/85 hover:text-cyan" onClick={() => doRoll(`skill.${s}`, m.name, "skill")}>
                  {m.name} <span className="text-[0.65rem] text-dim">({ATTRIBUTE_META[m.attribute].short})</span>
                </button>
                <StatBreakdown stat={d} label={m.name}>
                  <span className="num font-semibold">{fmtMod(d.value)}</span>
                </StatBreakdown>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SavesTab({ view }: { view: CharacterView }) {
  const { character: c, derived, permissions } = view;
  const update = useUpdateCharacter(c.id);
  const doRoll = useRoller(view);
  return (
    <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
      <div className="hud-title mb-1.5">Saving throws</div>
      {ATTRIBUTES.map((a) => {
        const color = attrColor(a);
        const d = derived.saves[a];
        const flags = derived.rollFlags.filter((f) => f.on === `save.${a}`);
        return (
          <div key={a} className="flex items-center gap-3 border-b border-line/50 py-1.5 text-sm last:border-0">
            <span className="tile" style={{ ["--tile-color" as string]: color }}>
              <Icon name={ATTR_ICON[a]} size={20} />
            </span>
            <span className="w-28 font-display text-[0.8rem] font-bold uppercase text-text">{ATTRIBUTE_META[a].name}</span>
            <SqCheck on={d.proficient} color={color} disabled={!permissions.canEditAttributes} onChange={(v) => update.mutate({ saveProficiencies: { [a]: v } })} label="Proficient" />
            {flags.map((f, i) => (
              <span key={i} className={clsx("font-display text-[0.5rem]", f.mode === "advantage" ? "text-ok" : "text-crimson")}>
                {f.mode === "advantage" ? "ADV" : "DIS"} · {f.sourceName}
              </span>
            ))}
            <span className="ml-auto">
              <StatBreakdown stat={d} label={`${ATTRIBUTE_META[a].short} save`}>
                <span className="valbox" style={{ ["--val-color" as string]: color }}>
                  {fmtMod(d.value)}
                </span>
              </StatBreakdown>
            </span>
            <button type="button" className="hud-btn !px-2 !py-1 !text-[0.55rem]" onClick={() => doRoll(`save.${a}`, `${ATTRIBUTE_META[a].short} save`, "save")}>
              <Icon name="dices" size={12} /> Roll
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Compact attribute + special skill lists used on the Inventory page. */
export function CompactAttributes({ view }: { view: CharacterView }) {
  const { derived } = view;
  const doRoll = useRoller(view);
  return (
    <div className="space-y-2">
      <section className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1.5">Attributes</div>
        {ATTRIBUTES.map((a) => {
          const color = attrColor(a);
          return (
            <div key={a} className="flex items-center gap-2 border-b border-line/40 py-1 last:border-0">
              <span className="tile" style={{ ["--tile-color" as string]: color, width: 36, height: 36 }}>
                <Icon name={ATTR_ICON[a]} size={18} />
              </span>
              <span className="flex-1 font-display text-[0.8rem] font-bold uppercase text-text">{ATTRIBUTE_META[a].name}</span>
              <StatBreakdown stat={derived.attributes[a]} label={ATTRIBUTE_META[a].name} format={(n) => String(n)}>
                <span className="valbox">{derived.attributes[a].value}</span>
              </StatBreakdown>
              <span className="valbox" style={{ ["--val-color" as string]: color }}>
                {fmtMod(derived.modifiers[a])}
              </span>
            </div>
          );
        })}
      </section>
      <section className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="hud-title mb-1.5">Special skills</div>
        {SPECIAL_SKILLS.map((k) => {
          const m = SPECIAL_SKILL_META[k];
          const color = attrColor(m.attribute);
          const d = derived.specialSkills[k];
          return (
            <div key={k} className="flex items-center gap-2 border-b border-line/40 py-1 last:border-0">
              <span className="tile" style={{ ["--tile-color" as string]: color, width: 32, height: 32 }}>
                <Icon name={SPECIAL_ICON[k]} size={15} />
              </span>
              <button type="button" className="flex-1 text-left text-[0.9rem] hover:text-cyan" style={{ color }} onClick={() => doRoll(`special.${k}`, m.name, "skill")}>
                {m.name} <span className="text-text/70">({ATTRIBUTE_META[m.attribute].short})</span>
              </button>
              <StatBreakdown stat={d} label={m.name}>
                <span className="valbox" style={{ ["--val-color" as string]: color }}>
                  {fmtMod(d.value)}
                </span>
              </StatBreakdown>
            </div>
          );
        })}
      </section>
    </div>
  );
}
