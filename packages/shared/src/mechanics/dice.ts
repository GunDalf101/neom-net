/**
 * Dice engine. Uses the platform CSPRNG (Web Crypto, available in Node >= 19 and browsers)
 * with rejection sampling so every face is equally likely.
 */

export interface DiceTerm {
  kind: "dice";
  count: number;
  sides: number;
  /** keep highest n (e.g. 4d6kh3) */
  keepHighest?: number;
  keepLowest?: number;
  sign: 1 | -1;
}
export interface FlatTerm {
  kind: "flat";
  value: number;
  sign: 1 | -1;
}
export type DiceExpressionTerm = DiceTerm | FlatTerm;

export interface DiceExpression {
  terms: DiceExpressionTerm[];
  source: string;
}

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface RolledDie {
  sides: number;
  value: number;
  dropped?: boolean;
}

export interface RolledTerm {
  term: DiceExpressionTerm;
  dice: RolledDie[];
  subtotal: number;
}

export interface RollResult {
  expression: string;
  mode: RollMode;
  terms: RolledTerm[];
  /** For advantage/disadvantage on a single d20 term: both candidate d20 values. */
  alternates?: { kept: number; discarded: number };
  total: number;
  naturalRoll?: number;
  isNat20: boolean;
  isNat1: boolean;
}

export const MAX_DICE_PER_ROLL = 100;
export const MAX_SIDES = 1000;

export type RandomSource = (sides: number) => number;

interface CryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

let cachedCrypto: CryptoLike | undefined;
function getCrypto(): CryptoLike {
  if (cachedCrypto) return cachedCrypto;
  const c = (globalThis as unknown as { crypto?: CryptoLike }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Web Crypto is not available in this environment");
  }
  cachedCrypto = c;
  return c;
}

/** Unbiased integer in [1, sides] via rejection sampling on a 32-bit draw. */
export function secureDie(sides: number): number {
  if (!Number.isInteger(sides) || sides < 1 || sides > MAX_SIDES) {
    throw new Error(`Invalid die size: ${sides}`);
  }
  if (sides === 1) return 1;
  const buf = new Uint32Array(1);
  const range = 0x1_0000_0000;
  const limit = range - (range % sides);
  const crypto = getCrypto();
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return (v % sides) + 1;
  }
}

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i;

/** Parses expressions like "1d20+5", "2d6 + 1d4 - 1", "d20", "4d6kh3", "+7" (treated as 1d20+7 by callers). */
export function parseDiceExpression(input: string): DiceExpression {
  const cleaned = input.replace(/\s+/g, "").toLowerCase();
  if (!cleaned) throw new Error("Empty dice expression");
  if (!/^[0-9dkhl+\-]+$/.test(cleaned)) throw new Error(`Invalid characters in dice expression: ${input}`);

  const terms: DiceExpressionTerm[] = [];
  let i = 0;
  let sign: 1 | -1 = 1;
  let totalDice = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === "+") {
      sign = 1;
      i++;
      continue;
    }
    if (ch === "-") {
      sign = -1;
      i++;
      continue;
    }
    let j = i;
    while (j < cleaned.length && cleaned[j] !== "+" && cleaned[j] !== "-") j++;
    const token = cleaned.slice(i, j);
    i = j;
    if (!token) throw new Error(`Malformed dice expression: ${input}`);
    const m = TERM_RE.exec(token);
    if (m) {
      const count = m[1] ? parseInt(m[1], 10) : 1;
      const sides = parseInt(m[2] as string, 10);
      if (count < 1 || count > MAX_DICE_PER_ROLL) throw new Error(`Dice count out of range: ${token}`);
      if (sides < 1 || sides > MAX_SIDES) throw new Error(`Die size out of range: ${token}`);
      totalDice += count;
      if (totalDice > MAX_DICE_PER_ROLL) throw new Error(`Too many dice in one roll (max ${MAX_DICE_PER_ROLL})`);
      const term: DiceTerm = { kind: "dice", count, sides, sign };
      if (m[3] && m[4]) {
        const n = parseInt(m[4], 10);
        if (n < 1 || n > count) throw new Error(`Keep count out of range: ${token}`);
        if (m[3] === "kh") term.keepHighest = n;
        else term.keepLowest = n;
      }
      terms.push(term);
    } else if (/^\d+$/.test(token)) {
      terms.push({ kind: "flat", value: parseInt(token, 10), sign });
    } else {
      throw new Error(`Unrecognized dice term: ${token}`);
    }
    sign = 1;
  }
  if (terms.length === 0) throw new Error("Empty dice expression");
  return { terms, source: input.trim() };
}

export function formatDiceExpression(expr: DiceExpression): string {
  return expr.terms
    .map((t, idx) => {
      const body =
        t.kind === "dice"
          ? `${t.count}d${t.sides}${t.keepHighest ? `kh${t.keepHighest}` : ""}${t.keepLowest ? `kl${t.keepLowest}` : ""}`
          : `${t.value}`;
      if (idx === 0) return t.sign < 0 ? `-${body}` : body;
      return `${t.sign < 0 ? " - " : " + "}${body}`;
    })
    .join("");
}

function rollTerm(term: DiceTerm, rng: RandomSource): RolledTerm {
  const dice: RolledDie[] = [];
  for (let k = 0; k < term.count; k++) dice.push({ sides: term.sides, value: rng(term.sides) });
  if (term.keepHighest || term.keepLowest) {
    const sorted = [...dice].sort((a, b) => b.value - a.value);
    const keep = term.keepHighest ?? term.keepLowest ?? dice.length;
    const kept = term.keepHighest ? sorted.slice(0, keep) : sorted.slice(sorted.length - keep);
    const keptSet = new Set(kept);
    for (const d of dice) if (!keptSet.has(d)) d.dropped = true;
  }
  const subtotal = term.sign * dice.filter((d) => !d.dropped).reduce((s, d) => s + d.value, 0);
  return { term, dice, subtotal };
}

/**
 * Roll a parsed expression. Advantage/disadvantage applies when the expression's first dice term is
 * a single d20: that die is rolled twice and the higher/lower is kept.
 */
export function rollExpression(
  expr: DiceExpression,
  mode: RollMode = "normal",
  rng: RandomSource = secureDie,
): RollResult {
  const terms: RolledTerm[] = [];
  let alternates: RollResult["alternates"];
  let naturalRoll: number | undefined;
  let first = true;
  for (const term of expr.terms) {
    if (term.kind === "flat") {
      terms.push({ term, dice: [], subtotal: term.sign * term.value });
      continue;
    }
    const isD20 = term.sides === 20 && term.count === 1 && !term.keepHighest && !term.keepLowest;
    if (first && isD20 && mode !== "normal") {
      const a = rng(20);
      const b = rng(20);
      const kept = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
      const discarded = kept === a ? b : a;
      alternates = { kept, discarded };
      naturalRoll = kept;
      terms.push({
        term,
        dice: [
          { sides: 20, value: kept },
          { sides: 20, value: discarded, dropped: true },
        ],
        subtotal: term.sign * kept,
      });
    } else {
      const rolled = rollTerm(term, rng);
      if (first && isD20) naturalRoll = rolled.dice[0]?.value;
      terms.push(rolled);
    }
    first = false;
  }
  const total = terms.reduce((s, t) => s + t.subtotal, 0);
  return {
    expression: formatDiceExpression(expr),
    mode,
    terms,
    alternates,
    total,
    naturalRoll,
    isNat20: naturalRoll === 20,
    isNat1: naturalRoll === 1,
  };
}

export function roll(expression: string, mode: RollMode = "normal", rng?: RandomSource): RollResult {
  return rollExpression(parseDiceExpression(expression), mode, rng);
}

/** Convenience: build "1d20+N" / "1d20-N". */
export function d20Expression(modifier: number): string {
  if (modifier === 0) return "1d20";
  return modifier > 0 ? `1d20+${modifier}` : `1d20-${Math.abs(modifier)}`;
}
