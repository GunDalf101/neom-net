import clsx from "clsx";

/** Portrait with a futuristic placeholder when no image is set. */
export function Portrait({ url, name, size = 96, className }: { url: string | null; name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={clsx("hud-clip-sm relative shrink-0 overflow-hidden border border-line-2 bg-bg-2", className)} style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(25,227,255,0.25),transparent_60%)]">
          <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full opacity-40" fill="none" stroke="var(--color-cyan)" strokeWidth="1">
            <circle cx="32" cy="24" r="11" />
            <path d="M12 60c2-14 10-20 20-20s18 6 20 20" />
            <path d="M8 8h12M8 8v12M56 8H44M56 8v12M8 56v-12M56 56v-12" />
          </svg>
          <span className="relative font-display text-lg font-bold tracking-widest text-cyan">{initials}</span>
        </div>
      )}
      <div className="hud-scan" />
    </div>
  );
}
