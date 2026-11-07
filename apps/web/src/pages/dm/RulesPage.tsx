import { AUTOMATION_MODES, DAMAGE_TYPES, type RuleDefinitionDto, type RuleGraph } from "@neom/shared";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAbilities, useCharacters, useConditionDefinitions, useItemDefinitions, useRuleOp, useRuleVersions, useRules, useSaveRule, useSimulateRule } from "@/api/hooks";
import { RuleEditor, blankGraph } from "@/components/dm/RuleEditor";
import { Badge, Button, ConfirmButton, Empty, Field, Input, Panel, Select, Spinner, Textarea } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { TraceRow } from "./EventsPage";
import { useDm } from "./DmShell";

export function RulesPage() {
  const { campaign } = useDm();
  const { ruleId } = useParams();
  const nav = useNavigate();
  const rules = useRules(campaign.id);
  const save = useSaveRule(campaign.id);
  const op = useRuleOp(campaign.id);
  const selected = rules.data?.find((r) => r.id === ruleId) ?? null;

  const createNew = async () => {
    const r = await save.mutateAsync({ body: { name: "New rule", description: "", automationMode: null, enabled: false, scope: "campaign", graph: blankGraph() } });
    nav(`/c/${campaign.id}/dm/rules/${r.id}`);
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
      <Panel title="Rules" icon="git-fork" color="violet" actions={<Button size="xs" icon="plus" onClick={createNew}>New</Button>}>
        {rules.isLoading && <Spinner />}
        {rules.data?.length === 0 && <Empty>No rules yet.</Empty>}
        <div className="space-y-1">
          {rules.data?.map((r) => (
            <Link key={r.id} to={`/c/${campaign.id}/dm/rules/${r.id}`} className={clsx("hud-panel block p-2 text-xs", ruleId === r.id && "border-violet")} style={{ ["--panel-accent" as string]: r.enabled ? "var(--color-violet)" : "var(--color-line-2)" }}>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-text">{r.name}</span>
                <span className="flex gap-1">
                  {!r.validation.valid && <Badge color="crimson">!</Badge>}
                  <Badge color={r.publishedVersion ? (r.publishedVersion === r.draftVersion ? "ok" : "amber") : "muted"}>{r.publishedVersion ? (r.publishedVersion === r.draftVersion ? `v${r.publishedVersion}` : `v${r.publishedVersion} · draft v${r.draftVersion}`) : "unpublished"}</Badge>
                </span>
              </div>
              <div className="mt-0.5 flex gap-1 text-dim">
                <span>{r.automationMode ?? "campaign default"}</span>·<span>{r.scope}</span>·<span className={r.enabled ? "text-ok" : ""}>{r.enabled ? "enabled" : "disabled"}</span>
              </div>
            </Link>
          ))}
        </div>
      </Panel>
      {selected ? <RuleWorkbench key={selected.id} rule={selected} /> : <Panel title="Rule editor" icon="git-fork" color="violet"><Empty icon="git-fork">Pick a rule or create a new one. Rules are stored as declarative graphs and interpreted by the server. Nothing here runs arbitrary code.</Empty></Panel>}
      {op.isPending && <Spinner />}
    </div>
  );
}

function RuleWorkbench({ rule }: { rule: RuleDefinitionDto }) {
  const { campaign } = useDm();
  const nav = useNavigate();
  const save = useSaveRule(campaign.id);
  const op = useRuleOp(campaign.id);
  const versions = useRuleVersions(campaign.id, rule.id);
  const conditions = useConditionDefinitions(campaign.id);
  const items = useItemDefinitions(campaign.id);
  const abilities = useAbilities(campaign.id);
  const [meta, setMeta] = useState({ name: rule.name, description: rule.description, automationMode: rule.automationMode, enabled: rule.enabled, scope: rule.scope });
  const [graph, setGraph] = useState<RuleGraph>(rule.graph);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"editor" | "simulate" | "versions">("editor");

  useEffect(() => {
    setGraph(rule.graph);
    setMeta({ name: rule.name, description: rule.description, automationMode: rule.automationMode, enabled: rule.enabled, scope: rule.scope });
    setDirty(false);
  }, [rule.id, rule.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async () => {
    await save.mutateAsync({ id: rule.id, body: { ...meta, graph } });
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      <Panel
        title={meta.name}
        icon="git-fork"
        color="violet"
        actions={
          <>
            {dirty && <Badge color="amber">unsaved</Badge>}
            <Button size="xs" variant="solid" color="violet" icon="save" disabled={save.isPending} onClick={persist}>
              Save draft
            </Button>
            <Button size="xs" color="ok" icon="upload" disabled={dirty || save.isPending || !rule.validation.valid} title={dirty ? "Save first" : !rule.validation.valid ? "Fix validation errors" : ""} onClick={() => op.mutate({ id: rule.id, op: "publish" })}>
              Publish v{rule.draftVersion}
            </Button>
            <Button size="xs" variant="ghost" icon="copy" onClick={() => op.mutate({ id: rule.id, op: "duplicate" })}>
              Duplicate
            </Button>
            <ConfirmButton size="xs" label="Delete" onConfirm={async () => { await op.mutateAsync({ id: rule.id, op: "delete" }); nav(`/c/${campaign.id}/dm/rules`); }} />
          </>
        }
      >
        <div className="grid gap-2 md:grid-cols-5">
          <Field label="Name" className="md:col-span-2">
            <Input value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} />
          </Field>
          <Field label="Automation">
            <Select value={meta.automationMode ?? ""} onChange={(e) => { setMeta({ ...meta, automationMode: (e.target.value || null) as typeof meta.automationMode }); setDirty(true); }}>
              <option value="">campaign default ({campaign.settings.defaultAutomationMode})</option>
              {AUTOMATION_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Scope" hint={meta.scope === "campaign" ? "Applies to every character" : "Only when attached to an item, condition or node"}>
            <Select value={meta.scope} onChange={(e) => { setMeta({ ...meta, scope: e.target.value as typeof meta.scope }); setDirty(true); }}>
              <option value="campaign">campaign-wide</option>
              <option value="attached">attached</option>
            </Select>
          </Field>
          <Field label="Enabled">
            <Select value={meta.enabled ? "1" : "0"} onChange={(e) => { setMeta({ ...meta, enabled: e.target.value === "1" }); setDirty(true); }}>
              <option value="1">enabled</option>
              <option value="0">disabled</option>
            </Select>
          </Field>
          <Field label="Description" className="md:col-span-5">
            <Textarea value={meta.description} onChange={(e) => { setMeta({ ...meta, description: e.target.value }); setDirty(true); }} className="min-h-[44px]" />
          </Field>
        </div>
        <div className="mt-2 text-[0.65rem] text-muted">
          {rule.publishedVersion ? `Published v${rule.publishedVersion} is what runs at the table. ` : "Not published yet: this rule does not run. "}
          {rule.publishedVersion && rule.publishedVersion !== rule.draftVersion ? `Draft v${rule.draftVersion} has unpublished changes.` : ""}
        </div>
      </Panel>

      <div className="flex gap-1">
        {(["editor", "simulate", "versions"] as const).map((t) => (
          <button key={t} className={clsx("hud-tab", tab === t && "active")} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "editor" && (
        <RuleEditor
          graph={graph}
          onChange={(g) => { setGraph(g); setDirty(true); }}
          lookups={{ conditions: conditions.data ?? [], items: items.data ?? [], abilities: abilities.data ?? [] }}
        />
      )}
      {tab === "simulate" && <Simulator graph={graph} />}
      {tab === "versions" && (
        <Panel title="Published versions" icon="history" color="muted">
          {versions.data?.length === 0 && <Empty>No published versions yet.</Empty>}
          <ul className="space-y-1 text-xs">
            {versions.data?.map((v) => (
              <li key={v.id} className="flex items-center justify-between border-b border-line/60 py-1">
                <span>
                  v{v.version} <span className="text-dim">· {timeAgo(v.createdAt)} ago</span> {v.note && <span className="text-muted">— {v.note}</span>}
                  {rule.publishedVersion === v.version && <Badge color="ok" className="ml-2">live</Badge>}
                </span>
                <Button size="xs" variant="ghost" icon="rotate-ccw" onClick={() => op.mutate({ id: rule.id, op: "restore", version: v.version })}>
                  Restore to draft
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Simulator({ graph }: { graph: RuleGraph }) {
  const { campaign } = useDm();
  const chars = useCharacters(campaign.id);
  const sim = useSimulateRule(campaign.id);
  const [characterId, setCharacterId] = useState("");
  const [eventType, setEventType] = useState("damageReceived");
  const [amount, setAmount] = useState(8);
  const [damageType, setDamageType] = useState<(typeof DAMAGE_TYPES)[number]>("physical");
  const [hpBefore, setHpBefore] = useState(12);
  const [hpAfter, setHpAfter] = useState(3);
  const [hpMax, setHpMax] = useState(12);
  const [conditionKey, setConditionKey] = useState("");
  const run = () =>
    sim.mutate({
      graph,
      characterId: characterId || undefined,
      event: {
        type: eventType,
        damage: eventType === "damageReceived" ? { amount, damageType } : undefined,
        healing: eventType === "healingReceived" ? amount : undefined,
        hp: ["damageReceived", "healingReceived", "hpThreshold"].includes(eventType) ? { before: hpBefore, after: hpAfter, max: hpMax } : undefined,
        conditionKey: conditionKey || undefined,
      },
      stateOverrides: ["damageReceived", "healingReceived", "hpThreshold"].includes(eventType) ? { hpCurrent: hpAfter, hpMax } : undefined,
    });
  const res = sim.data;
  return (
    <Panel title="Simulation (dry run — nothing is applied)" icon="flask-conical" color="amber">
      <div className="grid gap-2 md:grid-cols-6">
        <Field label="Character state" className="md:col-span-2">
          <Select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">Synthetic test character</option>
            {chars.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event">
          <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {["damageReceived", "healingReceived", "hpThreshold", "itemEquipped", "itemRemoved", "augInstalled", "augDisabled", "attack", "skillCheck", "turnStart", "turnEnd", "abilityActivated", "conditionApplied", "conditionRemoved", "manual"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount">
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Damage type">
          <Select value={damageType} onChange={(e) => setDamageType(e.target.value as typeof damageType)}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Condition key">
          <Input value={conditionKey} onChange={(e) => setConditionKey(e.target.value)} />
        </Field>
        <Field label="HP before">
          <Input type="number" value={hpBefore} onChange={(e) => setHpBefore(Number(e.target.value))} />
        </Field>
        <Field label="HP after">
          <Input type="number" value={hpAfter} onChange={(e) => setHpAfter(Number(e.target.value))} />
        </Field>
        <Field label="HP max">
          <Input type="number" value={hpMax} onChange={(e) => setHpMax(Number(e.target.value))} />
        </Field>
        <div className="flex items-end">
          <Button variant="solid" color="amber" icon="play" disabled={sim.isPending} onClick={run}>
            Run
          </Button>
        </div>
      </div>
      {res && (
        <div className="mt-3 space-y-2 text-xs">
          {!res.validation.valid && <div className="text-crimson">Graph has errors: {res.validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}</div>}
          {res.result && (
            <TraceRow
              t={{
                id: "sim",
                campaignId: campaign.id,
                ruleId: null,
                ruleName: "Simulation",
                characterId: characterId,
                characterName: chars.data?.find((c) => c.id === characterId)?.name ?? "synthetic",
                eventType,
                result: res.result,
                status: res.result.fired ? "applied" : "noop",
                automationMode: "manual",
                createdAt: new Date().toISOString(),
              }}
            />
          )}
          {res.result && (
            <pre className="num max-h-60 overflow-auto border border-line bg-bg-0 p-2 text-[0.65rem] text-muted">{JSON.stringify(res.result.actions, null, 2)}</pre>
          )}
        </div>
      )}
    </Panel>
  );
}
