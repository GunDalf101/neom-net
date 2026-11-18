import { ENCYCLOPEDIA_KINDS, ENCYCLOPEDIA_KIND_META, type EncyclopediaEntryDto, type EncyclopediaEntryInput, type EncyclopediaKind } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useDeleteEncyclopediaEntry, useEncyclopedia, useItemDefinitions, useNpcs, useSaveEncyclopediaEntry } from "@/api/hooks";
import { Portrait, PortraitPicker } from "@/components/hud/Portrait";
import { Badge, Button, ConfirmButton, Empty, Field, Icon, Input, Modal, Select, Spinner, Textarea, Toggle } from "@/components/ui";
import { useHud } from "./HudShell";

/** HUD tab: what the crew knows about the world. The DM writes; players read what is published. */
export function EncyclopediaPage() {
  const { campaign, isDm } = useHud();
  return <EncyclopediaBoard campaignId={campaign.id} isDm={isDm} />;
}

const empty = (kind: EncyclopediaKind): EncyclopediaEntryInput => ({ kind, name: "", body: "", imageUrl: null, refId: null, visibleToPlayers: true });

export function EncyclopediaBoard({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const entries = useEncyclopedia(campaignId);
  const del = useDeleteEncyclopediaEntry(campaignId);
  const npcs = useNpcs(campaignId);
  const items = useItemDefinitions(campaignId);
  const [kind, setKind] = useState<EncyclopediaKind>("npc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EncyclopediaEntryDto | "new" | null>(null);
  const [filter, setFilter] = useState("");
  const all = entries.data ?? [];
  const meta = ENCYCLOPEDIA_KIND_META[kind];
  const list = all.filter((e) => e.kind === kind && (!filter || e.name.toLowerCase().includes(filter.toLowerCase()) || e.body.toLowerCase().includes(filter.toLowerCase())));

  /** Linked NPC or item: portrait / icon and a fallback description. */
  const linked = (e: EncyclopediaEntryDto) => {
    if (!e.refId) return null;
    const npc = npcs.data?.find((n) => n.id === e.refId);
    if (npc) return { image: npc.portraitUrl, icon: null as string | null, blurb: npc.description, tag: npc.faction || null };
    const item = items.data?.find((d) => d.id === e.refId);
    if (item) return { image: item.imageUrl, icon: item.icon, blurb: item.description, tag: item.category };
    return null;
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-3" data-testid="encyclopedia">
      <div className="flex flex-wrap items-center gap-1" data-testid="encyclopedia-tabs">
        {ENCYCLOPEDIA_KINDS.map((k) => {
          const km = ENCYCLOPEDIA_KIND_META[k];
          const count = all.filter((x) => x.kind === k).length;
          return (
            <button key={k} type="button" className={clsx("hud-tab flex items-center gap-2", kind === k && "active")} style={kind === k ? { background: `var(--color-${km.color})`, boxShadow: `0 0 12px var(--color-${km.color})` } : { color: `var(--color-${km.color})` }} onClick={() => setKind(k)}>
              <Icon name={km.icon} size={12} /> {km.label}
              <span className="num text-[0.55rem] opacity-70">{count}</span>
            </button>
          );
        })}
        <Input placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-auto !w-40 !py-1 text-xs" aria-label="Search the encyclopedia" />
        {isDm && (
          <Button size="xs" icon="plus" color={meta.color} onClick={() => setEditing("new")}>
            New {meta.singular}
          </Button>
        )}
      </div>

      {entries.isLoading && <Spinner />}
      {!entries.isLoading && list.length === 0 && (
        <Empty icon={meta.icon}>{all.length === 0 ? (isDm ? "Nothing written yet. Add the first NPC, location or item." : "The DM has not published anything yet.") : `No ${meta.label.toLowerCase()} match.`}</Empty>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((e) => {
          const open = openId === e.id;
          const link = linked(e);
          const image = e.imageUrl ?? link?.image ?? null;
          const color = `var(--color-${meta.color})`;
          return (
            <article key={e.id} className={clsx("hud-panel min-w-0", open && "lit")} style={{ ["--panel-accent" as string]: color }} data-testid="encyclopedia-entry" data-open={open}>
              <button type="button" className="flex w-full items-center gap-3 p-2.5 text-left" onClick={() => setOpenId(open ? null : e.id)} aria-expanded={open}>
                {image || e.kind === "npc" ? (
                  <Portrait url={image} name={e.name} size={40} />
                ) : (
                  <span className="tile" style={{ ["--tile-color" as string]: color, width: 40, height: 40 }}>
                    <Icon name={link?.icon ?? meta.icon} size={20} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[0.9rem] font-bold uppercase tracking-[0.05em] text-text">{e.name}</span>
                  {!open && <span className="block truncate text-[0.7rem] text-muted">{e.body || link?.blurb || meta.singular}</span>}
                </span>
                {!e.visibleToPlayers && <Badge color="muted">hidden</Badge>}
                {link?.tag && <Badge color={meta.color}>{link.tag}</Badge>}
                <Icon name={open ? "chevron-up" : "chevron-down"} size={14} className="text-muted" />
              </button>
              {open && (
                <div className="space-y-2 border-t border-line/60 p-3 text-sm" data-testid="encyclopedia-details">
                  {image && <img src={image} alt="" className="max-h-56 w-full object-cover" style={{ clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))" }} />}
                  <p className="whitespace-pre-wrap text-muted">{e.body || link?.blurb || "No entry text yet."}</p>
                  {isDm && (
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="ghost" icon="pencil" onClick={() => setEditing(e)}>
                        Edit
                      </Button>
                      <ConfirmButton size="xs" label="Delete" confirmLabel="Delete?" onConfirm={() => del.mutate(e.id)} />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {isDm && <EntryEditor campaignId={campaignId} open={Boolean(editing)} entry={editing === "new" ? null : editing} defaultKind={kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EntryEditor({ campaignId, open, entry, defaultKind, onClose }: { campaignId: string; open: boolean; entry: EncyclopediaEntryDto | null; defaultKind: EncyclopediaKind; onClose: () => void }) {
  const save = useSaveEncyclopediaEntry(campaignId);
  const npcs = useNpcs(campaignId);
  const items = useItemDefinitions(campaignId);
  const [form, setForm] = useState<EncyclopediaEntryInput>(empty(defaultKind));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = entry?.id ?? `new:${defaultKind}`;
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    setForm(entry ? { kind: entry.kind, name: entry.name, body: entry.body, imageUrl: entry.imageUrl, refId: entry.refId, visibleToPlayers: entry.visibleToPlayers } : empty(defaultKind));
  }
  if (!open) return null;
  const meta = ENCYCLOPEDIA_KIND_META[form.kind];
  const linkOptions = form.kind === "npc" ? (npcs.data ?? []).map((n) => ({ id: n.id, label: n.name })) : form.kind === "item" ? (items.data ?? []).map((d) => ({ id: d.id, label: d.name })) : [];
  /** Picking an NPC or item pre-fills the name and text so the entry can be published in one click. */
  const link = (refId: string) => {
    const n = npcs.data?.find((x) => x.id === refId);
    const d = items.data?.find((x) => x.id === refId);
    const src = n ?? d;
    setForm({ ...form, refId: refId || null, name: form.name || src?.name || "", body: form.body || src?.description || "" });
  };
  return (
    <Modal open={open} onClose={onClose} title={entry ? `Edit ${meta.singular}` : `New ${meta.singular}`} color={meta.color}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await save.mutateAsync({ id: entry?.id, body: form });
          onClose();
        }}
      >
        <div className="flex flex-wrap items-start gap-3">
          <PortraitPicker url={form.imageUrl ?? null} name={form.name || meta.singular} size={88} onChange={(url) => setForm({ ...form, imageUrl: url })} />
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EncyclopediaKind, refId: null })}>
                {ENCYCLOPEDIA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ENCYCLOPEDIA_KIND_META[k].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            {linkOptions.length > 0 && (
              <Field label={form.kind === "npc" ? "Link to an NPC sheet" : "Link to an item definition"} hint="Optional: pulls the portrait or icon" className="sm:col-span-2">
                <Select value={form.refId ?? ""} onChange={(e) => link(e.target.value)}>
                  <option value="">— none —</option>
                  {linkOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
        <Field label="Entry">
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-[140px]" placeholder="What the crew knows (or will know)…" />
        </Field>
        <Toggle on={form.visibleToPlayers} onChange={(v) => setForm({ ...form, visibleToPlayers: v })} color={meta.color} label={form.visibleToPlayers ? "Published: every player can read it" : "Hidden: only you see it until you publish"} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" color={meta.color} icon="save" disabled={save.isPending || !form.name}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
