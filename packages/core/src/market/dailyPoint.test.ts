import { describe, expect, it } from "vitest";
import { dailyPoint } from "./dailyPoint";
import { marketOutlook } from "./outlook";

const series = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ date: `2026-${String(1 + Math.floor(i / 28) % 12).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, close: f(i) }));

describe("point du jour", () => {
  const spx = series(200, (i) => 100 + i);
  const vix = series(60, (i) => (i === 59 ? 32 : 18));
  const etfUp = { ticker: "A", name: "ETF A", bars: series(30, (i) => 10 + i * 0.1), decision: "Attendre" };
  const etfDown = { ticker: "B", name: "ETF B", bars: series(30, (i) => 20 - i * 0.1), decision: "Vendre" };
  const pts = dailyPoint({
    spx, vix, fearGreed: { value: 12, label: "Peur extrême" },
    outlook: marketOutlook({ spxCloses: spx.map((b) => b.close), vixCloses: vix.map((b) => b.close), fearGreed: 12 }),
    marketNote: null, etfs: [etfUp, etfDown], stocks: [{ ticker: "NVDA", bars: series(5, (i) => (i === 4 ? 110 : 100)), decision: "Acheter" }],
  });
  const by = (t: string) => pts.find((p) => p.topic === t)!;

  it("décrit le marché avec les chiffres", () => {
    expect(by("Marché").text).toContain("S&P 500 monte");
    expect(by("Marché").text).toContain("au-dessus de sa moyenne 6 mois");
  });
  it("nervosité et peur extrême", () => {
    expect(by("Nervosité").text).toContain("très élevée");
    expect(by("Nervosité").text).toContain("peur extrême");
    expect(by("Nervosité").tone).toBe("warn");
  });
  it("ETF : meilleur et plus faible", () => {
    expect(by("Mes ETF").text).toContain("1 sur 2 en hausse");
    expect(by("Mes ETF").text).toContain("ETF A");
  });
  it("signaux et action marquante", () => {
    expect(by("Signaux").text).toContain("1 Acheter, 1 Attendre, 1 Vendre");
    expect(by("Actions").text).toContain("NVDA (+10,0 %)");
  });
  it("sans données : rien d'inventé", () => {
    expect(dailyPoint({ spx: [], vix: [], fearGreed: null, outlook: null, marketNote: null, etfs: [], stocks: [] })).toEqual([]);
  });
});
