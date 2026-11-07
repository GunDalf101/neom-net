import type { CharacterView } from "@neom/shared";
import { useState } from "react";
import { useAssignCharacter, useCampaign } from "@/api/hooks";
import { Button, Select } from "@/components/ui";

/** DM: hand a sheet to a player. Ownership moves and the player gets a socket toast plus a push notification. */
export function SendSheet({ view, compact }: { view: CharacterView; compact?: boolean }) {
  const campaign = useCampaign(view.character.campaignId);
  const assign = useAssignCharacter(view.character.id);
  const [userId, setUserId] = useState("");
  const members = (campaign.data?.members ?? []).filter((m) => m.userId !== view.character.ownerUserId);
  if (!view.permissions.isDm) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="send-sheet">
      {!compact && <span className="text-muted">Send sheet to</span>}
      <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="!w-40 !py-1 text-xs" aria-label="Recipient">
        <option value="">— player —</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.username}
            {m.role === "DM" ? " (DM)" : ""}
            {m.online ? " ●" : ""}
          </option>
        ))}
      </Select>
      <Button size="xs" color="amber" icon="send" disabled={!userId || assign.isPending} onClick={() => { assign.mutate(userId); setUserId(""); }}>
        {compact ? "Send" : "Send sheet"}
      </Button>
      {!compact && <span className="text-[0.62rem] text-dim">Currently owned by {view.ownerUsername}.</span>}
    </div>
  );
}
