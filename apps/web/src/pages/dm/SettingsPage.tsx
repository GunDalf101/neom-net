import { AUTOMATION_MODES, type CampaignSettingsInput } from "@neom/shared";
import { useEffect, useState } from "react";
import { useRegenerateInvite, useUpdateCampaign } from "@/api/hooks";
import { Button, Field, Input, Panel, Select, Textarea, Toggle } from "@/components/ui";
import { useDm } from "./DmShell";

/**
 * Rules apply the moment they change (toggles and selects save on click, numbers on blur / Enter), and the
 * server recalculates every character. The campaign name and briefing keep an explicit Save.
 */
export function SettingsPage() {
  const { campaign } = useDm();
  const update = useUpdateCampaign(campaign.id);
  const regen = useRegenerateInvite(campaign.id);
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const [s, setS] = useState<CampaignSettingsInput>({ ...campaign.settings });
  // Another DM screen (or a realtime push) may change the rules: mirror the server once it answers.
  useEffect(() => setS({ ...campaign.settings }), [campaign.settings]);

  const apply = <K extends keyof CampaignSettingsInput>(k: K, v: CampaignSettingsInput[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    update.mutate({ settings: { [k]: v } as Partial<CampaignSettingsInput> });
  };
  const num = <K extends keyof CampaignSettingsInput>(k: K, min: number, max: number) => ({
    type: "number" as const,
    min,
    max,
    value: Number(s[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, [k]: Number(e.target.value) })),
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const v = Math.max(min, Math.min(max, Number(e.target.value)));
      if (v !== campaign.settings[k]) apply(k, v as CampaignSettingsInput[K]);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && (e.target as HTMLInputElement).blur(),
  });
  const ro = s.playersReadOnly;

  return (
    <div className="grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel title="Campaign" icon="settings">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name, description });
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Briefing">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Button type="submit" variant="solid" icon="save" disabled={update.isPending}>
            Save
          </Button>
        </form>
        <div className="mt-4 border-t border-line pt-3">
          <div className="hud-title mb-1">Invite code</div>
          <div className="flex items-center gap-2">
            <span className="num text-xl text-cyan">{campaign.inviteCode}</span>
            <Button size="xs" variant="ghost" icon="refresh-cw" onClick={() => regen.mutate()}>
              Rotate
            </Button>
          </div>
          <div className="mt-3 hud-title mb-1">Members</div>
          <ul className="text-xs text-muted">
            {campaign.members.map((m) => (
              <li key={m.userId} className="flex justify-between py-0.5">
                <span>{m.username}</span>
                <span>{m.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="Rules configuration" icon="sliders-horizontal" color="crimson" actions={<span className="text-[0.6rem] uppercase tracking-wider text-muted">{update.isPending ? "Saving…" : "Changes apply immediately"}</span>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Special skill max rank" hint="Cap for Augmentation, Reflex, Adaptability, Hacking, Sanity, Aura ranks">
              <Input {...num("specialMaxRank", 1, 20)} />
            </Field>
            <Field label="Base cyberware capacity" hint="Before items, nodes and rules add to it">
              <Input {...num("baseCapacity", 0, 100)} />
            </Field>
            <Field label="Base speed (m)">
              <Input {...num("baseSpeed", 0, 100)} />
            </Field>
            <Field label="Default automation mode" hint="For rules without their own mode">
              <Select value={s.defaultAutomationMode} onChange={(e) => apply("defaultAutomationMode", e.target.value as CampaignSettingsInput["defaultAutomationMode"])}>
                {AUTOMATION_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="hud-panel lit p-2" style={{ ["--panel-accent" as string]: "var(--color-crimson)" }}>
            <Toggle on={s.playersReadOnly} color="crimson" onChange={(v) => apply("playersReadOnly", v)} label={<span className="text-sm text-text">Players are read-only: the DM makes all changes</span>} />
            <p className="mt-1 text-xs text-muted">
              When on, players view their sheets, roll dice, manage their own gear (below) and write notes; HP, conditions, cyberware, progression, missions and the sheet itself go through DM//CONTROL. The three
              player permissions at the bottom only apply when this is off.
            </p>
          </div>

          <div className="flex flex-col items-start gap-1.5">
            <Toggle on={s.playersManageInventory} onChange={(v) => apply("playersManageInventory", v)} label="Players manage their own inventory even when read-only (equip, use, drop, rename)" />
            <Toggle on={s.specialExpertiseEnabled} onChange={(v) => apply("specialExpertiseEnabled", v)} label="Allow expertise on cyberpunk skills (off caps them at proficiency)" />
            <Toggle on={s.nat20AutoSuccess} onChange={(v) => apply("nat20AutoSuccess", v)} label="House rule: natural 20 auto-succeeds and natural 1 auto-fails on checks that have a DC (DM roll requests)" />
            <Toggle on={s.tempHpStacks} onChange={(v) => apply("tempHpStacks", v)} label="Temporary HP stacks (off: the higher value wins, as in 5e)" />
          </div>

          <div className={ro ? "opacity-60" : ""}>
            <div className="mb-1 text-[0.6rem] uppercase tracking-[0.16em] text-muted">Player permissions {ro && "(inactive while players are read-only)"}</div>
            <div className="flex flex-col items-start gap-1.5">
              <Toggle on={s.playersEditAttributes} disabled={ro} onChange={(v) => apply("playersEditAttributes", v)} label="Players may edit attributes, skills, saves, hit die and base HP" />
              <Toggle on={s.playersInstallCyberware} disabled={ro} onChange={(v) => apply("playersInstallCyberware", v)} label="Players may install and remove cyberware" />
              <Toggle on={s.playersLevelUp} disabled={ro} onChange={(v) => apply("playersLevelUp", v)} label="Players may change their own level and XP" />
            </div>
          </div>
          <p className="text-xs text-dim">Every change is saved as soon as you make it and recalculates all characters; the event log records it as campaign.updated.</p>
        </div>
      </Panel>
    </div>
  );
}
