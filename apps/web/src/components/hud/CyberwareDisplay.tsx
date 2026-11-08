import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_META, describePassiveEffect, type AugmentationSlot, type CharacterView, type ItemInstanceDto } from "@neom/shared";
import clsx from "clsx";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { StatBreakdown } from "@/components/StatBreakdown";
import { RARITY_COLOR, accent, rarityName } from "@/lib/format";
import { AugmentationDrawer } from "./AugmentationDrawer";

const LEFT: AugmentationSlot[] = ["eyes", "ears", "arms", "hands", "legs", "feet"];
const RIGHT: AugmentationSlot[] = ["brain", "mouth", "torso", "back"];

/** Anchor positions on the figure (viewBox 0 0 200 440). */
const ANCHORS: Record<AugmentationSlot, [number, number]> = {
  brain: [100, 28],
  eyes: [88, 52],
  ears: [120, 58],
  mouth: [100, 74],
  arms: [52, 170],
  hands: [40, 236],
  torso: [100, 165],
  back: [128, 128],
  legs: [84, 310],
  feet: [86, 412],
};

const SLOT_ICON: Record<AugmentationSlot, string> = {
  eyes: "eye",
  brain: "brain",
  ears: "ear",
  mouth: "mic",
  hands: "hand",
  arms: "hand-metal",
  legs: "footprints",
  torso: "shirt",
  back: "backpack",
  feet: "footprints",
};

const STATUS_COLOR: Record<string, string> = { installed: "ok", damaged: "amber", disabled: "crimson", empty: "muted" };

export function CyberwareDisplay({ view }: { view: CharacterView }) {
  const { character: c, derived } = view;
  const [openSlot, setOpenSlot] = useState<AugmentationSlot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef<Partial<Record<AugmentationSlot, HTMLButtonElement | null>>>({});
  const [lines, setLines] = useState<{ slot: AugmentationSlot; x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);

  const installed = new Map<AugmentationSlot, ItemInstanceDto>();
  for (const i of view.items) if (i.installedSlot) installed.set(i.installedSlot, i);

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const svg = figureRef.current;
      if (!container || !svg) return;
      const cRect = container.getBoundingClientRect();
      const sRect = svg.getBoundingClientRect();
      const scaleX = sRect.width / 200;
      const scaleY = sRect.height / 440;
      const next: typeof lines = [];
      for (const slot of AUGMENTATION_SLOTS) {
        const card = cardRefs.current[slot];
        if (!card) continue;
        const r = card.getBoundingClientRect();
        const isLeft = LEFT.includes(slot);
        const [ax, ay] = ANCHORS[slot];
        const item = installed.get(slot);
        next.push({
          slot,
          x1: (isLeft ? r.right : r.left) - cRect.left,
          y1: r.top + r.height / 2 - cRect.top,
          x2: sRect.left - cRect.left + ax * scaleX,
          y2: sRect.top - cRect.top + ay * scaleY,
          color: item ? accent(RARITY_COLOR[item.definition.rarity]) : "rgba(25,227,255,0.35)",
        });
      }
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.items.map((i) => `${i.id}:${i.status}:${i.installedSlot}`).join("|")]);

  const cap = derived.capacity.value;
  const used = derived.capacityUsed;

  return (
    <div className="relative flex h-full min-w-[520px] flex-col lg:min-w-0">
      {/* Track minimums must stay under the centre column's 560px floor (516px here); the roomier set only applies on wide screens. */}
      <div ref={containerRef} className="relative grid flex-1 grid-cols-[minmax(170px,1fr)_minmax(160px,1.05fr)_minmax(170px,1fr)] gap-2 2xl:grid-cols-[minmax(190px,1fr)_minmax(200px,1.15fr)_minmax(190px,1fr)]">
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
          {lines.map((l) => {
            const midX = l.x1 + (l.x2 - l.x1) * 0.5;
            return (
              <g key={l.slot}>
                <polyline points={`${l.x1},${l.y1} ${midX},${l.y1} ${l.x2},${l.y2}`} fill="none" stroke={l.color} strokeWidth={1.2} strokeDasharray={installed.has(l.slot) ? undefined : "3 4"} opacity={0.9} />
                <circle cx={l.x1} cy={l.y1} r={2.5} fill={l.color} />
                <circle cx={l.x2} cy={l.y2} r={3.5} fill={l.color} style={{ filter: `drop-shadow(0 0 5px ${l.color})` }} />
              </g>
            );
          })}
        </svg>
        <div className="relative z-10 flex flex-col justify-between gap-1.5 py-1">
          {LEFT.map((slot) => (
            <SlotCard key={slot} slot={slot} item={installed.get(slot)} onOpen={() => setOpenSlot(slot)} refFn={(el) => (cardRefs.current[slot] = el)} />
          ))}
        </div>
        <div className="relative z-0 flex items-center justify-center">
          <Figure ref={figureRef} portraitUrl={c.portraitUrl} installed={installed} />
        </div>
        <div className="relative z-10 flex flex-col justify-between gap-1.5 py-1">
          {RIGHT.map((slot) => (
            <SlotCard key={slot} slot={slot} item={installed.get(slot)} onOpen={() => setOpenSlot(slot)} refFn={(el) => (cardRefs.current[slot] = el)} />
          ))}
        </div>
      </div>
      <div className="hud-panel mt-2 flex items-center gap-3 px-3 py-2" style={{ ["--panel-accent" as string]: used > cap ? "var(--color-crimson)" : "var(--color-cyan)" }}>
        <span className="font-display text-[0.78rem] font-bold uppercase tracking-[0.1em] text-text">Cyberware capacity</span>
        <div className="seg-meter flex-1" style={{ ["--meter-color" as string]: used > cap ? "var(--color-crimson)" : "var(--color-cyan)" }}>
          {Array.from({ length: Math.max(cap, used) }).map((_, i) => (
            <span key={i} className={clsx(i < used && "on")} />
          ))}
        </div>
        <StatBreakdown stat={derived.capacity} label="Cyberware capacity" format={(n) => String(n)}>
          <span className={clsx("num text-[1.1rem] font-bold", used > cap ? "text-crimson" : "text-cyan")}>
            {used} / {cap}
          </span>
        </StatBreakdown>
      </div>
      <AugmentationDrawer view={view} slot={openSlot} onClose={() => setOpenSlot(null)} />
    </div>
  );
}

function SlotCard({ slot, item, onOpen, refFn }: { slot: AugmentationSlot; item: ItemInstanceDto | undefined; onOpen: () => void; refFn: (el: HTMLButtonElement | null) => void }) {
  const status = item ? item.status : "empty";
  const rc = item ? accent(RARITY_COLOR[item.definition.rarity]) : "rgba(25,227,255,0.4)";
  const effects = item ? [...item.definition.effects, ...(item.customEffects ?? [])] : [];
  const perks = effects.map(describePassiveEffect).slice(0, 2);
  return (
    <button ref={refFn} type="button" onClick={onOpen} className={clsx("rarity-card w-full p-1.5 text-left transition hover:brightness-125 2xl:p-2", status !== "installed" && status !== "empty" && "saturate-50")} style={{ ["--rc" as string]: rc }}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-display text-[0.86rem] font-bold uppercase tracking-[0.06em] text-text">{AUGMENTATION_SLOT_META[slot].name}</span>
        <span className="rarity-pill" style={{ ["--rc" as string]: item ? rc : "var(--color-muted)" }}>
          {item ? rarityName(item.definition.rarity) : "Empty"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="tile" style={{ ["--tile-color" as string]: item ? rc : "var(--color-cyan)", width: 40, height: 40, opacity: item ? 1 : 0.55 }}>
          <Icon name={SLOT_ICON[slot]} size={20} />
        </span>
        <span className="relative flex h-[40px] flex-1 items-center justify-center overflow-hidden border bg-bg-0/70" style={{ borderColor: `color-mix(in srgb, ${rc} 50%, transparent)` }}>
          {item?.definition.imageUrl ? (
            <img src={item.definition.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : item ? (
            <>
              <Icon name={item.definition.icon} size={26} style={{ color: rc, filter: `drop-shadow(0 0 6px ${rc})` }} />
              <span className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_6px,rgba(255,255,255,0.03)_6px_7px)]" />
            </>
          ) : (
            <span className="text-[0.6rem] uppercase tracking-wider text-dim">no module</span>
          )}
        </span>
      </div>
      <div className="mt-1 truncate text-[0.82rem] font-semibold leading-tight text-text">{item ? item.customName ?? item.definition.name : "—"}</div>
      <div className="text-[0.68rem] leading-[1.15] text-text/70">
        {item ? perks.map((p, i) => <div key={i} className="truncate">+ {p}</div>) : <div className="text-dim">Tap to install</div>}
      </div>
      {item && status !== "installed" && <div className="mt-0.5 text-[0.6rem] font-bold uppercase tracking-wider" style={{ color: accent(STATUS_COLOR[status] ?? "muted") }}>{status}</div>}
    </button>
  );
}

const Figure = forwardRef<SVGSVGElement, { portraitUrl: string | null; installed: Map<AugmentationSlot, ItemInstanceDto> }>(function Figure({ portraitUrl, installed }, ref) {
  const glow = (slot: AugmentationSlot) => {
    const item = installed.get(slot);
    if (!item) return "rgba(25,227,255,0.35)";
    return accent(item.status === "installed" ? RARITY_COLOR[item.definition.rarity] : STATUS_COLOR[item.status] ?? "ok");
  };
  return (
    <div className="relative h-full min-h-[420px] w-full max-w-[280px]">
      {portraitUrl && (
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
          <img src={portraitUrl} alt="" className="h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-0" />
        </div>
      )}
      <svg ref={ref} viewBox="0 0 200 440" className="relative h-full w-full" fill="none" stroke="var(--color-cyan)" strokeWidth="1.2" style={{ filter: "drop-shadow(0 0 6px rgba(25,227,255,0.25))" }}>
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(25,227,255,0.12)" />
            <stop offset="1" stopColor="rgba(255,45,85,0.06)" />
          </linearGradient>
        </defs>
        <g opacity={portraitUrl ? 0.3 : 1}>
          <ellipse cx="100" cy="50" rx="24" ry="30" fill="url(#bodyGrad)" />
          <path d="M80 60 q20 26 40 0" opacity="0.5" />
          <path d="M100 80 v16" />
          <path d="M70 100 q30 -12 60 0 l18 12 q10 8 12 30 l6 60 q2 12 -4 22 l-6 10" />
          <path d="M70 100 l-18 12 q-10 8 -12 30 l-6 60 q-2 12 4 22 l6 10" />
          <path d="M72 112 q28 -8 56 0 l6 90 q-34 14 -68 0 z" fill="url(#bodyGrad)" />
          <path d="M80 130 h40 M78 150 h44 M80 170 h40" opacity="0.4" />
          <path d="M52 112 l-10 70 l-4 52" />
          <path d="M148 112 l10 70 l4 52" />
          <path d="M38 234 l-6 18 M38 234 l4 18 M162 234 l6 18 M162 234 l-4 18" />
          <path d="M66 202 l-2 50 l8 70 l-2 70 l16 0 M134 202 l2 50 l-8 70 l2 70 l-16 0" />
          <path d="M70 252 l14 70 l-2 70 l16 0 M130 252 l-14 70 l2 70 l-16 0" opacity="0.55" />
          <path d="M84 325 q16 6 32 0" opacity="0.4" />
          <path d="M70 392 l-4 20 h28 l-8 -20 M130 392 l4 20 h-28 l8 -20" />
          <path d="M100 100 v100" strokeDasharray="2 4" opacity="0.6" />
          <circle cx="100" cy="128" r="6" stroke="var(--color-crimson)" opacity="0.8" />
          <circle cx="100" cy="128" r="2" fill="var(--color-crimson)" />
        </g>
        {AUGMENTATION_SLOTS.map((slot) => {
          const [x, y] = ANCHORS[slot];
          const color = glow(slot);
          return (
            <g key={slot}>
              <circle cx={x} cy={y} r="5" stroke={color} fill="rgba(4,6,10,0.8)" />
              <circle cx={x} cy={y} r="2" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
            </g>
          );
        })}
      </svg>
      <div className="hud-scan" />
    </div>
  );
});
