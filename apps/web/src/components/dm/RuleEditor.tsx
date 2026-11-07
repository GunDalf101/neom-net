import {
  NODE_CATALOG,
  NODE_SPECS,
  describeRuleGraph,
  validateRuleGraph,
  type GraphIssue,
  type NodeSpec,
  type RuleGraph,
  type RuleNode,
} from "@neom/shared";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ROLL_TARGETS, TargetSelect } from "@/components/editors/EffectEditors";
import { Badge, Button, Field, Input, Select } from "@/components/ui";

const CATEGORY_COLOR: Record<NodeSpec["category"], string> = { trigger: "var(--color-crimson)", condition: "var(--color-amber)", effect: "var(--color-cyan)", flow: "var(--color-violet)" };

type RuleNodeData = { nodeType: string; params: Record<string, unknown>; issues?: GraphIssue[] };
type RFNode = Node<RuleNodeData, "rule">;

function RuleNodeView({ data, selected }: NodeProps<RFNode>) {
  const spec = NODE_SPECS[data.nodeType];
  if (!spec) return <div className="border border-crimson p-2 text-xs">Unknown {data.nodeType}</div>;
  const color = CATEGORY_COLOR[spec.category];
  const flowIn = spec.inputs.filter((h) => h.type === "flow");
  const boolIn = spec.inputs.filter((h) => h.type === "bool");
  const flowOut = spec.outputs.filter((h) => h.type === "flow");
  const boolOut = spec.outputs.filter((h) => h.type === "bool");
  const errors = data.issues?.filter((i) => i.severity === "error") ?? [];
  const warns = data.issues?.filter((i) => i.severity === "warning") ?? [];
  const summary = Object.entries(data.params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
  return (
    <div className={clsx("hud-panel min-w-[190px] max-w-[240px] p-2 text-xs", selected && "brightness-125")} style={{ ["--panel-accent" as string]: color, borderColor: errors.length ? "var(--color-crimson)" : selected ? color : undefined }}>
      {flowIn.map((h) => (
        <Handle key={h.id} id={h.id} type="target" position={Position.Left} style={{ background: "var(--color-cyan)", width: 10, height: 10 }} />
      ))}
      {boolIn.map((h, i) => (
        <Handle key={h.id} id={h.id} type="target" position={Position.Top} style={{ left: 30 + i * 30, background: "var(--color-amber)", width: 10, height: 10, borderRadius: 2 }} title={`${h.label} (condition)`} />
      ))}
      <div className="font-display text-[0.55rem] uppercase tracking-[0.2em]" style={{ color }}>
        {spec.category}
      </div>
      <div className="font-semibold text-text">{spec.label}</div>
      {summary && <div className="mt-0.5 break-words text-[0.62rem] text-muted">{summary}</div>}
      {errors.length > 0 && <div className="mt-1 text-[0.6rem] text-crimson">{errors[0]?.message}</div>}
      {warns.length > 0 && errors.length === 0 && <div className="mt-1 text-[0.6rem] text-amber">{warns[0]?.message}</div>}
      <div className="mt-1 flex flex-col items-end gap-0.5 text-[0.55rem] uppercase tracking-wider text-dim">
        {flowOut.map((h) => (
          <span key={h.id}>{h.label}</span>
        ))}
      </div>
      {flowOut.map((h, i) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: `calc(100% - ${(flowOut.length - i) * 14 - 4}px)`, background: h.id === "false" || h.id === "exhausted" ? "var(--color-crimson)" : h.id === "onExpiry" ? "var(--color-violet)" : "var(--color-cyan)", width: 10, height: 10 }} title={h.label} />
      ))}
      {boolOut.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Bottom} style={{ background: "var(--color-amber)", width: 10, height: 10, borderRadius: 2 }} title={`${h.label} (boolean)`} />
      ))}
    </div>
  );
}

const nodeTypes = { rule: RuleNodeView };

function toFlow(graph: RuleGraph, issues: GraphIssue[]): { nodes: RFNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: "rule", position: n.position, data: { nodeType: n.type, params: n.params, issues: issues.filter((i) => i.nodeId === n.id) } })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, animated: true, style: { stroke: issues.some((i) => i.edgeId === e.id) ? "var(--color-crimson)" : undefined } })),
  };
}

function fromFlow(nodes: RFNode[], edges: Edge[]): RuleGraph {
  return {
    version: 1,
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.nodeType, params: n.data.params, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? "out", target: e.target, targetHandle: e.targetHandle ?? "in" })),
  };
}

let seq = 1;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${seq++}`;

/** Key-order-independent serialization (Postgres jsonb reorders object keys). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Default params for a node type derived from its zod schema. */
function defaultParams(spec: NodeSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const shape = (spec.params as z.ZodObject<z.ZodRawShape>).shape ?? {};
  for (const [k, field] of Object.entries(shape)) {
    const info = inspect(field as z.ZodTypeAny);
    if (info.default !== undefined) out[k] = info.default;
    else if (!info.optional) out[k] = info.kind === "number" ? 1 : info.kind === "enum" ? info.values?.[0] : info.kind === "boolean" ? true : "";
  }
  return out;
}

interface FieldInfo {
  kind: "number" | "string" | "enum" | "boolean" | "unknown";
  optional: boolean;
  default?: unknown;
  values?: string[];
  min?: number;
  max?: number;
}

function inspect(schema: z.ZodTypeAny): FieldInfo {
  let s: z.ZodTypeAny = schema;
  let optional = false;
  let def: unknown;
  for (;;) {
    const t = s._def.typeName as string;
    if (t === "ZodOptional" || t === "ZodNullable") {
      optional = true;
      s = s._def.innerType;
    } else if (t === "ZodDefault") {
      def = s._def.defaultValue();
      s = s._def.innerType;
    } else break;
  }
  const t = s._def.typeName as string;
  if (t === "ZodNumber") {
    const checks = (s as z.ZodNumber)._def.checks as { kind: string; value?: number }[];
    return { kind: "number", optional, default: def, min: checks.find((c) => c.kind === "min")?.value, max: checks.find((c) => c.kind === "max")?.value };
  }
  if (t === "ZodString") return { kind: "string", optional, default: def };
  if (t === "ZodEnum") return { kind: "enum", optional, default: def, values: (s as z.ZodEnum<[string, ...string[]]>).options };
  if (t === "ZodBoolean") return { kind: "boolean", optional, default: def };
  if (t === "ZodUnion") return { kind: "string", optional, default: def };
  return { kind: "unknown", optional, default: def };
}

export interface RuleEditorProps {
  graph: RuleGraph;
  onChange: (g: RuleGraph) => void;
  lookups: { conditions: { key: string; name: string }[]; items: { id: string; name: string }[]; abilities: { id: string; name: string }[] };
}

export function RuleEditor({ graph, onChange, lookups }: RuleEditorProps) {
  const validation = useMemo(() => validateRuleGraph(graph), [graph]);
  const initial = useMemo(() => toFlow(graph, validation.issues), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteCat, setPaletteCat] = useState<NodeSpec["category"]>("trigger");

  // Push graph changes upward whenever nodes/edges change.
  useEffect(() => {
    const next = fromFlow(nodes, edges);
    if (stable(next) !== stable(graph)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Reflect validation issues onto nodes.
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, issues: validation.issues.filter((i) => i.nodeId === n.id) } })));
  }, [validation, setNodes]);

  // External graph replacement (e.g. version restore): resync when node count/ids differ.
  useEffect(() => {
    const ids = nodes.map((n) => n.id).sort().join(",");
    const gids = graph.nodes.map((n) => n.id).sort().join(",");
    if (ids !== gids || edges.length !== graph.edges.length) {
      const f = toFlow(graph, validation.issues);
      setNodes(f.nodes);
      setEdges(f.edges);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const s = nodes.find((n) => n.id === c.source);
      const t = nodes.find((n) => n.id === c.target);
      if (!s || !t || c.source === c.target) return false;
      const out = NODE_SPECS[s.data.nodeType]?.outputs.find((h) => h.id === c.sourceHandle);
      const inp = NODE_SPECS[t.data.nodeType]?.inputs.find((h) => h.id === c.targetHandle);
      if (!out || !inp || out.type !== inp.type) return false;
      if (out.type === "flow" && edges.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle)) return false;
      if (inp.type === "bool" && edges.some((e) => e.target === c.target && e.targetHandle === c.targetHandle)) return false;
      return true;
    },
    [nodes, edges],
  );

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: newId("e"), animated: true }, es)), [setEdges]);

  const addNode = (spec: NodeSpec) => {
    const id = newId(spec.category[0] ?? "n");
    const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0);
    setNodes((ns) => [...ns, { id, type: "rule", position: { x: maxX + 260, y: 120 + (ns.length % 3) * 140 }, data: { nodeType: spec.type, params: defaultParams(spec) } }]);
    setSelectedId(id);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const setParams = (params: Record<string, unknown>) => setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, params } } : n)));

  return (
    <div className="grid gap-2 lg:grid-cols-[200px_1fr_280px]">
      <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-violet)" }}>
        <div className="hud-title mb-2 text-[0.55rem]">Node palette</div>
        <div className="mb-2 flex flex-wrap gap-1">
          {(["trigger", "condition", "effect", "flow"] as const).map((c) => (
            <button key={c} className={clsx("hud-tab !px-1.5 !py-0.5 !text-[0.5rem]", paletteCat === c && "active")} onClick={() => setPaletteCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
          {NODE_CATALOG.filter((n) => n.category === paletteCat).map((spec) => (
            <button key={spec.type} type="button" onClick={() => addNode(spec)} className="hud-clip-sm w-full border border-line bg-bg-2 px-2 py-1 text-left text-xs hover:border-cyan" title={spec.description} style={{ borderLeftColor: CATEGORY_COLOR[spec.category], borderLeftWidth: 2 }}>
              {spec.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hud-panel h-[600px]" style={{ ["--panel-accent" as string]: "var(--color-violet)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={(_e, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="#1c2a3c" />
          <Controls />
          <MiniMap pannable zoomable nodeColor={(n) => CATEGORY_COLOR[NODE_SPECS[(n.data as RuleNodeData).nodeType]?.category ?? "flow"]} />
        </ReactFlow>
      </div>

      <div className="space-y-2">
        <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-amber)" }}>
          <div className="hud-title mb-2 text-[0.55rem]">Inspector</div>
          {!selected && <div className="text-xs text-dim">Select a node to edit its parameters. Drag from a right-side handle (flow) or bottom handle (boolean) to connect.</div>}
          {selected && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">{NODE_SPECS[selected.data.nodeType]?.label}</span>
                <Button size="xs" variant="ghost" icon="trash-2" onClick={removeSelected} aria-label="Delete node" />
              </div>
              <p className="text-muted">{NODE_SPECS[selected.data.nodeType]?.description}</p>
              <ParamForm spec={NODE_SPECS[selected.data.nodeType]!} params={selected.data.params} onChange={setParams} lookups={lookups} />
            </div>
          )}
        </div>
        <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: validation.valid ? "var(--color-ok)" : "var(--color-crimson)" }}>
          <div className="hud-title mb-1 flex items-center justify-between text-[0.55rem]">
            <span>Validation</span>
            <Badge color={validation.valid ? "ok" : "crimson"}>{validation.valid ? "valid" : "errors"}</Badge>
          </div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[0.65rem]">
            {validation.issues.length === 0 && <li className="text-ok">No issues.</li>}
            {validation.issues.map((i, k) => (
              <li key={k} className={i.severity === "error" ? "text-crimson" : "text-amber"}>
                <button type="button" className="text-left hover:underline" onClick={() => i.nodeId && setSelectedId(i.nodeId)}>
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="hud-panel p-2" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
          <div className="hud-title mb-1 text-[0.55rem]">Preview</div>
          <pre className="num max-h-40 overflow-auto whitespace-pre-wrap text-[0.62rem] text-muted">{describeRuleGraph(graph).join("\n")}</pre>
        </div>
      </div>
    </div>
  );
}

function ParamForm({ spec, params, onChange, lookups }: { spec: NodeSpec; params: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void; lookups: RuleEditorProps["lookups"] }) {
  const shape = (spec.params as z.ZodObject<z.ZodRawShape>).shape ?? {};
  const entries = Object.entries(shape);
  if (entries.length === 0) return <div className="text-dim">No parameters.</div>;
  const set = (k: string, v: unknown) => onChange({ ...params, [k]: v === "" ? undefined : v });
  return (
    <div className="space-y-2">
      {entries.map(([key, field]) => {
        const info = inspect(field as z.ZodTypeAny);
        const value = params[key];
        const label = `${key}${info.optional ? " (optional)" : ""}`;
        if (key === "target" && spec.type.startsWith("effect.")) {
          return (
            <Field key={key} label={label}>
              <TargetSelect value={String(value ?? "ac")} onChange={(v) => set(key, v)} />
            </Field>
          );
        }
        if (key === "on" || (key === "target" && spec.type === "trigger.skillCheck")) {
          return (
            <Field key={key} label={label}>
              <Select value={String(value ?? "")} onChange={(e) => set(key, e.target.value)}>
                {info.optional && <option value="">any</option>}
                {ROLL_TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        if (key === "conditionKey") {
          return (
            <Field key={key} label={label}>
              <Select value={String(value ?? "")} onChange={(e) => set(key, e.target.value)}>
                {info.optional && <option value="">any</option>}
                {lookups.conditions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        if (key === "definitionId") {
          return (
            <Field key={key} label={label}>
              <Select value={String(value ?? "")} onChange={(e) => set(key, e.target.value)}>
                <option value="">{info.optional ? "any" : "— pick —"}</option>
                {lookups.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        if (key === "abilityId") {
          return (
            <Field key={key} label={label}>
              <Select value={String(value ?? "")} onChange={(e) => set(key, e.target.value)}>
                <option value="">{info.optional ? "any" : "— pick —"}</option>
                {lookups.abilities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        if (info.kind === "enum") {
          return (
            <Field key={key} label={label}>
              <Select value={String(value ?? "")} onChange={(e) => set(key, e.target.value)}>
                {info.optional && <option value="">any</option>}
                {info.values?.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
          );
        }
        if (info.kind === "boolean") {
          return (
            <Field key={key} label={label}>
              <Select value={value === false ? "0" : "1"} onChange={(e) => set(key, e.target.value === "1")}>
                <option value="1">yes</option>
                <option value="0">no</option>
              </Select>
            </Field>
          );
        }
        if (info.kind === "number") {
          return (
            <Field key={key} label={label} hint={info.min !== undefined || info.max !== undefined ? `${info.min ?? ""}–${info.max ?? ""}` : undefined}>
              <Input type="number" min={info.min} max={info.max} value={value === undefined ? "" : Number(value)} onChange={(e) => set(key, e.target.value === "" ? undefined : Number(e.target.value))} />
            </Field>
          );
        }
        return (
          <Field key={key} label={label} hint={key === "amount" ? "number or dice, e.g. 2d6+1" : undefined}>
            <Input value={value === undefined ? "" : String(value)} onChange={(e) => set(key, key === "amount" && /^-?\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value)} />
          </Field>
        );
      })}
    </div>
  );
}

export function blankGraph(): RuleGraph {
  return { version: 1, nodes: [{ id: "trigger", type: "trigger.damageReceived", params: {}, position: { x: 60, y: 160 } }], edges: [] };
}

export type { RuleNode };
