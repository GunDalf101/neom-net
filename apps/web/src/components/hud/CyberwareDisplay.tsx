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
  brain: [100, 26],
  eyes: [91, 42],
  ears: [78, 50],
  mouth: [100, 62],
  arms: [48, 140],
  hands: [56, 262],
  torso: [112, 158],
  back: [128, 108],
  legs: [80, 300],
  feet: [76, 404],
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

/**
 * Holographic anatomy, viewBox 0 0 200 440. Right-hand limbs are drawn once (x >= 100) and mirrored,
 * the torso and head are centred. Slot anchors above are expressed in the same coordinates.
 */
const HOLO = {
  head: "M100 16 C114 16 123 28 122 44 C121 58 112 69 100 71 C88 69 79 58 78 44 C77 28 86 16 100 16 Z",
  torso:
    "M92 66 L92 82 C80 84 64 88 54 96 C58 104 62 110 64 118 L76 178 C70 192 66 204 66 215 C68 228 82 233 100 233 C118 233 132 228 134 215 C134 204 130 192 124 178 L136 118 C138 110 142 104 146 96 C136 88 120 84 108 82 L108 66 Z",
  arm: "M138 90 C150 92 156 104 154 120 L152 150 C151 162 152 170 156 180 C158 196 158 214 150 236 C153 246 154 262 148 274 L141 282 C137 272 136 256 138 236 C136 220 136 200 140 182 C140 170 138 160 138 150 L136 118 C136 108 136 98 138 90 Z",
  leg: "M100 226 C112 222 128 216 134 214 C136 240 134 270 130 300 C132 320 130 350 128 380 L128 396 L134 404 L138 410 L106 410 L109 398 L112 380 C110 350 108 320 110 300 C106 270 103 250 100 226 Z",
};

const Figure = forwardRef<SVGSVGElement, { portraitUrl: string | null; installed: Map<AugmentationSlot, ItemInstanceDto> }>(function Figure({ portraitUrl, installed }, ref) {
  const glow = (slot: AugmentationSlot) => {
    const item = installed.get(slot);
    if (!item) return "rgba(25,227,255,0.35)";
    return accent(item.status === "installed" ? RARITY_COLOR[item.definition.rarity] : STATUS_COLOR[item.status] ?? "ok");
  };
  const body = `${HOLO.head} ${HOLO.torso} ${HOLO.arm} ${HOLO.leg}`;
  const mirror = "translate(200 0) scale(-1 1)";
  return (
    <div className="relative h-full min-h-[420px] w-full max-w-[280px]">
      {/* The portrait is only an ambient colour wash here (the real portrait lives on the identity card). */}
      {portraitUrl && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
          <img src={portraitUrl} alt="" className="h-full w-full scale-110 object-cover object-top" style={{ filter: "blur(18px) saturate(1.4)", opacity: 0.22 }} />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-0/40 via-transparent to-bg-0" />
        </div>
      )}
      <svg ref={ref} viewBox="0 0 200 440" className="relative h-full w-full" fill="none" stroke="var(--color-cyan)" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
        <defs>
          <linearGradient id="holoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(25,227,255,0.24)" />
            <stop offset="0.55" stopColor="rgba(25,227,255,0.10)" />
            <stop offset="1" stopColor="rgba(25,227,255,0.20)" />
          </linearGradient>
          <linearGradient id="holoBeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(25,227,255,0)" />
            <stop offset="1" stopColor="rgba(25,227,255,0.22)" />
          </linearGradient>
          <radialGradient id="holoFloor" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(25,227,255,0.55)" />
            <stop offset="0.6" stopColor="rgba(25,227,255,0.18)" />
            <stop offset="1" stopColor="rgba(25,227,255,0)" />
          </radialGradient>
          <pattern id="holoScan" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="0.8" fill="rgba(4,6,10,0.45)" />
          </pattern>
          <filter id="holoGlow" x="-30%" y="-10%" width="160%" height="120%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="holoHaze" x="-50%" y="-20%" width="200%" height="140%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <clipPath id="holoBody">
            <path d={body} />
            <path d={body} transform={mirror} />
          </clipPath>
        </defs>

        {/* Projection beam + floor disc */}
        <path d="M60 414 L82 150 L118 150 L140 414 Z" fill="url(#holoBeam)" stroke="none" opacity="0.6" />
        <ellipse cx="100" cy="416" rx="78" ry="16" fill="url(#holoFloor)" stroke="none" />
        <g opacity="0.9">
          <path d="M40 410 L56 400 L144 400 L160 410 L144 426 L56 426 Z" fill="rgba(4,6,10,0.7)" stroke="rgba(25,227,255,0.7)" strokeWidth="1.2" />
          <path d="M52 410 L62 404 L138 404 L148 410 L138 420 L62 420 Z" stroke="rgba(25,227,255,0.35)" strokeDasharray="3 3" />
          <ellipse className="holo-orbit" cx="100" cy="411" rx="30" ry="4" stroke="rgba(25,227,255,0.7)" strokeDasharray="10 5" />
          <ellipse cx="100" cy="411" rx="18" ry="2.5" stroke="rgba(25,227,255,0.35)" />
        </g>

        {/* Ambient haze behind the body */}
        <g className="holo-breathe" filter="url(#holoHaze)" stroke="none" fill="rgba(25,227,255,0.35)">
          <path d={body} />
          <path d={body} transform={mirror} />
        </g>

        {/* Body: translucent fill, scanlines, glowing outline */}
        <g stroke="none" fill="url(#holoFill)">
          <path d={body} />
          <path d={body} transform={mirror} />
        </g>
        <rect x="0" y="0" width="200" height="440" fill="url(#holoScan)" stroke="none" clipPath="url(#holoBody)" opacity="0.45" />
        <g filter="url(#holoGlow)" strokeWidth="1.3">
          <path d={body} />
          <path d={body} transform={mirror} />
        </g>

        {/* Inner circuitry */}
        <g clipPath="url(#holoBody)" opacity="0.75" strokeWidth="0.8">
          {/* head */}
          <path d="M100 18 V68" opacity="0.35" strokeDasharray="2 3" />
          <path d="M84 30 Q100 22 116 30 M82 60 Q100 66 118 60" opacity="0.5" />
          <rect x="82" y="38" width="36" height="7" rx="2" fill="rgba(25,227,255,0.35)" stroke="rgba(190,250,255,0.9)" />
          {/* neck + clavicles + sternum */}
          <path d="M96 70 V84 M104 70 V84" opacity="0.5" />
          <path d="M92 94 L60 100 M108 94 L140 100" />
          <path d="M100 96 V200" strokeDasharray="2 4" opacity="0.7" />
          {/* ribs */}
          <path d="M86 118 Q100 128 114 118 M84 132 Q100 144 116 132 M86 146 Q100 156 114 146" opacity="0.6" />
          {/* abdomen + pelvis */}
          <path d="M90 164 H110 M90 178 H110 M88 192 H112" opacity="0.45" />
          <path d="M72 196 L100 230 L128 196" opacity="0.7" />
          {/* limbs, mirrored */}
          {[undefined, mirror].map((t, i) => (
            <g key={i} transform={t}>
              <path d="M146 104 L146 176 M148 184 L146 236 M126 236 L124 300 L122 392" opacity="0.5" strokeDasharray="1 3" />
              <path d="M140 150 H150 M140 212 H154 M114 330 H128 M112 360 H128" opacity="0.5" />
              <circle cx="144" cy="98" r="4" />
              <circle cx="148" cy="180" r="3.5" />
              <circle cx="144" cy="238" r="3" />
              <circle cx="120" cy="300" r="4" />
              <circle cx="120" cy="396" r="3" />
            </g>
          ))}
          {/* data nodes along the spine */}
          {[108, 126, 144, 162, 180].map((y) => (
            <circle key={y} cx="100" cy={y} r="1.3" fill="rgba(190,250,255,0.9)" stroke="none" />
          ))}
        </g>
        {/* chest core */}
        <g filter="url(#holoGlow)">
          <circle cx="100" cy="122" r="7" stroke="rgba(190,250,255,0.9)" strokeWidth="1.2" />
          <circle cx="100" cy="122" r="3" fill="rgba(190,250,255,0.95)" stroke="none" />
        </g>

        {/* Slot anchors */}
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
