import type { CharacterView } from "@neom/shared";
import { useClaimLink, useRevokeClaimLink } from "@/api/hooks";
import { Button, ConfirmButton, Input } from "@/components/ui";
import { toast } from "@/store/ui";

export const claimUrl = (token: string) => `${window.location.origin}/claim/${token}`;

async function copyLink(link: string, title: string) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    toast("success", "Hand-off link copied", link);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError")) toast("info", "Copy the link from the field");
  }
}

/**
 * DM only: a single-use link that gives the sheet to whoever opens it. The player signs in (or registers),
 * is added to the campaign if needed, becomes the owner, and the link dies.
 */
export function HandOffLink({ view, compact }: { view: CharacterView; compact?: boolean }) {
  const create = useClaimLink(view.character.id);
  const revoke = useRevokeClaimLink(view.character.id);
  if (!view.permissions.isDm) return null;
  const url = view.claimToken ? claimUrl(view.claimToken) : null;
  const title = `${view.character.name} · NEOM//NET`;

  const make = async (rotate = false) => {
    const v = await create.mutateAsync({ rotate });
    if (v.claimToken) void copyLink(claimUrl(v.claimToken), title);
  };

  if (compact) {
    return (
      <Button size="xs" color="amber" icon="link" disabled={create.isPending} title={url ? "Copy the hand-off link again" : "Create a one-time link that gives this sheet to whoever opens it"} onClick={() => (url ? void copyLink(url, title) : void make())}>
        {create.isPending ? "…" : url ? "Copy link" : "Hand-off link"}
      </Button>
    );
  }

  return (
    <div className="space-y-1.5 text-xs" data-testid="handoff-link">
      {url ? (
        <>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Hand-off link" className="!text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" color="amber" icon="share-2" onClick={() => void copyLink(url, title)}>
              Copy / send to player
            </Button>
            <Button size="sm" variant="ghost" icon="refresh-cw" disabled={create.isPending} onClick={() => void make(true)}>
              New link
            </Button>
            <ConfirmButton size="sm" icon="link-2-off" label="Cancel hand-off" confirmLabel="Cancel it?" disabled={revoke.isPending} onConfirm={() => revoke.mutate()} />
          </div>
        </>
      ) : (
        <Button size="sm" color="amber" icon="link" disabled={create.isPending} onClick={() => void make()}>
          {create.isPending ? "Creating…" : "Create hand-off link"}
        </Button>
      )}
      <p className="text-[0.65rem] text-muted">
        One-time link. The first player who opens it and signs in (or registers) joins the campaign if needed and becomes the owner of this sheet; the link then stops working. You are notified in
        the log. Use the share link above for a read-only copy instead.
      </p>
    </div>
  );
}
