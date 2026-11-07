import { ATTRIBUTES, ATTRIBUTE_META, SKILLS, SKILL_META, SPECIAL_SKILLS, SPECIAL_SKILL_META } from "@neom/shared";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ApiError, errorMessage } from "@/api/client";
import { useCampaigns, useCharacters, useImportCharacter, useMe, useSharedSheet } from "@/api/hooks";
import { Badge, Button, Field, Icon, Panel, Select, Spinner } from "@/components/ui";
import { Portrait } from "@/components/hud/Portrait";
import { StatBreakdown } from "@/components/StatBreakdown";
import { fmtMod } from "@/lib/format";
import { saveSheetFile } from "@/lib/sheetFile";

/**
 * `/s/:token` — a character sheet opened from its share link. Campaign members go straight to the
 * live HUD; anyone else signed in gets a read-only copy they can download or import into one of
 * their own characters.
 */
export function SharedSheetPage() {
  const { token = "" } = useParams();
  const shared = useSharedSheet(token);

  if (shared.isLoading) return <Spinner label="Opening shared sheet" />;
  if (!shared.data) {
    const gone = shared.error instanceof ApiError && [400, 404].includes(shared.error.status);
    return (
      <div className="mx-auto max-w-md p-6">
        <Panel title="Shared sheet" icon="link-2-off" color="crimson">
          <p className="text-sm text-text/90">{gone ? "This share link was revoked or does not exist. Ask the owner for a new one." : errorMessage(shared.error)}</p>
          <Link to="/" className="hud-btn mt-3">
            <Icon name="users" size={13} /> Campaigns
          </Link>
        </Panel>
      </div>
    );
  }
  const s = shared.data;
  if (s.isMember) return <Navigate to={`/c/${s.campaignId}/hud/${s.characterId}`} replace />;

  const c = s.sheet.character;
  const d = s.derived;
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 sm:p-4" data-testid="shared-sheet">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/" className="font-display text-xl font-black tracking-[0.08em] text-cyan glow-text">
          NEOM<span className="text-crimson">//</span>NET
        </Link>
        <Badge color="amber">Shared · read-only</Badge>
      </header>

      <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
        <div className="flex flex-wrap gap-3">
          <Portrait url={c.portraitUrl} name={c.name} size={140} className="border-cyan/40" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <h1 className="font-display text-[1.05rem] font-black uppercase tracking-[0.06em]">{c.name}</h1>
            <div className="text-text/90">{c.species || "—"}</div>
            <div className="text-cyan">
              {c.characterClass || "Unassigned"}
              {c.subclass && <span className="text-cyan/80"> // {c.subclass}</span>}
            </div>
            <div>
              Level <span className="num">{c.level}</span> · {c.faction || "No faction"}
            </div>
            <div className="text-xs text-muted">
              Shared by {s.ownerUsername} from “{s.campaignName}”
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Max HP" stat={d.maxHp} plain />
          <Stat label="Armor class" stat={d.ac} plain />
          <Stat label="Initiative" stat={d.initiative} />
          <Stat label="Speed" stat={d.speed} plain suffix=" m" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Attributes" icon="activity">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ATTRIBUTES.map((a) => (
              <div key={a} className="border border-line-2 bg-bg-0/50 p-2 text-center">
                <div className="text-[0.68rem] uppercase tracking-widest text-muted">{ATTRIBUTE_META[a].short}</div>
                <StatBreakdown stat={d.attributes[a]} label={ATTRIBUTE_META[a].name} format={String}>
                  <span className="num text-[1.1rem] text-text">{d.attributes[a].value}</span>
                </StatBreakdown>
                <div className="num text-xs text-cyan">{fmtMod(d.modifiers[a])}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[0.68rem] uppercase tracking-widest text-muted">Cyberpunk skills</div>
          <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {SPECIAL_SKILLS.map((k) => (
              <Row key={k} label={`${SPECIAL_SKILL_META[k].name} · rank ${d.specialSkills[k].rank}`} stat={d.specialSkills[k]} />
            ))}
          </div>
        </Panel>
        <Panel title="Skills" icon="list-checks">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {SKILLS.map((k) => (
              <Row key={k} label={`${SKILL_META[k].name}${d.skills[k].proficiency === 2 ? " ★★" : d.skills[k].proficiency === 1 ? " ★" : ""}`} stat={d.skills[k]} />
            ))}
          </div>
        </Panel>
        <Panel title="Gear" icon="package">
          {c.items.length === 0 ? (
            <div className="text-sm text-muted">No gear.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {c.items.map((i, idx) => (
                <li key={idx} className="flex items-center justify-between gap-2 border-b border-line/50 py-1">
                  <span className="min-w-0 truncate">
                    {i.customName || i.definitionName}
                    {i.quantity > 1 && <span className="num text-muted"> ×{i.quantity}</span>}
                  </span>
                  <span className="shrink-0 text-[0.68rem] uppercase tracking-wider text-muted">{i.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Biography" icon="book-open">
          <p className="whitespace-pre-wrap text-sm text-text/90">{c.biography || c.background || "—"}</p>
        </Panel>
      </div>

      <ImportPanel sheet={s.sheet} name={c.name} />
    </div>
  );
}

function Stat({ label, stat, plain, suffix = "" }: { label: string; stat: Parameters<typeof StatBreakdown>[0]["stat"]; plain?: boolean; suffix?: string }) {
  return (
    <div className="border border-cyan/25 bg-bg-0/50 px-2 py-1.5 text-center">
      <div className="text-[0.68rem] uppercase tracking-widest text-muted">{label}</div>
      <StatBreakdown stat={stat} label={label} format={plain ? (n) => `${n}${suffix}` : fmtMod}>
        <span className="num text-[1.1rem] text-text">{plain ? `${stat.value}${suffix}` : fmtMod(stat.value)}</span>
      </StatBreakdown>
    </div>
  );
}

function Row({ label, stat }: { label: string; stat: Parameters<typeof StatBreakdown>[0]["stat"] }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/40 py-0.5 text-sm">
      <span className="min-w-0 truncate">{label}</span>
      <StatBreakdown stat={stat} label={label}>
        <span className="num text-cyan">{fmtMod(stat.value)}</span>
      </StatBreakdown>
    </div>
  );
}

/** Download the sheet, or copy it into one of the viewer's own characters (same rules as file import). */
function ImportPanel({ sheet, name }: { sheet: Parameters<typeof saveSheetFile>[0]; name: string }) {
  const me = useMe();
  const campaigns = useCampaigns();
  const [campaignId, setCampaignId] = useState("");
  const characters = useCharacters(campaignId || undefined);
  const [characterId, setCharacterId] = useState("");
  const importSheet = useImportCharacter(characterId);
  const mine = (characters.data ?? []).filter((ch) => ch.ownerUserId === me.data?.id);

  return (
    <Panel title="Take a copy" icon="download">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
        <Button icon="download" onClick={() => saveSheetFile(sheet, name)}>
          Download sheet file
        </Button>
        <Field label="Campaign" className="min-w-0">
          <Select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setCharacterId(""); }} aria-label="Campaign">
            <option value="">— campaign —</option>
            {(campaigns.data ?? []).map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Into my character" className="min-w-0">
          <Select value={characterId} disabled={!campaignId} onChange={(e) => setCharacterId(e.target.value)} aria-label="Character">
            <option value="">— character —</option>
            {mine.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button icon="upload" color="amber" disabled={!characterId || importSheet.isPending} onClick={() => importSheet.mutate(sheet)}>
          {importSheet.isPending ? "Importing…" : "Import"}
        </Button>
      </div>
      <p className="mt-2 text-[0.65rem] text-muted">
        Import overwrites identity, attributes, skills, cyberpunk skills, saves, HP, speed and hit die on the chosen character (the same as importing a file). Gear and unlocks are campaign-specific and
        are not copied. DM-controlled campaigns only let the DM import.
      </p>
    </Panel>
  );
}
