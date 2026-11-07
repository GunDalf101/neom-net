import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, errorMessage } from "@/api/client";
import { useClaimInfo, useClaimSheet } from "@/api/hooks";
import { Badge, Button, Icon, Panel, Spinner } from "@/components/ui";
import { Portrait } from "@/components/hud/Portrait";

/** `/claim/:token` — a sheet the DM is handing over. One tap makes it yours and opens the HUD. */
export function ClaimSheetPage() {
  const { token = "" } = useParams();
  const info = useClaimInfo(token);
  const claim = useClaimSheet(token);
  const nav = useNavigate();

  if (info.isLoading) return <Spinner label="Opening hand-off link" />;
  if (!info.data) {
    const gone = info.error instanceof ApiError && [400, 404].includes(info.error.status);
    return (
      <div className="mx-auto max-w-md p-6">
        <Panel title="Hand-off link" icon="link-2-off" color="crimson">
          <p className="text-sm text-text/90">{gone ? "This link was already used, cancelled, or never existed. Ask the DM for a new one." : errorMessage(info.error)}</p>
          <Link to="/" className="hud-btn mt-3">
            <Icon name="users" size={13} /> Campaigns
          </Link>
        </Panel>
      </div>
    );
  }
  const i = info.data;
  const hud = `/c/${i.campaignId}/hud/${i.characterId}`;

  return (
    <div className="mx-auto max-w-md space-y-3 p-4" data-testid="claim-sheet">
      <Link to="/" className="font-display text-xl font-black tracking-[0.08em] text-cyan glow-text">
        NEOM<span className="text-crimson">//</span>NET
      </Link>
      <Panel title={`${i.offeredBy} is handing you a sheet`} icon="hand-metal" color="amber">
        <div className="flex gap-3">
          <Portrait url={i.portraitUrl} name={i.characterName} size={96} className="border-amber/40" />
          <div className="min-w-0 flex-1 space-y-0.5 text-sm">
            <div className="font-display text-[1rem] font-black uppercase tracking-[0.06em] text-text">{i.characterName}</div>
            <div className="text-cyan">{i.characterClass || "Unassigned"}</div>
            <div className="text-text/80">
              Level <span className="num">{i.level}</span> · {i.campaignName}
            </div>
            <div className="text-xs text-muted">Currently held by {i.currentOwner}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {i.alreadyYours ? (
            <>
              <Badge color="ok">Already yours</Badge>
              <Link to={hud} className="hud-btn hud-btn-solid">
                <Icon name="scan-face" size={13} /> Open the HUD
              </Link>
            </>
          ) : (
            <Button variant="solid" color="amber" icon="check" disabled={claim.isPending} onClick={() => claim.mutateAsync().then((r) => nav(`/c/${r.campaignId}/hud/${r.characterId}`, { replace: true }))}>
              {claim.isPending ? "Taking the sheet…" : "Take this sheet"}
            </Button>
          )}
          {!i.isMember && !i.alreadyYours && <span className="text-xs text-muted">You will also join “{i.campaignName}” as a player.</span>}
        </div>
        <p className="mt-3 text-[0.65rem] text-dim">This link works once. After you take the sheet it is yours to play: the DM keeps control of the campaign and can still edit it.</p>
      </Panel>
    </div>
  );
}
