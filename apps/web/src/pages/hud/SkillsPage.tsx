import { ATTRIBUTE_META, SPECIAL_SKILLS, SPECIAL_SKILL_META, describePassiveEffect, describeRequirement, unmetRequirements, type SkillTreeDto, type SkillTreeNodeDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useAbilities, useSkillTrees, useUnlockNode, useUseAbility } from "@/api/hooks";
import { requirementContext } from "@/components/hud/AugmentationDrawer";
import { Badge, Button, Empty, Icon, Panel, Spinner } from "@/components/ui";
import { accent } from "@/lib/format";
import { useHud } from "./HudShell";

export function SkillsPage() {
  const { view, campaign } = useHud();
  const trees = useSkillTrees(campaign.id);
  const [branch, setBranch] = useState<string>("hacking");
  const unlock = useUnlockNode(view.character.id);
  const useAb = useUseAbility(view.character.id);
  const tree = trees.data?.find((t) => t.branch === branch);
  const color = ATTRIBUTE_META[SPECIAL_SKILL_META[branch as keyof typeof SPECIAL_SKILL_META].attribute].color;

  return (
    <div className="mx-auto max-w-[1600px] space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {SPECIAL_SKILLS.map((s) => {
          const c = ATTRIBUTE_META[SPECIAL_SKILL_META[s].attribute].color;
          const unlocked = view.unlocks.filter((u) => trees.data?.find((t) => t.id === u.treeId)?.branch === s).length;
          return (
            <button key={s} className={clsx("hud-tab flex items-center gap-2", branch === s && "active")} style={branch === s ? { background: accent(c), boxShadow: `0 0 12px ${accent(c)}` } : undefined} onClick={() => setBranch(s)}>
              {SPECIAL_SKILL_META[s].name}
              <span className="num text-[0.55rem] opacity-70">{unlocked}</span>
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-sm">
          <Icon name="coins" size={14} className="text-cyan" />
          <span className="text-muted">Progression points</span>
          <span className="num text-lg font-bold text-cyan">{view.character.progressionPoints}</span>
        </span>
      </div>

      {trees.isLoading && <Spinner />}
      {!tree && !trees.isLoading && <Empty icon="git-branch">The DM has not defined this skill tree yet.</Empty>}
      {tree && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          <Panel title={`${tree.name} // ${SPECIAL_SKILL_META[branch as keyof typeof SPECIAL_SKILL_META].attribute.toUpperCase()}`} color={color} icon="git-branch">
            <p className="mb-3 text-xs text-muted">{tree.description || SPECIAL_SKILL_META[branch as keyof typeof SPECIAL_SKILL_META].description}</p>
            <TreeGraph tree={tree} view={view} color={color} onUnlock={(id) => unlock.mutate(id)} busy={unlock.isPending} />
          </Panel>
          <div className="space-y-3">
            <Panel title="Granted abilities" icon="zap" color="amber">
              {view.abilities.length === 0 && <div className="text-xs text-dim">Unlock nodes that grant abilities to see them here.</div>}
              <ul className="space-y-2 text-xs">
                {view.abilities.map((a) => (
                  <li key={a.id} className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-text">
                        <Icon name={a.icon} size={13} className="text-amber" /> {a.name}
                      </span>
                      <Badge color="amber">{a.actionType}</Badge>
                    </div>
                    <p className="mt-1 text-muted">{a.description}</p>
                    {view.permissions.canEdit && (
                      <Button size="xs" color="amber" className="mt-2" icon="play" disabled={useAb.isPending} onClick={() => useAb.mutate(a.id)}>
                        Activate
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="How progression works" icon="info" color="muted">
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                <li>The DM awards progression points through missions and events.</li>
                <li>Nodes need their parent nodes unlocked first, plus any listed requirements.</li>
                <li>Ranked nodes grant their effects again per rank.</li>
                <li>Node effects run through the same rules engine as gear and cyberware.</li>
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeGraph({ tree, view, color, onUnlock, busy }: { tree: SkillTreeDto; view: ReturnType<typeof useHud>["view"]; color: string; onUnlock: (id: string) => void; busy: boolean }) {
  const abilities = useAbilities(view.character.campaignId);
  const describe = (e: SkillTreeNodeDto["effects"][number]) =>
    e.kind === "grantAbility" ? `Grants ability: ${abilities.data?.find((a) => a.id === e.abilityId)?.name ?? "…"}` : describePassiveEffect(e);
  const tiers = [...new Set(tree.nodes.map((n) => n.tier))].sort((a, b) => a - b);
  const rank = (n: SkillTreeNodeDto) => view.unlocks.find((u) => u.nodeId === n.id)?.rank ?? 0;
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
  const ctx = requirementContext(view);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px] gap-6">
        {tiers.map((tier) => (
          <div key={tier} className="flex flex-1 flex-col gap-3">
            <div className="hud-title text-center text-[0.55rem]">Tier {tier + 1}</div>
            {tree.nodes
              .filter((n) => n.tier === tier)
              .map((n) => {
                const r = rank(n);
                const parentsOk = n.parentKeys.every((k) => rank(byKey.get(k)!) > 0);
                const unmet = unmetRequirements(n.requirements, ctx);
                const maxed = r >= n.maxRank;
                const affordable = view.character.progressionPoints >= n.cost;
                const can = parentsOk && unmet.length === 0 && !maxed && affordable && view.permissions.canEdit;
                return (
                  <div
                    key={n.id}
                    className={clsx("hud-panel p-2 text-xs transition", r > 0 ? "" : parentsOk ? "" : "opacity-50")}
                    style={{ ["--panel-accent" as string]: r > 0 ? accent(color) : "var(--color-line-2)", borderColor: r > 0 ? accent(color) : undefined }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="hud-clip-sm flex h-9 w-9 shrink-0 items-center justify-center border" style={{ borderColor: r > 0 ? accent(color) : "var(--color-line-2)", color: r > 0 ? accent(color) : "var(--color-muted)", boxShadow: r > 0 ? `0 0 10px ${accent(color)}` : undefined }}>
                        <Icon name={n.icon} size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate font-semibold text-text">{n.name}</span>
                          <span className="num text-muted">
                            {r}/{n.maxRank}
                          </span>
                        </div>
                        <div className="text-muted">{n.description}</div>
                      </div>
                    </div>
                    <div className="mt-1 text-[0.65rem] text-cyan">{n.effects.map(describe).join(" · ")}</div>
                    {n.parentKeys.length > 0 && <div className="text-[0.6rem] text-dim">Requires: {n.parentKeys.map((k) => byKey.get(k)?.name ?? k).join(", ")}</div>}
                    {n.requirements.length > 0 && <div className={clsx("text-[0.6rem]", unmet.length ? "text-crimson" : "text-dim")}>{n.requirements.map(describeRequirement).join(", ")}</div>}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="num text-muted">
                        cost {n.cost} pt{n.cost === 1 ? "" : "s"}
                      </span>
                      {maxed ? (
                        <Badge color={color}>MAX</Badge>
                      ) : (
                        <Button size="xs" variant={can ? "solid" : "outline"} color={color} disabled={!can || busy} onClick={() => onUnlock(n.id)} title={!parentsOk ? "Unlock parents first" : unmet.length ? `Needs ${unmet.join(", ")}` : !affordable ? "Not enough points" : ""}>
                          {r > 0 ? "Rank up" : "Unlock"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
