import { AUTOMATION_MODES, type CampaignSettingsInput } from "@neom/shared";
import { useState } from "react";
import { useRegenerateInvite, useUpdateCampaign } from "@/api/hooks";
import { Button, Field, Input, Panel, Select, Textarea, Toggle } from "@/components/ui";
import { useDm } from "./DmShell";

export function SettingsPage() {
  const { campaign } = useDm();
  const update = useUpdateCampaign(campaign.id);
  const regen = useRegenerateInvite(campaign.id);
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const [s, setS] = useState<CampaignSettingsInput>({ ...campaign.settings });
  const set = <K extends keyof CampaignSettingsInput>(k: K, v: CampaignSettingsInput[K]) => setS((x) => ({ ...x, [k]: v }));

  return (
    <div className="grid max-w-5xl gap-3 lg:grid-cols-2">
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

      <Panel title="Rules configuration" icon="sliders-horizontal" color="crimson">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ settings: s });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Special skill max rank">
              <Input type="number" min={1} max={20} value={s.specialMaxRank} onChange={(e) => set("specialMaxRank", Number(e.target.value))} />
            </Field>
            <Field label="Base cyberware capacity">
              <Input type="number" min={0} max={100} value={s.baseCapacity} onChange={(e) => set("baseCapacity", Number(e.target.value))} />
            </Field>
            <Field label="Base speed (m)">
              <Input type="number" min={0} max={100} value={s.baseSpeed} onChange={(e) => set("baseSpeed", Number(e.target.value))} />
            </Field>
            <Field label="Default automation mode">
              <Select value={s.defaultAutomationMode} onChange={(e) => set("defaultAutomationMode", e.target.value as CampaignSettingsInput["defaultAutomationMode"])}>
                {AUTOMATION_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="hud-panel lit p-2" style={{ ["--panel-accent" as string]: "var(--color-crimson)" }}>
            <Toggle on={s.playersReadOnly} color="crimson" onChange={(v) => set("playersReadOnly", v)} label={<span className="text-sm text-text">Players are read-only: the DM makes all changes</span>} />
            <p className="mt-1 text-xs text-muted">When on, players can view their sheets, roll dice and write journal notes, but every change to HP, conditions, gear, cyberware, progression, missions and the sheet itself goes through DM//CONTROL. The three player permissions below only apply when this is off.</p>
          </div>
          <div className="flex flex-col items-start gap-1.5">
            <Toggle on={s.playersManageInventory} onChange={(v) => set("playersManageInventory", v)} label="Players manage their own inventory even when read-only (equip, use, drop, rename)" />
            <Toggle on={s.playersManagePortrait} onChange={(v) => set("playersManagePortrait", v)} label="Players upload their own character portrait even when read-only" />
            <Toggle on={s.specialExpertiseEnabled} onChange={(v) => set("specialExpertiseEnabled", v)} label="Allow expertise on cyberpunk skills" />
            <Toggle on={s.nat20AutoSuccess} onChange={(v) => set("nat20AutoSuccess", v)} label="House rule: natural 20 / 1 auto-succeed / fail on checks with a DC" />
            <Toggle on={s.tempHpStacks} onChange={(v) => set("tempHpStacks", v)} label="Temporary HP stacks (default: highest value wins)" />
            <Toggle on={s.playersEditAttributes} disabled={s.playersReadOnly} onChange={(v) => set("playersEditAttributes", v)} label="Players may edit attributes, skills and base HP" />
            <Toggle on={s.playersInstallCyberware} disabled={s.playersReadOnly} onChange={(v) => set("playersInstallCyberware", v)} label="Players may install and remove cyberware" />
            <Toggle on={s.playersLevelUp} disabled={s.playersReadOnly} onChange={(v) => set("playersLevelUp", v)} label="Players may change their own level and XP" />
          </div>
          <Button type="submit" variant="solid" color="crimson" icon="save" disabled={update.isPending}>
            Apply rules
          </Button>
          <p className="text-xs text-dim">Changing these recalculates every character immediately.</p>
        </form>
      </Panel>
    </div>
  );
}
