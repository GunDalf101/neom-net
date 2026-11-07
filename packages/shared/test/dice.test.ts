import { describe, expect, it } from "vitest";
import { d20Expression, parseDiceExpression, roll, secureDie } from "../src/index.js";

describe("dice parsing", () => {
  it("parses standard forms", () => {
    expect(parseDiceExpression("1d20+5").terms).toEqual([
      { kind: "dice", count: 1, sides: 20, sign: 1 },
      { kind: "flat", value: 5, sign: 1 },
    ]);
    expect(parseDiceExpression("d20").terms[0]).toMatchObject({ count: 1, sides: 20 });
    expect(parseDiceExpression("2d6 + 1d4 - 1").terms).toHaveLength(3);
    expect(parseDiceExpression("4d6kh3").terms[0]).toMatchObject({ keepHighest: 3 });
  });
  it("rejects garbage and oversized rolls", () => {
    expect(() => parseDiceExpression("")).toThrow();
    expect(() => parseDiceExpression("1d20; drop table")).toThrow();
    expect(() => parseDiceExpression("1000d6")).toThrow();
    expect(() => parseDiceExpression("1d99999")).toThrow();
  });
  it("builds d20 expressions", () => {
    expect(d20Expression(0)).toBe("1d20");
    expect(d20Expression(7)).toBe("1d20+7");
    expect(d20Expression(-1)).toBe("1d20-1");
  });
});

describe("rolling", () => {
  it("uses the injected RNG deterministically", () => {
    const seq = [20, 3, 4];
    let i = 0;
    const r = roll("1d20+2d6+1", "normal", () => seq[i++] as number);
    expect(r.total).toBe(28);
    expect(r.isNat20).toBe(true);
    expect(r.naturalRoll).toBe(20);
  });
  it("applies advantage and disadvantage to the leading d20", () => {
    const adv = roll("1d20+3", "advantage", (() => {
      const seq = [5, 17];
      let i = 0;
      return () => seq[i++] as number;
    })());
    expect(adv.total).toBe(20);
    expect(adv.alternates).toEqual({ kept: 17, discarded: 5 });
    const dis = roll("1d20+3", "disadvantage", (() => {
      const seq = [5, 17];
      let i = 0;
      return () => seq[i++] as number;
    })());
    expect(dis.total).toBe(8);
    expect(dis.isNat1).toBe(false);
  });
  it("keeps highest dice", () => {
    const seq = [1, 6, 5, 2];
    let i = 0;
    const r = roll("4d6kh3", "normal", () => seq[i++] as number);
    expect(r.total).toBe(13);
    expect(r.terms[0]?.dice.filter((d) => d.dropped)).toHaveLength(1);
  });
  it("secure die stays within bounds", () => {
    for (let n = 0; n < 500; n++) {
      const v = secureDie(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
    expect(() => secureDie(0)).toThrow();
  });
});
