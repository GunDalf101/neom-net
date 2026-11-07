import type { CharacterView, DiceRollDto } from "@neom/shared";
import clsx from "clsx";
import { useState } from "react";
import { useRoll, useRolls } from "@/api/hooks";
import { Badge, Icon, Select } from "@/components/ui";
import { clock } from "@/lib/format";
import { useUi } from "@/store/ui";
import { D20Icon } from "./SkillCheckBar";

const QUICK = [4, 6, 8, 10, 12, 20];

export function DicePanel({ view, isDm }: { view: CharacterView; isDm: boolean }) {
  const { character: c } = view;
  const roll = useRoll(c.campaignId);
  const [expr, setExpr] = useState("1d20 + 7");
  const mode = useUi((s) => s.rollMode);
  const setMode = useUi((s) => s.setRollMode);
  const visibility = useUi((s) => s.rollVisibility);
  const setVisibility = useUi((s) => s.setRollVisibility);

  const add = (die: number) => {
    setExpr((e) => {
      const m = new RegExp(`(\\d*)d${die}(?![0-9])`).exec(e);
      if (m) return e.replace(m[0], `${(m[1] ? parseInt(m[1], 10) : 1) + 1}d${die}`);
      return e.trim() ? `${e} + 1d${die}` : `1d${die}`;
    });
  };
  const fire = () => roll.mutate({ characterId: c.id, expression: expr, category: "custom", mode, visibility });

  return (
    <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-cyan)" }}>
      <div className="hud-title mb-2 text-text">Dice roller</div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center border border-cyan/40 bg-bg-0/70">
          <input className="num w-full bg-transparent px-3 py-1.5 text-[1.15rem] outline-none" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fire()} />
          <button type="button" className="border-l border-cyan/30 px-2 text-muted hover:text-text" title="Clear" onClick={() => setExpr("")}>
            <Icon name="eraser" size={14} />
          </button>
        </div>
        <span className="text-crimson">
          <D20Icon size={44} />
        </span>
        <button type="button" className="hud-btn !px-6 !py-2.5 !text-[0.8rem]" disabled={roll.isPending} onClick={fire}>
          Roll
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {QUICK.map((d, i) => (
          <span key={d} className="contents">
            <button type="button" onClick={() => add(d)} className="nav-box !px-3 !py-1 !text-[0.65rem] !tracking-wider" title={`Add a d${d}`}>
              d{d}
            </button>
            {i === 2 && (
              <button type="button" onClick={() => setExpr((e) => (e.trim() ? `${e} + 1` : "1"))} className="nav-box !px-2 !py-1 !text-[0.65rem]" title="Add +1 modifier">
                +
              </button>
            )}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1">
          {(["normal", "advantage", "disadvantage"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={clsx("nav-box !px-2 !py-1 !text-[0.55rem]", mode === m && "active")}>
              {m === "normal" ? "NORM" : m === "advantage" ? "ADV" : "DIS"}
            </button>
          ))}
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="!w-auto !py-1 text-[0.65rem]">
            <option value="public">Public</option>
            <option value="whisper">Whisper DM</option>
            {isDm && <option value="private">Private</option>}
          </Select>
        </span>
      </div>
    </section>
  );
}

const CATEGORY_ICON: Record<string, string> = { skill: "footprints", save: "shield", initiative: "fast-forward", attack: "crosshair", damage: "sword", healing: "heart-pulse", ability: "zap", custom: "dices", deathSave: "skull" };
const CATEGORY_COLOR: Record<string, string> = { skill: "var(--color-crimson)", save: "var(--color-blue)", initiative: "var(--color-amber)", attack: "var(--color-crimson)", damage: "var(--color-crimson)", healing: "var(--color-ok)", ability: "var(--color-amber)", custom: "var(--color-cyan)", deathSave: "var(--color-muted)" };

export function RollHistory({ campaignId, characterId }: { campaignId: string; characterId?: string }) {
  const rolls = useRolls(campaignId);
  const [clearedBefore, setClearedBefore] = useState<string | null>(null);
  const list = (rolls.data ?? []).filter((r) => (!characterId || r.characterId === characterId || !r.characterId) && (!clearedBefore || r.createdAt > clearedBefore)).slice(0, 10);
  return (
    <section className="hud-panel p-3" style={{ ["--panel-accent" as string]: "var(--color-crimson)" }}>
      <div className="hud-title mb-1.5 flex items-center justify-between text-text">
        <span>Roll history</span>
        <button type="button" className="text-[0.6rem] text-muted hover:text-text" onClick={() => setClearedBefore(new Date().toISOString())}>
          Clear
        </button>
      </div>
      {list.length === 0 && <div className="py-2 text-xs text-dim">No rolls yet.</div>}
      {list.map((r) => (
        <RollRow key={r.id} r={r} />
      ))}
    </section>
  );
}

export function RollRow({ r, showName }: { r: DiceRollDto; showName?: boolean }) {
  const detail = r.result.terms
    .map((t) => (t.term.kind === "dice" ? `[${t.dice.map((d) => (d.dropped ? `(${d.value})` : d.value)).join(",")}]` : `${t.term.sign < 0 ? "-" : "+"}${t.term.value}`))
    .join(" ");
  const color = CATEGORY_COLOR[r.category] ?? "var(--color-cyan)";
  const outcome = r.result.isNat20 ? "Crit Success" : r.result.isNat1 ? "Crit Fail" : r.success === true ? "Success" : r.success === false ? "Fail" : null;
  return (
    <div className="flex items-center gap-2 border-b border-line/50 py-1 text-[0.8rem] last:border-0">
      <span className="tile tile-sm" style={{ ["--tile-color" as string]: color, width: 26, height: 26 }}>
        <Icon name={CATEGORY_ICON[r.category] ?? "dices"} size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate text-text/90">
        {showName && <span className="text-cyan">{r.characterName ?? r.username} · </span>}
        {r.label}
      </span>
      <span className="num text-muted" title={detail}>
        {r.result.expression.replace(/\s/g, "")}
      </span>
      <span className="num text-muted">=</span>
      <span className={clsx("num font-bold", r.result.isNat20 ? "text-ok" : r.result.isNat1 ? "text-crimson" : "text-cyan")}>{r.total}</span>
      {outcome && <span className={clsx("text-[0.7rem]", outcome.includes("Success") ? "text-ok" : "text-crimson")}>({outcome})</span>}
      {r.mode !== "normal" && <Badge color={r.mode === "advantage" ? "ok" : "crimson"}>{r.mode === "advantage" ? "ADV" : "DIS"}</Badge>}
      {r.visibility !== "public" && <Badge color="muted">{r.visibility}</Badge>}
      <span className="num w-10 text-right text-[0.65rem] text-dim">{clock(r.createdAt)}</span>
    </div>
  );
}
