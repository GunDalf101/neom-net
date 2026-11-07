import type { StatValue } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmtMod } from "@/lib/format";

/** Click-to-inspect calculation breakdown. Wraps any stat display. */
export function StatBreakdown({ stat, label, children, className, format = fmtMod }: { stat: StatValue; label: string; children: ReactNode; className?: string; format?: (n: number) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.min(window.innerWidth - 290, Math.max(8, r.left));
      const top = r.bottom + 6 + 240 > window.innerHeight ? r.top - 6 - 240 : r.bottom + 6;
      setPos({ top, left });
    };
    place();
    const close = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className={clsx("cursor-help text-left", className)} title={`${label}: show calculation`}>
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
          <div className="hud-panel fixed z-[95] w-[280px] p-3 text-sm shadow-2xl" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="hud-title mb-2 flex items-center justify-between">
              <span>{label}</span>
              <span className="num text-base text-text">{format(stat.value)}</span>
            </div>
            <ul className="space-y-1">
              {stat.breakdown.map((line, i) => (
                <li key={i} className={clsx("flex items-center justify-between gap-2", line.kind === "suppressed" && "text-dim line-through", line.kind === "override" && "text-amber")}>
                  <span className="truncate">
                    {line.label}
                    {line.suppressedReason && <span className="ml-1 text-[0.65rem] no-underline">({line.suppressedReason})</span>}
                  </span>
                  <span className="num shrink-0">{line.kind === "base" || line.kind === "rank" ? line.value : fmtMod(line.value)}</span>
                </li>
              ))}
            </ul>
            {stat.override && (
              <div className="mt-2 border-t border-line pt-2 text-xs text-amber">
                DM override active. Calculated value: <span className="num">{format(stat.override.original)}</span>
                {stat.override.reason && <div className="text-muted">Reason: {stat.override.reason}</div>}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
