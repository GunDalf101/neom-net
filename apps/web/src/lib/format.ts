import { RARITY_META, type Rarity } from "@neom/shared";

export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const ACCENT: Record<string, string> = {
  crimson: "var(--color-crimson)",
  amber: "var(--color-amber)",
  lime: "var(--color-lime)",
  cyan: "var(--color-cyan)",
  magenta: "var(--color-magenta)",
  violet: "var(--color-violet)",
  blue: "var(--color-blue)",
  muted: "var(--color-muted)",
  ok: "var(--color-ok)",
};

export function accent(name: string | undefined): string {
  return ACCENT[name ?? "cyan"] ?? ACCENT.cyan!;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "muted",
  uncommon: "lime",
  rare: "cyan",
  veryRare: "violet",
  legendary: "amber",
  artifact: "crimson",
};

export function rarityName(r: Rarity): string {
  return RARITY_META[r]?.name ?? r;
}

export function titleCase(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function pascal(kebab: string): string {
  return kebab
    .split(/[-_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
