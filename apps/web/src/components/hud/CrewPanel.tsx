import { CREW_HEALTH_META, type CharacterListEntryDto } from "@neom/shared";
import { Link } from "react-router-dom";
import { useCharacters } from "@/api/hooks";
import { Badge, Icon, Panel } from "@/components/ui";
import { Portrait } from "./Portrait";

/**
 * The rest of the crew, as much as a player may know: who they are, who plays them, how they are holding up.
 * Full sheets are private to their owner and the DM; the server only sends a glimpse for anyone else.
 */
export function CrewPanel({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const chars = useCharacters(campaignId);
  const others = (chars.data ?? []).filter((c) => c.id !== characterId);
  return (
    <div data-testid="crew-panel">
      <Panel title="Crew" icon="users" color="muted">
        {others.length === 0 && <div className="text-xs text-dim">No other runners in this campaign yet.</div>}
        <ul className="space-y-1.5">
          {others.map((c) => (
            <CrewRow key={c.id} c={c} campaignId={campaignId} />
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-1 text-[0.6rem] text-dim">
          <Icon name="lock" size={10} /> Full sheets are private to their owner and the DM.
        </p>
      </Panel>
    </div>
  );
}

function CrewRow({ c, campaignId }: { c: CharacterListEntryDto; campaignId: string }) {
  const health = CREW_HEALTH_META[c.health];
  const body = (
    <>
      <Portrait url={c.portraitUrl} name={c.name} size={36} />
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-text">{c.name}</span>
          <span className="num shrink-0 text-dim">LV {c.level}</span>
        </div>
        <div className="truncate text-[0.65rem] text-muted">
          {c.species}
          {c.characterClass ? ` · ${c.characterClass}` : ""} · <span className={c.online ? "text-ok" : ""}>●</span> {c.ownerUsername}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge color={health.color} title="Coarse health, as the crew sees it">
            {health.label}
          </Badge>
          {c.visibility === "full" && (
            <span className="num text-[0.65rem] text-crimson">
              {c.hpCurrent}/{c.hpMax}
            </span>
          )}
          {c.conditions.map((k) => (
            <Badge key={k} color="crimson">
              {k}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
  // A full entry means we may open it (our own second sheet, or the DM looking at the HUD).
  return (
    <li data-testid="crew-row">
      {c.visibility === "full" ? (
        <Link to={`/c/${campaignId}/hud/${c.id}`} className="hud-panel flex items-center gap-2 p-2 transition hover:brightness-125" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
          {body}
        </Link>
      ) : (
        <div className="hud-panel flex items-center gap-2 p-2" style={{ ["--panel-accent" as string]: "var(--color-line-2)" }}>
          {body}
        </div>
      )}
    </li>
  );
}
