import type { CampaignDto, CharacterView, UserDto } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useCampaign, useCharacter, useCharacters, useImportCharacter, useLogout, useMe, useResetCharacter, useRoll, useRollRequests } from "@/api/hooks";
import { Button, ConfirmButton, Drawer, Icon, Modal, Spinner } from "@/components/ui";
import { PushToggle } from "@/components/PushToggle";
import { SendSheet } from "@/components/SendSheet";
import { ShareLink } from "@/components/ShareLink";
import { HandOffLink } from "@/components/HandOffLink";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatPanel } from "@/components/ChatPanel";
import { downloadSheet, readSheetFile } from "@/lib/sheetFile";
import { disconnectSocket, useCampaignRealtime } from "@/realtime/socket";
import { toast, useUi } from "@/store/ui";

export interface HudContext {
  view: CharacterView;
  campaign: CampaignDto;
  me: UserDto;
  isDm: boolean;
  connected: boolean;
}

export const useHud = () => useOutletContext<HudContext>();

const TABS = [
  { to: "", label: "Character", icon: "scan-face", end: true },
  { to: "inventory", label: "Inventory", icon: "package" },
  { to: "cyberware", label: "Cyberware", icon: "cpu" },
  { to: "skills", label: "Skills", icon: "git-branch" },
  { to: "journal", label: "Journal", icon: "book-open" },
  { to: "missions", label: "Missions", icon: "target" },
  { to: "log", label: "Log", icon: "scroll-text" },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `2077.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
}

export function HudShell() {
  const { campaignId = "", characterId = "" } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const campaign = useCampaign(campaignId);
  const view = useCharacter(characterId);
  const characters = useCharacters(campaignId);
  const logout = useLogout();
  const { connected } = useCampaignRealtime(campaignId, me.data?.id);
  const remember = useUi((s) => s.rememberCharacter);
  const clock = useClock();
  const requests = useRollRequests(campaignId);
  const roll = useRoll(campaignId);
  const [menu, setMenu] = useState(false);
  const [chat, setChat] = useState(false);
  const importSheet = useImportCharacter(characterId);
  const resetSheet = useResetCharacter(characterId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (characterId) remember(campaignId, characterId);
  }, [campaignId, characterId, remember]);

  const onExport = async () => {
    if (!view.data) return;
    setExporting(true);
    try {
      await downloadSheet(characterId, view.data.character.name);
      toast("success", "Sheet exported");
    } catch (e) {
      toast("error", "Export failed", e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const sheet = await readSheetFile(file);
      await importSheet.mutateAsync(sheet);
      setMenu(false);
    } catch (e) {
      // Server-side failures already toast through the mutation; this covers unreadable files.
      if (!(e instanceof Error) || !("status" in e)) toast("error", "Import failed", e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (me.isLoading || campaign.isLoading || view.isLoading) return <Spinner label="Loading HUD" />;
  if (!me.data || !campaign.data) return <div className="p-6 text-crimson">Campaign unavailable.</div>;
  if (!view.data) return <div className="p-6 text-crimson">Character unavailable: {view.error instanceof Error ? view.error.message : ""}</div>;

  const isDm = campaign.data.role === "DM";
  const ctx: HudContext = { view: view.data, campaign: campaign.data, me: me.data, isDm, connected };
  const myRequests = (requests.data ?? []).filter((r) => r.characterId === characterId);
  const base = `/c/${campaignId}/hud/${characterId}`;

  return (
    <div className="flex min-h-full flex-col lg:h-screen lg:overflow-hidden">
      <header className="sticky top-0 z-40 shrink-0 border-b border-cyan/20 bg-bg-0/92 backdrop-blur lg:static">
        <div className="flex items-center gap-3 px-3 py-1.5">
          <Link to={`/c/${campaignId}`} className="flex items-baseline gap-1 font-display text-xl font-black tracking-[0.08em] text-cyan glow-text">
            NEOM<span className="text-crimson">//</span>NET <span className="ml-1 hidden text-[0.55rem] font-normal tracking-widest text-muted sm:inline">v0.1.0</span>
          </Link>
          <nav className="mx-auto hidden items-center gap-1.5 lg:flex">
            {TABS.map((t) => (
              <NavLink key={t.to} to={`${base}/${t.to}`} end={t.end} className={({ isActive }) => clsx("nav-box", isActive && "active")}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="nav-box num hidden !px-3 !py-1.5 !text-[0.68rem] !tracking-normal text-text/80 lg:inline">
              {clock.date} <span className="ml-2">{clock.time}</span>
            </span>
            <span className={clsx("nav-box flex items-center gap-1.5 !px-3 !py-1.5 !text-[0.62rem]", connected ? "text-ok" : "text-amber")} style={{ borderColor: connected ? "rgba(53,227,154,0.5)" : "rgba(255,176,32,0.5)" }}>
              <span className={clsx("inline-block h-2 w-2 rounded-full", connected ? "bg-ok pulse-ok" : "bg-amber")} />
              <span className="hidden sm:inline">{connected ? "CONNECTED" : "LINK LOST"}</span>
            </span>
            <NotificationBell campaignId={campaignId} userId={me.data.id} onOpenChat={() => setChat(true)} />
            <button type="button" onClick={() => setChat(true)} className="nav-box hidden !px-2 !py-1.5 sm:inline-flex" aria-label="Chat with the DM">
              <Icon name="message-square" size={14} />
            </button>
            <button type="button" onClick={() => setMenu(true)} className="nav-box !px-2 !py-1.5" aria-label="Menu">
              <Icon name="settings" size={14} />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-2 pb-1.5 lg:hidden">
          {TABS.map((t) => (
            <NavLink key={t.to} to={`${base}/${t.to}`} end={t.end} className={({ isActive }) => clsx("nav-box !px-2.5 !py-1 !text-[0.58rem]", isActive && "active")}>
              <Icon name={t.icon} size={12} />
            </NavLink>
          ))}
        </nav>
        {view.data.permissions.readOnly && (
          <div className="flex items-center gap-2 border-t border-cyan/20 bg-cyan/5 px-3 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-cyan/80">
            <Icon name="lock" size={12} /> Read-only sheet — the Dungeon Master applies all changes. You can still roll dice{view.data.permissions.canManageInventory ? ", manage your gear" : ""} and keep notes.
          </div>
        )}
        {myRequests.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-amber/40 bg-amber/10 px-3 py-1.5 text-xs">
            <Icon name="bell-ring" size={14} className="text-amber" />
            <span className="text-amber">DM requests a roll:</span>
            {myRequests.map((r) => (
              <Button
                key={r.id}
                size="xs"
                color="amber"
                disabled={roll.isPending}
                onClick={() =>
                  roll.mutate({
                    characterId,
                    target: r.target ?? undefined,
                    expression: r.expression ?? undefined,
                    category: r.target?.startsWith("save") ? "save" : r.target ? "skill" : "custom",
                    label: r.label,
                    visibility: r.visibility,
                    rollRequestId: r.id,
                  })
                }
              >
                {r.label}
                {r.dc ? ` (DC ${r.dc})` : ""}
              </Button>
            ))}
          </div>
        )}
      </header>
      <main className="flex-1 p-3 lg:min-h-0 lg:overflow-y-auto">
        <Outlet context={ctx} />
      </main>

      <Drawer open={chat} onClose={() => setChat(false)} title="Comms" color="amber" fill>
        <ChatPanel campaign={campaign.data} meId={me.data.id} />
      </Drawer>

      <Modal open={menu} onClose={() => setMenu(false)} title="System" width="max-w-sm">
        <div className="space-y-3 text-sm">
          <div className="text-muted">
            Operator <span className="text-text">{me.data.username}</span> · {campaign.data.name}
          </div>
          {characters.data && characters.data.length > 1 && (
            <div>
              <div className="hud-title mb-1 text-[0.6rem]">Switch character</div>
              <div className="flex flex-wrap gap-1">
                {characters.data.map((c) => (
                  <button key={c.id} className={clsx("nav-box !px-3 !py-1 !text-[0.6rem]", c.id === characterId && "active")} onClick={() => { setMenu(false); nav(`/c/${campaignId}/hud/${c.id}`); }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="hud-title mb-1 text-[0.6rem]">Notifications</div>
            <PushToggle />
            <p className="mt-1 text-[0.65rem] text-muted">Damage, conditions, items, DM roll requests and sheets sent to you arrive as push notifications when this device is away from the table. Install the app (browser menu → Add to Home Screen / Install) for the full experience.</p>
          </div>
          {isDm && (
            <div>
              <div className="hud-title mb-1 text-[0.6rem]">Hand this sheet to a player</div>
              <SendSheet view={view.data} />
              <div className="mt-2 text-[0.6rem] uppercase tracking-[0.16em] text-muted">or by link</div>
              <HandOffLink view={view.data} />
            </div>
          )}
          {view.data.permissions.canShare && (
            <div>
              <div className="hud-title mb-1 text-[0.6rem]">Share link</div>
              <ShareLink view={view.data} />
            </div>
          )}
          <div>
            <div className="hud-title mb-1 text-[0.6rem]">Sheet data</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="download" disabled={exporting} onClick={onExport}>
                {exporting ? "Exporting…" : "Export sheet"}
              </Button>
              {view.data.permissions.canEdit && (
                <>
                  <Button size="sm" icon="upload" color="amber" disabled={importSheet.isPending} onClick={() => fileInput.current?.click()}>
                    {importSheet.isPending ? "Importing…" : "Import sheet"}
                  </Button>
                  <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onImportFile(e.target.files?.[0])} />
                  <ConfirmButton size="sm" icon="rotate-ccw" label="Reset to level 1" confirmLabel="Wipe gear, unlocks, level?" disabled={resetSheet.isPending} onConfirm={() => resetSheet.mutate()} />
                </>
              )}
            </div>
            <p className="mt-1 text-[0.65rem] text-muted">
              Export writes a JSON file with the full sheet plus a list of items, conditions and unlocks. Import restores identity, attributes, skills, cyberpunk skills, saves, HP, speed and hit die
              {view.data.permissions.isDm ? ", and as DM also level, XP, kamas and progression points" : ""}; gear and unlocks stay as they are.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/c/${campaignId}`} className="hud-btn hud-btn-ghost" onClick={() => setMenu(false)}>
              <Icon name="users" size={13} /> Campaign
            </Link>
            {isDm && (
              <Link to={`/c/${campaignId}/dm`} className="hud-btn" style={{ ["--btn-color" as string]: "var(--color-crimson)" }} onClick={() => setMenu(false)}>
                <Icon name="crown" size={13} /> DM//CONTROL
              </Link>
            )}
            <Button
              variant="ghost"
              icon="log-out"
              onClick={async () => {
                await logout.mutateAsync();
                disconnectSocket();
                nav("/login");
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
