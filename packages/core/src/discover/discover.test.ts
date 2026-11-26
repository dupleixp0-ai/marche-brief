import { describe, it, expect } from "vitest";
import { evaluateCandidate, rankDiscoveries, buildDiscoveries, type UniverseItem, type Discovery } from "./discover";
import type { Bar } from "../types";

const now = new Date("2026-11-26T05:00:00Z");
const mk = (f: (i: number) => number, n = 300, vol = 1_000_000): Bar[] =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(now.getTime() - (n - i) * 864e5).toISOString().slice(0, 10), close: f(i), volume: vol }));
const item: UniverseItem = { ticker: "TEST", name: "Test", type: "stock", region: "Amérique", country: "US", exchange: "NASDAQ/NYSE", sector: "Tech", broker: true };
const base = {
  item, currency: "USD", regionBench: mk(() => 100), worldBench: mk(() => 100),
  eurPerUnit: mk(() => 0.9), vix: 16, fearGreed: 55, minTurnoverEUR: 5_000_000, now,
};

describe("evaluateCandidate", () => {
  it("valeur en hausse : retenue, avec raisons et risque de change", () => {
    const r = evaluateCandidate({ ...base, bars: mk((i) => 100 * 1.003 ** i) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.d.relRegion!).toBeGreaterThan(0);
    expect(r.d.why.length).toBeGreaterThan(0);
    expect(r.d.risks.join(" ")).toContain("dollar");
    expect(r.d.perf3mEUR).toBeCloseTo(r.d.perf3m!, 6); // change stable
  });
  it("conversion en euros : un dollar qui baisse réduit la performance", () => {
    const r = evaluateCandidate({ ...base, bars: mk((i) => 100 * 1.003 ** i), eurPerUnit: mk((i) => 0.95 - i * 0.0005) });
    expect(r.ok && r.d.perf3mEUR! < r.d.perf3m!).toBe(true);
  });
  it("exclut les données périmées, trop courtes ou illiquides", () => {
    const old = mk((i) => 100 + i).map((b) => ({ ...b, date: "2026-01-01" }));
    expect(evaluateCandidate({ ...base, bars: old })).toMatchObject({ ok: false });
    expect(evaluateCandidate({ ...base, bars: mk((i) => 100 + i, 100) })).toMatchObject({ ok: false, reason: "historique insuffisant" });
    expect(evaluateCandidate({ ...base, bars: mk((i) => 100 + i, 300, 10) })).toMatchObject({ ok: false, reason: "liquidité insuffisante" });
  });
  it("cours en pence (Londres) : liquidité convertie correctement", () => {
    const r = evaluateCandidate({ ...base, currency: "GBp", bars: mk(() => 2000, 300, 400_000) }); // 400k × 20 £ × 0,9 = 7,2 M€
    expect(r.ok).toBe(true);
  });
});

describe("rankDiscoveries", () => {
  const d = (ticker: string, score: number, country: string, sector: string): Discovery => ({
    ticker, name: ticker, type: "stock", region: "Europe", country, exchange: "XETRA", sector, currency: "EUR",
    score, decision: "Acheter", factors: [{ key: "risk", label: "Risque", score: 60, weight: 0.15, reason: "" }],
    lastClose: 1, lastDate: "2026-11-25", marketOpen: false, perf3m: 0.1, perf3mEUR: 0.1, relRegion: 0.05, relWorld: 0.05,
    breakout: false, buyable: true, spark: [], why: [], risks: [],
  });
  it("au plus 2 par pays et 2 par secteur", () => {
    const top = rankDiscoveries([d("A", 90, "DE", "Tech"), d("B", 89, "DE", "Tech"), d("C", 88, "DE", "Santé"), d("D", 87, "FR", "Tech"), d("E", 80, "FR", "Santé"), d("F", 70, "NL", "Énergie")]);
    expect(top.map((x) => x.ticker)).toEqual(["A", "B", "E", "F"]);
  });
  it("exclut la force relative négative", () => {
    expect(rankDiscoveries([{ ...d("A", 90, "DE", "Tech"), relRegion: -0.01 }])).toHaveLength(0);
  });
  it("buildDiscoveries garde la liste des exclusions", () => {
    const b = buildDiscoveries([{ ok: false, ticker: "X", reason: "liquidité insuffisante" }, { ok: true, d: d("A", 90, "DE", "Tech") }], now);
    expect(b.excluded).toEqual([{ ticker: "X", reason: "liquidité insuffisante" }]);
    expect(b.stocks.map((x) => x.ticker)).toEqual(["A"]);
  });
});
