import clsx from "clsx";
import { icons, type LucideProps } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { accent, pascal } from "@/lib/format";
import { useUi } from "@/store/ui";

// ---------- Icon ----------
export function Icon({ name, size = 16, ...rest }: { name: string; size?: number } & Omit<LucideProps, "size" | "ref">) {
  const key = pascal(name) as keyof typeof icons;
  const Cmp = icons[key] ?? icons.Box;
  return <Cmp size={size} strokeWidth={1.75} {...rest} />;
}

// ---------- Panel ----------
export function Panel({
  title,
  color = "cyan",
  actions,
  children,
  className,
  bodyClassName,
  icon,
}: {
  title?: ReactNode;
  color?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: string;
}) {
  return (
    <section className={clsx("hud-panel min-w-0", className)} style={{ ["--panel-accent" as string]: accent(color) }}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
          <h3 className="hud-title flex items-center gap-2" style={{ color: accent(color) }}>
            {icon && <Icon name={icon} size={13} />}
            {title}
          </h3>
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={clsx("@container min-w-0 px-3 pb-3", !title && "pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

// ---------- Button ----------
export function Button({
  children,
  variant = "outline",
  color = "cyan",
  size = "md",
  icon,
  className,
  ...rest
}: {
  children?: ReactNode;
  variant?: "outline" | "solid" | "ghost";
  color?: string;
  size?: "xs" | "sm" | "md";
  icon?: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(
        "hud-btn",
        variant === "solid" && "hud-btn-solid",
        variant === "ghost" && "hud-btn-ghost",
        size === "xs" && "!px-2 !py-1 !text-[0.58rem]",
        size === "sm" && "!px-2.5 !py-1.5 !text-[0.62rem]",
        className,
      )}
      style={{ ["--btn-color" as string]: accent(color) }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "xs" ? 12 : 14} />}
      {children}
    </button>
  );
}

/** Two-step inline confirmation for destructive actions. */
export function ConfirmButton({ onConfirm, label, confirmLabel = "Confirm?", ...rest }: { onConfirm: () => void; label: ReactNode; confirmLabel?: string } & Omit<Parameters<typeof Button>[0], "onClick" | "children">) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...rest}
      color={armed ? "crimson" : rest.color ?? "muted"}
      variant={armed ? "solid" : rest.variant ?? "ghost"}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

// ---------- Form controls ----------
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block font-display text-[0.6rem] uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("hud-input", props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx("hud-input min-h-[80px] resize-y", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("hud-input", props.className)} />;
}

export function NumberStepper({
  value,
  onChange,
  min = -99,
  max = 999,
  step = 1,
  disabled,
  color = "cyan",
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  color?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (v: number) => {
    const clamped = Math.max(min, Math.min(max, Math.round(v)));
    if (!Number.isNaN(clamped) && clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  };
  return (
    <div className={clsx("inline-flex items-stretch", className)}>
      <button type="button" disabled={disabled || value <= min} onClick={() => commit(value - step)} className="hud-btn hud-btn-ghost !px-2 !py-0.5 !text-xs" aria-label="decrease">
        −
      </button>
      <input
        className="hud-input num mx-0.5 w-14 !py-0.5 text-center text-lg font-semibold"
        style={{ color: accent(color) }}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(Number(draft))}
        onKeyDown={(e) => e.key === "Enter" && commit(Number(draft))}
        inputMode="numeric"
      />
      <button type="button" disabled={disabled || value >= max} onClick={() => commit(value + step)} className="hud-btn hud-btn-ghost !px-2 !py-0.5 !text-xs" aria-label="increase">
        +
      </button>
    </div>
  );
}

export function Toggle({ on, onChange, label, color = "cyan", disabled, size = 14 }: { on: boolean; onChange?: (v: boolean) => void; label?: ReactNode; color?: string; disabled?: boolean; size?: number }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange?.(!on)} className={clsx("inline-flex items-center gap-1.5 text-xs text-muted", onChange && !disabled && "hover:text-text", disabled && "cursor-default")}>
      <span className={clsx("hex-check", on && "on")} style={{ ["--check-color" as string]: accent(color), width: size, height: size }} />
      {label}
    </button>
  );
}

// ---------- Badge / Bar ----------
export function Badge({ children, color = "cyan", className, solid, title }: { children: ReactNode; color?: string; className?: string; solid?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={clsx("hud-clip-sm inline-flex items-center gap-1 px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.14em]", className)}
      style={solid ? { background: accent(color), color: "#04060a" } : { border: `1px solid ${accent(color)}`, color: accent(color), background: `color-mix(in srgb, ${accent(color)} 10%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Bar({ value, max, color = "cyan", className, height = 8 }: { value: number; max: number; color?: string; className?: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={clsx("bar-track", className)} style={{ height }}>
      <div className="bar-fill" style={{ width: `${pct}%`, ["--bar-color" as string]: accent(color) }} />
    </div>
  );
}

export function Pips({ count, filled, color = "cyan" }: { count: number; filled: number; color?: string }) {
  return (
    <span className="inline-flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={clsx("hex-check", i < filled && "on")} style={{ ["--check-color" as string]: accent(color) }} />
      ))}
    </span>
  );
}

// ---------- Modal / Drawer ----------
export function Modal({ open, onClose, title, children, width = "max-w-xl", color = "cyan" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string; color?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className={clsx("w-full", width)} onMouseDown={(e) => e.stopPropagation()}>
        <Panel title={title} color={color} actions={<Button size="xs" variant="ghost" icon="x" onClick={onClose} aria-label="Close" />}>
          {children}
        </Panel>
      </div>
    </div>,
    document.body,
  );
}

/** `fill`: the drawer is exactly the viewport height and its content lays out as a column (chat-style: list scrolls, composer stays put). */
export function Drawer({ open, onClose, title, children, color = "cyan", fill }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; color?: string; fill?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex h-[100dvh] justify-end bg-black/60 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={clsx("h-full w-full max-w-md border-l border-line bg-bg-1 p-3", fill ? "flex flex-col overflow-hidden" : "overflow-y-auto")} style={fill ? { paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <Panel title={title} color={color} className={fill ? "flex min-h-0 flex-1 flex-col" : undefined} bodyClassName={fill ? "flex min-h-0 flex-1 flex-col" : undefined} actions={<Button size="xs" variant="ghost" icon="x" onClick={onClose} aria-label="Close" />}>
          {children}
        </Panel>
      </div>
    </div>,
    document.body,
  );
}

// ---------- Misc ----------
export function Spinner({ label = "Syncing" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 font-display text-[0.65rem] uppercase tracking-[0.2em] text-cyan">
      <span className="inline-block h-3 w-3 animate-spin border border-cyan border-t-transparent" />
      {label}
    </div>
  );
}

export function Empty({ children, icon = "radar" }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-dim">
      <Icon name={icon} size={22} />
      <div>{children}</div>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="border border-crimson/50 bg-crimson/10 px-3 py-2 text-sm text-crimson">{msg}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="num rounded-sm border border-line-2 px-1 text-[0.65rem] text-muted">{children}</span>;
}

// ---------- Toast host ----------
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  const colorFor = { info: "cyan", success: "ok", error: "crimson", roll: "amber" } as const;
  return createPortal(
    <div className="pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="hud-panel pointer-events-auto cursor-pointer p-3" style={{ ["--panel-accent" as string]: accent(colorFor[t.kind]) }} onClick={() => dismiss(t.id)}>
          <div className="font-display text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: accent(colorFor[t.kind]) }}>
            {t.kind === "roll" ? "DICE" : t.kind === "error" ? "ERROR" : t.kind === "success" ? "OK" : "SYSTEM"}
          </div>
          <div className="text-sm leading-snug">{t.title}</div>
          {t.body && <div className="mt-0.5 text-xs text-muted">{t.body}</div>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
