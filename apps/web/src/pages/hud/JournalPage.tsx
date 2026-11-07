import type { JournalEntryDto, JournalInput } from "@neom/shared";
import { useState } from "react";
import { useDeleteJournal, useJournal, useSaveJournal } from "@/api/hooks";
import { Badge, Button, ConfirmButton, Empty, Field, Input, Modal, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { useHud } from "./HudShell";

export function JournalPage() {
  const { view, campaign, me, isDm } = useHud();
  return <JournalBoard campaignId={campaign.id} characterId={view.character.id} meId={me.id} isDm={isDm} />;
}

export function JournalBoard({ campaignId, characterId, meId, isDm }: { campaignId: string; characterId?: string; meId: string; isDm: boolean }) {
  const journal = useJournal(campaignId);
  const save = useSaveJournal(campaignId);
  const del = useDeleteJournal(campaignId);
  const [editing, setEditing] = useState<JournalEntryDto | "new" | null>(null);
  const entries = journal.data ?? [];
  const lore = entries.filter((e) => e.isLore);
  const shared = entries.filter((e) => !e.isLore && e.visibility !== "private");
  const mine = entries.filter((e) => e.visibility === "private" && e.authorUserId === meId);

  return (
    <div className="mx-auto grid max-w-[1500px] gap-3 lg:grid-cols-3">
      <Column title="Campaign lore" icon="scroll" color="amber" entries={lore} meId={meId} isDm={isDm} onEdit={setEditing} onDelete={(id) => del.mutate(id)} empty="The DM has not published lore yet." />
      <Column title="Shared notes" icon="users" color="cyan" entries={shared} meId={meId} isDm={isDm} onEdit={setEditing} onDelete={(id) => del.mutate(id)} empty="No shared notes." />
      <Column
        title="Private notes"
        icon="lock"
        color="magenta"
        entries={mine}
        meId={meId}
        isDm={isDm}
        onEdit={setEditing}
        onDelete={(id) => del.mutate(id)}
        empty="Your private notes live here."
        actions={
          <Button size="xs" icon="plus" onClick={() => setEditing("new")}>
            New
          </Button>
        }
      />
      {journal.isLoading && <Spinner />}
      <JournalEditor
        open={Boolean(editing)}
        entry={editing === "new" ? null : editing}
        isDm={isDm}
        characterId={characterId}
        onClose={() => setEditing(null)}
        onSave={async (body, id) => {
          await save.mutateAsync({ id, body });
          setEditing(null);
        }}
      />
    </div>
  );
}

function Column({ title, icon, color, entries, meId, isDm, onEdit, onDelete, empty, actions }: { title: string; icon: string; color: string; entries: JournalEntryDto[]; meId: string; isDm: boolean; onEdit: (e: JournalEntryDto) => void; onDelete: (id: string) => void; empty: string; actions?: React.ReactNode }) {
  return (
    <Panel title={title} icon={icon} color={color} actions={actions} bodyClassName="space-y-2">
      {entries.length === 0 && <Empty icon="file">{empty}</Empty>}
      {entries.map((e) => (
        <article key={e.id} className="hud-panel p-2" style={{ ["--panel-accent" as string]: `var(--color-${color})` }}>
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-display text-xs font-bold tracking-wider text-text">{e.title}</h4>
            <div className="flex items-center gap-1">
              {e.visibility === "dm" && <Badge color="crimson">DM</Badge>}
              {(e.authorUserId === meId || isDm) && (
                <>
                  <Button size="xs" variant="ghost" icon="pencil" onClick={() => onEdit(e)} aria-label="Edit" />
                  <ConfirmButton size="xs" label="✕" confirmLabel="Delete" onConfirm={() => onDelete(e.id)} />
                </>
              )}
            </div>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{e.body}</p>
          <div className="mt-1 text-[0.6rem] text-dim">
            {e.authorName} · {timeAgo(e.updatedAt)} ago
          </div>
        </article>
      ))}
    </Panel>
  );
}

function JournalEditor({ open, entry, isDm, characterId, onClose, onSave }: { open: boolean; entry: JournalEntryDto | null; isDm: boolean; characterId?: string; onClose: () => void; onSave: (body: JournalInput, id?: string) => Promise<void> }) {
  const [form, setForm] = useState<JournalInput>({ title: "", body: "", characterId: characterId ?? null, visibility: "private", isLore: false });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = entry?.id ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    setForm(entry ? { title: entry.title, body: entry.body, characterId: entry.characterId, visibility: entry.visibility, isLore: entry.isLore } : { title: "", body: "", characterId: characterId ?? null, visibility: "private", isLore: false });
  }
  return (
    <Modal open={open} onClose={onClose} title={entry ? "Edit entry" : "New entry"}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave(form, entry?.id);
        }}
      >
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>
        <Field label="Body">
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-[160px]" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visibility">
            <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as JournalInput["visibility"] })}>
              <option value="private">Private (only me)</option>
              <option value="campaign">Shared with campaign</option>
              <option value="dm">Me and the DM</option>
            </Select>
          </Field>
          {isDm && (
            <Field label="Lore entry">
              <Select value={form.isLore ? "1" : "0"} onChange={(e) => setForm({ ...form, isLore: e.target.value === "1" })}>
                <option value="0">No</option>
                <option value="1">Yes — campaign lore</option>
              </Select>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" icon="save">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
