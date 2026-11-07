import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCampaigns, useCreateCampaign, useJoinCampaign, useLogout, useMe } from "@/api/hooks";
import { Badge, Button, Empty, Field, Icon, Input, Panel, Spinner, Textarea } from "@/components/ui";
import { disconnectSocket } from "@/realtime/socket";

export function CampaignsPage() {
  const me = useMe();
  const campaigns = useCampaigns();
  const create = useCreateCampaign();
  const join = useJoinCampaign();
  const logout = useLogout();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const c = await create.mutateAsync({ name, description });
    nav(`/c/${c.id}`);
  };
  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    const c = await join.mutateAsync(code);
    nav(`/c/${c.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-black tracking-[0.2em] text-cyan glow-text">
            NEOM<span className="text-crimson">//</span>NET
          </div>
          <div className="font-display text-[0.6rem] uppercase tracking-[0.3em] text-muted">Operator: {me.data?.username}</div>
        </div>
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
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Campaigns" icon="network">
          {campaigns.isLoading && <Spinner />}
          {campaigns.data?.length === 0 && <Empty>No campaigns yet. Create one or join with an invite code.</Empty>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {campaigns.data?.map((c) => (
              <Link key={c.id} to={`/c/${c.id}`} className="hud-panel group block p-3 transition hover:border-cyan" style={{ ["--panel-accent" as string]: c.role === "DM" ? "var(--color-crimson)" : "var(--color-cyan)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-sm font-bold tracking-wider text-text group-hover:text-cyan">{c.name}</div>
                  <Badge color={c.role === "DM" ? "crimson" : "cyan"}>{c.role}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description || "No description"}</p>
                <div className="mt-3 flex items-center gap-3 text-[0.65rem] uppercase tracking-wider text-dim">
                  <span className="flex items-center gap-1">
                    <Icon name="users" size={12} /> {c.memberCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="user-round" size={12} /> {c.characterCount}
                  </span>
                  {c.liveSessionId && (
                    <span className="flex items-center gap-1 text-ok">
                      <span className="pulse-ok inline-block h-1.5 w-1.5 rounded-full bg-ok" /> LIVE
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Join campaign" icon="key-round">
            <form onSubmit={onJoin} className="space-y-2">
              <Field label="Invite code">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. NIGHTCITY" required />
              </Field>
              <Button type="submit" className="w-full" disabled={join.isPending} icon="link">
                Connect
              </Button>
            </form>
          </Panel>
          <Panel title="New campaign" icon="plus" color="crimson">
            <form onSubmit={onCreate} className="space-y-2">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label="Description">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Button type="submit" color="crimson" className="w-full" disabled={create.isPending} icon="crown">
                Initialise as DM
              </Button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
