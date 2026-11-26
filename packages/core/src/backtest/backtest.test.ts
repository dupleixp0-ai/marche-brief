import { describe, it, expect } from "vitest";
import { backtest, perfStats, alignTo, summarize } from "./backtest";
import type { Bar } from "../types";

const mk = (closes: number[]): Bar[] =>
  closes.map((close, i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), close }));

describe("perfStats", () => {
  it("rendement total et pire baisse", () => {
    const s = perfStats([0.1, -0.5, 0.2]);
    expect(s.totalReturn).toBeCloseTo(1.1 * 0.5 * 1.2 - 1);
    expect(s.maxDrawdown).toBeCloseTo(-0.5);
  });
});

describe("alignTo", () => {
  it("reprend la dernière valeur connue", () => {
    expect(alignTo(["2020-01-02", "2020-01-04"], mk([10, 11, 12]))).toEqual([11, 12]);
  });
});

describe("backtest", () => {
  // Hausse puis krach puis reprise : la stratégie doit sortir pendant la baisse.
  const path = [
    ...Array.from({ length: 400 }, (_, i) => 100 * 1.001 ** i),
    ...Array.from({ length: 200 }, (_, i) => 149 * 0.996 ** i),
    ...Array.from({ length: 200 }, (_, i) => 67 * 1.002 ** i),
  ];
  const bars = mk(path);
  const bench = mk(Array(path.length).fill(100));
  const vix = mk(Array(path.length).fill(18));
  const r = backtest("TEST", bars, bench, vix);

  it("limite la pire baisse par rapport à l'achat-conservation", () => {
    expect(r.strategy.maxDrawdown).toBeGreaterThan(r.buyHold.maxDrawdown);
    expect(r.trades).toBeGreaterThan(0);
  });
  it("résume et rend un verdict", () => {
    const s = summarize([r]);
    expect(s.assets).toBe(1);
    expect(s.verdict.length).toBeGreaterThan(10);
  });
  it("refuse un historique trop court", () => {
    expect(() => backtest("X", mk([1, 2, 3]), bench, vix)).toThrow();
  });
});
