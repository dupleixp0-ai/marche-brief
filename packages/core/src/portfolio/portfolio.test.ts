import { describe, expect, it } from "vitest";
import { estimateTax, evaluatePortfolio, positionReading, validateHolding, DE_TAX_RATE } from "./portfolio";

const bars = (closes: number[]) => closes.map((close, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close }));

describe("portefeuille", () => {
  const market = {
    ETF: { bars: bars([100, 110]), currency: "EUR", isEtf: true, decision: "Attendre" as const, score: 50 },
    US: { bars: bars([50, 60]), currency: "USD", decision: "Vendre" as const, score: 20 },
  };
  const rates = { USD: [{ date: "2026-01-01", close: 1.2 }] };
  const p = evaluatePortfolio([
    { ticker: "ETF", shares: 10, avgPrice: 80 },
    { ticker: "US", shares: 12, avgPrice: 40 },
    { ticker: "ABSENT", shares: 1, avgPrice: 1 },
  ], market, rates);
  const row = (t: string) => p.rows.find((r) => r.ticker === t)!;

  it("valeur, coût et gain en euros", () => {
    expect(row("ETF").value).toBe(1100);
    expect(row("ETF").pnl).toBe(300);
    expect(row("ETF").pnlPct).toBeCloseTo(0.375);
    expect(row("US").value).toBeCloseTo(600); // 12 × 60 $ / 1,2
    expect(row("US").pnl).toBeCloseTo(120);
    expect(p.value).toBeCloseTo(1700);
    expect(p.pnl).toBeCloseTo(420);
  });
  it("variation du jour et poids", () => {
    expect(row("ETF").dayPnl).toBe(100);
    expect(row("ETF").weight).toBeCloseTo(1100 / 1700);
  });
  it("valeur sans cours : signalée, exclue des totaux", () => {
    expect(p.missing).toEqual(["ABSENT"]);
    expect(row("ABSENT").value).toBeNull();
  });
  it("impôt : exonération de 30 % pour un fonds actions, abattement 1000 €", () => {
    expect(row("ETF").taxableGain).toBeCloseTo(210);
    expect(row("US").taxableGain).toBeCloseTo(120);
    expect(p.tax.tax).toBe(0); // 330 € < 1000 €
    expect(estimateTax(3000, 1000).tax).toBeCloseTo(2000 * DE_TAX_RATE);
    expect(estimateTax(-500).tax).toBe(0);
  });
  it("lecture : Vendre → Alléger, avec raisons", () => {
    expect(row("US").reading).toBe("Alléger");
    expect(row("US").reasons[0]).toContain("tendance dégradée");
  });
  it("lecture : concentration élevée → Alléger même sans signal de vente", () => {
    expect(row("ETF").reading).toBe("Alléger");
    expect(row("ETF").reasons.join(" ")).toContain("concentration");
  });
  it("lecture : Acheter avec poids faible → Renforcer ; Acheter mais lourd → Conserver", () => {
    expect(positionReading({ decision: "Acheter", score: 70, pnlPct: 0.1, weight: 0.1, aboveMa200: true }).reading).toBe("Renforcer");
    expect(positionReading({ decision: "Acheter", score: 70, pnlPct: 0.1, weight: 0.5, aboveMa200: true }).reading).toBe("Conserver");
    expect(positionReading({ decision: "Attendre", score: 50, pnlPct: 0.6, weight: 0.1, aboveMa200: false }).reasons.join(" ")).toMatch(/sécuriserait.*|moyenne 200/);
  });
  it("validation de la saisie", () => {
    expect(validateHolding({ ticker: "EUNL.DE", shares: 3.5, avgPrice: 90 })).toBeNull();
    expect(validateHolding({ ticker: "EUNL.DE", shares: 0, avgPrice: 90 })).toContain("parts");
    expect(validateHolding({ ticker: "x y", shares: 1, avgPrice: 1 })).toContain("Symbole");
  });
});
