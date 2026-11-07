import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useMe } from "@/api/hooks";
import { Spinner, Toasts } from "@/components/ui";
import { AuthPage } from "@/pages/AuthPage";
import { CampaignHomePage } from "@/pages/CampaignHomePage";
import { CampaignsPage } from "@/pages/CampaignsPage";
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

function RequireAuth() {
  const me = useMe();
  const loc = useLocation();
  if (me.isLoading) return <Spinner label="Authenticating" />;
  if (!me.data) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <Outlet />;
}

export function App() {
  return (
    <div className="scanlines min-h-full">
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<CampaignsPage />} />
          <Route path="/c/:campaignId" element={<CampaignHomePage />} />
          <Route path="/c/:campaignId/hud/:characterId" element={<HudShell />}>
            <Route index element={<CharacterPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="cyberware" element={<CyberwarePage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="missions" element={<MissionsPage />} />
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
