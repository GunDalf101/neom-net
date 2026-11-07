import type { CampaignDto, UserDto } from "@neom/shared";
import clsx from "clsx";
import { Link, NavLink, Navigate, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useCampaign, useMe, usePending, useSession, useSessionControl } from "@/api/hooks";
import { Button, Icon, Spinner } from "@/components/ui";
import { PushToggle } from "@/components/PushToggle";
import { useCampaignRealtime } from "@/realtime/socket";

export interface DmContext {
  campaign: CampaignDto;
  me: UserDto;
  connected: boolean;
}
export const useDm = () => useOutletContext<DmContext>();

const NAV = [
  { to: "", label: "Dashboard", icon: "layout-dashboard", end: true },
  { to: "workshop", label: "Workshop", icon: "hammer" },
  { to: "rules", label: "Rules", icon: "git-fork" },
  { to: "encounters", label: "Encounters", icon: "swords" },
  { to: "npcs", label: "NPCs", icon: "users-round" },
  { to: "missions", label: "Missions & lore", icon: "target" },
  { to: "events", label: "Event log", icon: "scroll-text" },
  { to: "settings", label: "Settings", icon: "settings" },
];

export function DmShell() {
  const { campaignId = "" } = useParams();
  const me = useMe();
  const campaign = useCampaign(campaignId);
  const { connected } = useCampaignRealtime(campaignId, me.data?.id);
  const session = useSession(campaignId);
  const control = useSessionControl(campaignId);
  const pending = usePending(campaignId);

  if (me.isLoading || campaign.isLoading) return <Spinner label="Loading command center" />;
  if (!me.data || !campaign.data) return <div className="p-6 text-crimson">Campaign unavailable.</div>;
  if (campaign.data.role !== "DM") return <Navigate to={`/c/${campaignId}`} replace />;

  const base = `/c/${campaignId}/dm`;
  const live = Boolean(session.data);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-bg-1/80 p-3 md:flex">
        <Link to={`/c/${campaignId}`} className="font-display text-base font-black tracking-[0.18em] text-crimson">
          DM<span className="text-cyan">//</span>CONTROL
        </Link>
        <div className="mt-0.5 truncate text-[0.65rem] uppercase tracking-wider text-muted">{campaign.data.name}</div>
        <nav className="mt-4 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={`${base}/${n.to}`} end={n.end} className={({ isActive }) => clsx("hud-clip-sm flex items-center gap-2 px-2 py-1.5 font-display text-[0.62rem] uppercase tracking-[0.16em] transition", isActive ? "bg-crimson text-bg-0" : "text-muted hover:bg-bg-3 hover:text-text")}>
              <Icon name={n.icon} size={14} />
              {n.label}
              {n.to === "" && (pending.data?.length ?? 0) > 0 && <span className="ml-auto rounded-sm bg-amber px-1 text-[0.55rem] text-bg-0">{pending.data?.length}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <PushToggle />
          <div className={clsx("flex items-center gap-1 font-display text-[0.55rem] tracking-[0.2em]", connected ? "text-ok" : "text-amber")}>
            <span className={clsx("inline-block h-1.5 w-1.5 rounded-full", connected ? "bg-ok pulse-ok" : "bg-amber")} />
            {connected ? "UPLINK ACTIVE" : "LINK LOST"}
          </div>
          <Button className="w-full" variant={live ? "outline" : "solid"} color={live ? "crimson" : "ok"} icon={live ? "square" : "play"} disabled={control.isPending} onClick={() => control.mutate(live ? "end" : "start")}>
            {live ? "End session" : "Start session"}
          </Button>
          <Link to={`/c/${campaignId}`} className="hud-btn hud-btn-ghost w-full">
            <Icon name="chevron-left" size={12} /> Campaign
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 overflow-x-auto border-b border-line bg-bg-0/90 px-3 py-1.5 backdrop-blur md:hidden">
          <span className="font-display text-xs font-black tracking-widest text-crimson">DM//</span>
          {NAV.map((n) => (
            <NavLink key={n.to} to={`${base}/${n.to}`} end={n.end} className={({ isActive }) => clsx("hud-tab !px-2 !text-[0.55rem]", isActive && "active danger")}>
              <Icon name={n.icon} size={12} />
            </NavLink>
          ))}
          <Button size="xs" className="ml-auto" color={live ? "crimson" : "ok"} onClick={() => control.mutate(live ? "end" : "start")}>
            {live ? "End" : "Live"}
          </Button>
        </header>
        <main className="flex-1 p-3">
          <Outlet context={{ campaign: campaign.data, me: me.data, connected } satisfies DmContext} />
        </main>
      </div>
    </div>
  );
}
