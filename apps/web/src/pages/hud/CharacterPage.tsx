import clsx from "clsx";
import { CombatPanel } from "@/components/hud/CombatPanel";
import { CyberwareDisplay } from "@/components/hud/CyberwareDisplay";
import { DicePanel, RollHistory } from "@/components/hud/DicePanel";
import { IdentityCard } from "@/components/hud/IdentityCard";
import { SheetPanel } from "@/components/hud/SheetPanel";
import { SkillCheckBar } from "@/components/hud/SkillCheckBar";
import { useUi } from "@/store/ui";
import { useHud } from "./HudShell";

/**
 * Desktop: the page never scrolls; each column scrolls on its own inside the viewport
 * (the shell gives <main> the remaining height). Mobile: one column at a time, normal page scroll.
 */
export function CharacterPage() {
  const { view, isDm, campaign } = useHud();
  const tab = useUi((s) => s.mobileTab);
  const setTab = useUi((s) => s.setMobileTab);
  const col = "min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:pr-1 [scrollbar-gutter:stable]";

  return (
    <div className="mx-auto flex h-full max-w-[1900px] flex-col">
      <div className="seg mb-2 shrink-0 lg:hidden">
        {(["sheet", "core", "combat"] as const).map((t) => (
          <button key={t} className={clsx(tab === t && "active")} onClick={() => setTab(t)}>
            {t === "sheet" ? "Sheet" : t === "core" ? "Cyberware" : "Combat"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(330px,0.95fr)_minmax(560px,1.45fr)_minmax(330px,0.95fr)]">
        <div className={clsx("space-y-2", col, tab !== "sheet" && "hidden lg:block")}>
          <IdentityCard view={view} />
          <SheetPanel view={view} />
          <SkillCheckBar view={view} />
        </div>
        {/* The body figure needs ~520px; on phones it pans sideways instead of breaking the page. */}
        {/* Desktop: the cyberware column scrolls on its own like the side columns, so the page never grows past the viewport. */}
        <div className={clsx("min-h-[640px] min-w-0 overflow-x-auto lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:pr-1 [scrollbar-gutter:stable]", tab !== "core" && "hidden lg:block")}>
          <CyberwareDisplay view={view} />
        </div>
        <div className={clsx("space-y-2 @container", col, tab !== "combat" && "hidden lg:block")}>
          <CombatPanel view={view} />
          <DicePanel view={view} isDm={isDm} />
          <RollHistory campaignId={campaign.id} />
        </div>
      </div>
    </div>
  );
}
