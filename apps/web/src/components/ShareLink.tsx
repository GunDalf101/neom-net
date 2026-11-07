import type { CharacterView } from "@neom/shared";
import { useRevokeShareLink, useShareLink } from "@/api/hooks";
import { Button, ConfirmButton, Input } from "@/components/ui";
import { toast } from "@/store/ui";

export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

/**
 * Owner / DM: a read-only link to this sheet. Anyone who opens it signs in (once per device; the
 * session then persists) and lands on the sheet; campaign members land on the live HUD.
 */
export function ShareLink({ view }: { view: CharacterView }) {
  const create = useShareLink(view.character.id);
  const revoke = useRevokeShareLink(view.character.id);
  if (!view.permissions.canShare) return null;
  const url = view.shareToken ? shareUrl(view.shareToken) : null;

  const copy = async (link: string) => {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${view.character.name} · NEOM//NET`, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast("success", "Link copied", link);
    } catch (e) {
      // AbortError = the user closed the share sheet; anything else, leave the link visible to copy by hand.
      if (!(e instanceof DOMException && e.name === "AbortError")) toast("info", "Copy the link from the field");
    }
  };

  const make = async () => {
    const v = await create.mutateAsync({});
    if (v.shareToken) void copy(shareUrl(v.shareToken));
  };

  return (
    <div className="space-y-1.5 text-xs" data-testid="share-link">
      {url ? (
        <>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" className="!text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="share-2" onClick={() => void copy(url)}>
              Copy / share
            </Button>
            <Button size="sm" icon="refresh-cw" variant="ghost" disabled={create.isPending} onClick={() => create.mutate({ rotate: true })}>
              New link
            </Button>
            <ConfirmButton size="sm" icon="link-2-off" label="Revoke" confirmLabel="Revoke link?" disabled={revoke.isPending} onConfirm={() => revoke.mutate()} />
          </div>
        </>
      ) : (
        <Button size="sm" icon="link" disabled={create.isPending} onClick={() => void make()}>
          {create.isPending ? "Creating…" : "Create share link"}
        </Button>
      )}
      <p className="text-[0.65rem] text-muted">
        Anyone with the link can view this sheet after signing in and import a copy; players in this campaign open the live HUD. On a device with the app installed, the link opens in the app. “New
        link” or “Revoke” cuts off the old one.
      </p>
    </div>
  );
}
