import { ATTRIBUTES, ATTRIBUTE_META, HIT_DIE_SIZES, abilityModifier, hitDieForClass, type AttributeKey, type HitDieSize } from "@neom/shared";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCampaign, useCharacters, useCreateCharacter, useDeleteCharacter, useMe } from "@/api/hooks";
import { Badge, Bar, Button, ConfirmButton, Empty, Field, Icon, Input, Modal, NumberStepper, Panel, Select, Spinner } from "@/components/ui";
import { useCampaignRealtime } from "@/realtime/socket";
import { useUi } from "@/store/ui";
import { Portrait } from "@/components/hud/Portrait";

export function CampaignHomePage() {
  const { campaignId = "" } = useParams();
  const me = useMe();
  const campaign = useCampaign(campaignId);
  const characters = useCharacters(campaignId);
  const create = useCreateCharacter();
  const del = useDeleteCharacter();
  const nav = useNavigate();
  const { online } = useCampaignRealtime(campaignId, me.data?.id);
  const remember = useUi((s) => s.rememberCharacter);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("Human");
  const [klass, setKlass] = useState("");
  const [subclass, setSubclass] = useState("");
  const [attrs, setAttrs] = useState<Record<AttributeKey, number>>({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  /** null = follow the class (d12 barbarian, d10 fighter/paladin/ranger, d6 sorcerer/wizard, d8 otherwise). */
  const [hitDie, setHitDie] = useState<HitDieSize | null>(null);
  const effectiveDie: HitDieSize = hitDie ?? hitDieForClass(klass);

  if (campaign.isLoading) return <Spinner />;
  if (!campaign.data) return <div className="p-6 text-crimson">Campaign unavailable.</div>;
  const c = campaign.data;
  const isDm = c.role === "DM";
  const onlineSet = new Set(online.length ? online : c.members.filter((m) => m.online).map((m) => m.userId));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = await create.mutateAsync({ campaignId, name, species, characterClass: klass, subclass, attributes: attrs, hitDieSize: effectiveDie });
    setOpen(false);
    remember(campaignId, v.character.id);
    nav(`/c/${campaignId}/hud/${v.character.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="hud-btn hud-btn-ghost !px-2">
            <Icon name="chevron-left" size={14} />
          </Link>
          <div>
            <div className="font-display text-lg font-bold tracking-[0.15em] text-cyan">{c.name}</div>
            <div className="flex items-center gap-2 font-display text-[0.6rem] uppercase tracking-[0.3em] text-muted">
              <Badge color={isDm ? "crimson" : "cyan"}>{c.role}</Badge>
              {c.liveSessionId && <span className="text-ok">● LIVE SESSION</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isDm && (
            <Link to={`/c/${campaignId}/dm`} className="hud-btn" style={{ ["--btn-color" as string]: "var(--color-crimson)" }}>
              <Icon name="crown" size={14} /> DM//CONTROL
            </Link>
          )}
          <Button icon="user-plus" onClick={() => setOpen(true)}>
            New character
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="Character roster" icon="users">
          {characters.isLoading && <Spinner />}
          {characters.data?.length === 0 && <Empty icon="user-round-plus">No characters yet. Create one to enter the HUD.</Empty>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {characters.data?.map((ch) => {
              const mine = ch.ownerUserId === me.data?.id;
              return (
                <div key={ch.id} className="hud-panel p-3" style={{ ["--panel-accent" as string]: mine ? "var(--color-cyan)" : "var(--color-line-2)" }}>
                  <div className="flex gap-3">
                    <Portrait url={ch.portraitUrl} name={ch.name} size={64} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate font-display text-sm font-bold tracking-wider">{ch.name}</div>
                        <span className="num text-xs text-muted">LV {ch.level}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {ch.species} {ch.characterClass && `· ${ch.characterClass}`}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-dim">
                        <span className={onlineSet.has(ch.ownerUserId) ? "text-ok" : ""}>●</span> {ch.ownerUsername}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="num text-crimson">
                          {ch.hpCurrent}/{ch.hpMax}
                        </span>
                        <Bar value={ch.hpCurrent} max={ch.hpMax} color="crimson" className="flex-1" height={6} />
                        <span className="num text-cyan">AC {ch.ac}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Link to={`/c/${campaignId}/hud/${ch.id}`} onClick={() => remember(campaignId, ch.id)} className="hud-btn hud-btn-solid !py-1 !text-[0.6rem]">
                      <Icon name="scan-face" size={12} /> {mine ? "Enter HUD" : "View sheet"}
                    </Link>
                    {(mine || isDm) && <ConfirmButton size="xs" label={<Icon name="trash-2" size={12} />} confirmLabel="Delete" onConfirm={() => del.mutate({ id: ch.id, campaignId })} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Operators" icon="radio">
            <ul className="space-y-1.5 text-sm">
              {c.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={onlineSet.has(m.userId) ? "text-ok" : "text-dim"}>●</span>
                    {m.username}
                  </span>
                  <Badge color={m.role === "DM" ? "crimson" : "muted"}>{m.role}</Badge>
                </li>
              ))}
            </ul>
            {isDm && c.inviteCode && (
              <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
                Invite code: <span className="num text-cyan">{c.inviteCode}</span>
              </div>
            )}
          </Panel>
          <Panel title="Briefing" icon="file-text" color="amber">
            <p className="whitespace-pre-wrap text-sm text-muted">{c.description || "No briefing yet."}</p>
          </Panel>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New character">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Species">
              <Input value={species} onChange={(e) => setSpecies(e.target.value)} />
            </Field>
            <Field label="Class">
              <Input value={klass} onChange={(e) => setKlass(e.target.value)} placeholder="Rogue" />
            </Field>
            <Field label="Subclass">
              <Input value={subclass} onChange={(e) => setSubclass(e.target.value)} placeholder="Netrunner" />
            </Field>
            <Field label="Hit die" hint={hitDie === null ? `follows the class · level 1 HP ${Math.max(1, effectiveDie + abilityModifier(attrs.con))}` : "set by hand"}>
              <div className="flex items-center gap-2">
                <Select value={effectiveDie} onChange={(e) => setHitDie(Number(e.target.value) as HitDieSize)}>
                  {HIT_DIE_SIZES.map((d) => (
                    <option key={d} value={d}>
                      d{d}
                    </option>
                  ))}
                </Select>
                {hitDie !== null && (
                  <Button size="xs" variant="ghost" onClick={() => setHitDie(null)}>
                    Auto
                  </Button>
                )}
              </div>
            </Field>
          </div>
          <div>
            <div className="mb-1 font-display text-[0.6rem] uppercase tracking-[0.18em] text-muted">Attributes</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ATTRIBUTES.map((a) => (
                <div key={a} className="text-center">
                  <div className="font-display text-[0.6rem] tracking-widest" style={{ color: `var(--color-${ATTRIBUTE_META[a].color})` }}>
                    {ATTRIBUTE_META[a].short}
                  </div>
                  <NumberStepper value={attrs[a]} min={1} max={30} onChange={(v) => setAttrs({ ...attrs, [a]: v })} color={ATTRIBUTE_META[a].color} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="solid" disabled={create.isPending} icon="check">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
