import type { SheetChange } from "@neom/shared";

const LABELS: Record<string, string> = {
  name: "Name", species: "Species", characterClass: "Class", subclass: "Subclass", faction: "Faction", alignment: "Alignment",
  background: "Background", biography: "Biography", portraitUrl: "Portrait", level: "Level", xp: "XP", hpMaxBase: "Base max HP",
  baseSpeed: "Base speed", hitDieSize: "Hit die", inspiration: "Inspiration", credits: "Credits", progressionPoints: "Points",
  acBase: "Base AC", acBonus: "AC adjustment", attributes: "Attribute", skills: "Skill", saveProficiencies: "Save", specialSkills: "Cyberpunk skill",
};
const PROF = ["none", "proficient", "expertise"];

function fmt(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field.startsWith("skills.")) return PROF[Number(v)] ?? String(v);
  if (field.startsWith("specialSkills.") && typeof v === "object") {
    const o = v as { rank?: number; proficiency?: number };
    return `rank ${o.rank ?? 0} · ${PROF[o.proficiency ?? 0] ?? o.proficiency}`;
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function label(field: string): string {
  const [head, key] = field.split(".");
  if (key) return `${LABELS[head ?? ""] ?? head} · ${key.toUpperCase()}`;
  return LABELS[field] ?? field;
}

export function isChangeList(v: unknown): v is SheetChange[] {
  return Array.isArray(v) && v.every((c) => c && typeof c === "object" && "field" in c);
}

/** Before → after table used by the change log and the DM event history. */
export function ChangeList({ changes }: { changes: SheetChange[] }) {
  if (changes.length === 0) return <div className="text-[0.65rem] text-dim">No field changes recorded.</div>;
  return (
    <table className="num w-full text-[0.68rem]">
      <tbody>
        {changes.map((c, i) => (
          <tr key={i} className="border-b border-line/40 last:border-0">
            <td className="py-0.5 pr-2 text-muted">{label(c.field)}</td>
            <td className="py-0.5 pr-1 text-crimson/80 line-through decoration-crimson/60">{fmt(c.field, c.from)}</td>
            <td className="py-0.5 pr-1 text-dim">→</td>
            <td className="py-0.5 text-ok">{fmt(c.field, c.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
