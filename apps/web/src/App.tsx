import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useMe } from "@/api/hooks";
import { Spinner, Toasts } from "@/components/ui";
import { OpenInAppBanner } from "@/components/OpenInApp";
import { rememberReturnTo } from "@/lib/returnTo";
import { AuthPage } from "@/pages/AuthPage";
import { CampaignHomePage } from "@/pages/CampaignHomePage";
import { CampaignsPage } from "@/pages/CampaignsPage";
import { SharedSheetPage } from "@/pages/SharedSheetPage";
import { ClaimSheetPage } from "@/pages/ClaimSheetPage";
import { DmShell } from "@/pages/dm/DmShell";
import { DashboardPage } from "@/pages/dm/DashboardPage";
import { WorkshopPage } from "@/pages/dm/WorkshopPage";
import { RulesPage } from "@/pages/dm/RulesPage";
import { EncountersPage } from "@/pages/dm/EncountersPage";
import { NpcsPage } from "@/pages/dm/NpcsPage";
import { DmMissionsPage } from "@/pages/dm/DmMissionsPage";
import { EventsPage } from "@/pages/dm/EventsPage";
import { SettingsPage } from "@/pages/dm/SettingsPage";
import { HudShell } from "@/pages/hud/HudShell";
import { CharacterPage } from "@/pages/hud/CharacterPage";
import { InventoryPage } from "@/pages/hud/InventoryPage";
import { CyberwarePage } from "@/pages/hud/CyberwarePage";
import { SkillsPage } from "@/pages/hud/SkillsPage";
import { JournalPage } from "@/pages/hud/JournalPage";
import { MissionsPage } from "@/pages/hud/MissionsPage";
import { LogPage } from "@/pages/hud/LogPage";
import { ReputationPage } from "@/pages/hud/ReputationPage";

function RequireAuth() {
  const me = useMe();
  const loc = useLocation();
  if (me.isLoading) return <Spinner label="Authenticating" />;
  if (!me.data) {
    // Keep the whole target (a shared sheet link, a notification deep link) for after sign-in.
    const from = loc.pathname + loc.search + loc.hash;
    rememberReturnTo(from);
    return <Navigate to="/login" state={{ from }} replace />;
  }
  return <Outlet />;
}

export function App() {
  return (
    <div className="scanlines min-h-full">
      <OpenInAppBanner />
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<CampaignsPage />} />
          <Route path="/s/:token" element={<SharedSheetPage />} />
          <Route path="/claim/:token" element={<ClaimSheetPage />} />
          <Route path="/c/:campaignId" element={<CampaignHomePage />} />
          <Route path="/c/:campaignId/hud/:characterId" element={<HudShell />}>
            <Route index element={<CharacterPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="cyberware" element={<CyberwarePage />} />
            <Route path="reputation" element={<ReputationPage />} />
            {/* Progression trees stay reachable (gear menu) but left the main nav in favour of Reputation. */}
            <Route path="skills" element={<SkillsPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="missions" element={<MissionsPage />} />
            <Route path="log" element={<LogPage />} />
          </Route>
          <Route path="/c/:campaignId/dm" element={<DmShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="workshop" element={<WorkshopPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="rules/:ruleId" element={<RulesPage />} />
            <Route path="encounters" element={<EncountersPage />} />
            <Route path="npcs" element={<NpcsPage />} />
            <Route path="missions" element={<DmMissionsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </div>
  );
}
