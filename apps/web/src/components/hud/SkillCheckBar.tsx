import { ATTRIBUTES, ATTRIBUTE_META, SKILLS, SKILL_META, SPECIAL_SKILLS, SPECIAL_SKILL_META, type CharacterView } from "@neom/shared";
import { useState } from "react";
import { useRoll } from "@/api/hooks";
import { Icon, Select } from "@/components/ui";
import { fmtMod } from "@/lib/format";
import { useUi } from "@/store/ui";

export function D20Icon({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.6" style={{ filter: "drop-shadow(0 0 6px currentColor)" }}>
      <polygon points="32,3 58,18 58,46 32,61 6,46 6,18" />
      <polygon points="32,14 50,40 14,40" />
      <path d="M32 3v11M58 18L50 40M6 18l8 22M32 61L14 40M32 61l18-21M6 46l8-6M58 46l-8-6" />
    </svg>
  );
}

export function SkillCheckBar({ view }: { view: CharacterView }) {
  const { character: c, derived } = view;
  const [target, setTarget] = useState("skill.stealth");
  const roll = useRoll(c.campaignId);
  const mode = useUi((s) => s.rollMode);
  const visibility = useUi((s) => s.rollVisibility);

  const modifierFor = (t: string): number => {
    const [g, k] = t.split(".");
    if (g === "skill" && k) return derived.skills[k as keyof typeof derived.skills].value;
    if (g === "save" && k) return derived.saves[k as keyof typeof derived.saves].value;
    if (g === "special" && k) return derived.specialSkills[k as keyof typeof derived.specialSkills].value;
    if (t === "initiative") return derived.initiative.value;
    return 0;
  };
  const labelFor = (t: string): string => {
    const [g, k] = t.split(".");
    if (g === "skill" && k) return `${SKILL_META[k as keyof typeof SKILL_META].name} (${ATTRIBUTE_META[SKILL_META[k as keyof typeof SKILL_META].attribute].short})`;
    if (g === "save" && k) return `${ATTRIBUTE_META[k as keyof typeof ATTRIBUTE_META].short} save`;
    if (g === "special" && k) return `${SPECIAL_SKILL_META[k as keyof typeof SPECIAL_SKILL_META].name} (${ATTRIBUTE_META[SPECIAL_SKILL_META[k as keyof typeof SPECIAL_SKILL_META].attribute].short})`;
    return "Initiative";
  };

  return (
    <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
      <div className="hud-title mb-2 text-text">Skill check</div>
      <div className="flex items-center gap-2">
        <Select value={target} onChange={(e) => setTarget(e.target.value)} className="flex-1 !py-1.5">
          <optgroup label="Skills">
            {SKILLS.map((s) => (
              <option key={s} value={`skill.${s}`}>
                {SKILL_META[s].name} ({ATTRIBUTE_META[SKILL_META[s].attribute].short})
              </option>
            ))}
          </optgroup>
          <optgroup label="Cyberpunk">
            {SPECIAL_SKILLS.map((s) => (
              <option key={s} value={`special.${s}`}>
                {SPECIAL_SKILL_META[s].name} ({ATTRIBUTE_META[SPECIAL_SKILL_META[s].attribute].short})
              </option>
            ))}
          </optgroup>
          <optgroup label="Saving throws">
            {ATTRIBUTES.map((a) => (
              <option key={a} value={`save.${a}`}>
                {ATTRIBUTE_META[a].short} save
              </option>
            ))}
          </optgroup>
          <option value="initiative">Initiative</option>
        </Select>
        <span className="valbox" style={{ ["--val-color" as string]: "var(--color-cyan)" }}>
          {fmtMod(modifierFor(target))}
        </span>
        <span className="text-crimson">
          <D20Icon size={40} />
        </span>
        <button
          type="button"
          className="hud-btn !px-5 !py-2 !text-[0.78rem]"
          disabled={roll.isPending}
          onClick={() =>
            roll.mutate({
              characterId: c.id,
              target,
              category: target.startsWith("save") ? "save" : target === "initiative" ? "initiative" : "skill",
              label: labelFor(target),
              mode,
              visibility,
            })
          }
        >
          <Icon name="dices" size={14} /> Roll
        </button>
      </div>
    </section>
  );
}
