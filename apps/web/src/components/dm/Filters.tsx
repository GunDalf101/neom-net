import clsx from "clsx";
import type { ReactNode } from "react";
import { Button, Icon, Input, Select } from "@/components/ui";

/**
 * DM//CONTROL list tooling: a search box, chip groups and selects on one row, with the result count and a reset.
 * Pages own the state; this only draws it consistently.
 */
export function FilterBar({ search, onSearch, placeholder = "Search…", count, total, onReset, dirty, children, testId }: { search: string; onSearch: (v: string) => void; placeholder?: string; count: number; total: number; onReset: () => void; dirty: boolean; children?: ReactNode; testId?: string }) {
  return (
    <div className="hud-panel flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs" style={{ ["--panel-accent" as string]: "var(--color-line-2)" }} data-testid={testId ?? "filter-bar"}>
      <label className="relative flex items-center">
        <Icon name="search" size={12} className="pointer-events-none absolute left-2 text-dim" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="!w-44 !py-1 !pl-6 text-xs" aria-label={placeholder} />
      </label>
      {children}
      <span className="num ml-auto text-[0.62rem] text-muted" data-testid="filter-count">
        {count === total ? `${total}` : `${count} / ${total}`}
      </span>
      {dirty && (
        <Button size="xs" variant="ghost" icon="x" onClick={onReset} title="Clear filters">
          Clear
        </Button>
      )}
    </div>
  );
}

/** Single-choice chip row. `options` carry an optional count badge and colour. */
export function Chips<T extends string>({ value, onChange, options, label, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number; color?: string }[]; label: string; size?: "sm" | "xs" }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        const style = o.color ? (on ? { background: `var(--color-${o.color})`, boxShadow: `0 0 10px var(--color-${o.color})` } : { color: `var(--color-${o.color})` }) : undefined;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={clsx("hud-tab flex items-center gap-1 !px-2", size === "xs" ? "!py-0.5 !text-[0.5rem]" : "!py-1 !text-[0.55rem]", on && "active")} style={style} onClick={() => onChange(o.value)}>
            {o.label}
            {o.count !== undefined && <span className="num opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Compact labelled select for a filter bar. */
export function FilterSelect({ value, onChange, options, label, allLabel = "All" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; allLabel?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="!w-auto !py-1 text-xs" aria-label={label} title={label}>
      <option value="">
        {label}: {allLabel}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Case-insensitive "needle in any of these strings". */
export function matches(needle: string, ...hay: (string | null | undefined)[]): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return hay.some((h) => (h ?? "").toLowerCase().includes(q));
}
