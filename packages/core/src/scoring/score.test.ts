import { describe, it, expect } from "vitest";
import { scoreAsset, decide, rawDecision, etfReading, confidenceOf, DEFAULT_RULES, V1_RULES } from "./score";

// Séries synthétiques figées : hausse régulière / baisse régulière / plat.
const up = Array.from({ length: 300 }, (_, i) => 100 * 1.002 ** i);
const down = Array.from({ length: 300 }, (_, i) => 100 * 0.998 ** i);
const flat = Array(300).fill(100);

describe("scoreAsset", () => {
  it("tendance haussière → Acheter, avec 3 à 5 raisons", () => {
    const r = scoreAsset({ closes: up, benchCloses: flat, vix: 14, fearGreed: 60 });
    expect(r.decision).toBe("Acheter");
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r.reasons.length).toBeLessThanOrEqual(5);
    expect(r.factors).toHaveLength(6);
  });
  it("tendance baissière → Vendre", () => {
    const r = scoreAsset({ closes: down, benchCloses: flat, vix: 30, fearGreed: 25 });
    expect(r.decision).toBe("Vendre");
  });
  it("score borné entre 0 et 100", () => {
    const r = scoreAsset({ closes: down, benchCloses: up, vix: 80, fearGreed: 0 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("l'actualité seule ne change jamais la décision", () => {
    const base = { closes: flat.map((x, i) => x + (i > 280 ? 3 : 0)), benchCloses: flat, vix: 18, fearGreed: 50 };
    const neutral = scoreAsset(base).decision;
    expect(scoreAsset({ ...base, newsSentiment: 1 }).decision).toBe(neutral);
    expect(scoreAsset({ ...base, newsSentiment: -1 }).decision).toBe(neutral);
  });
});

describe("décision et hystérésis", () => {
  it("seuils bruts", () => {
    expect(rawDecision(65)).toBe("Acheter");
    expect(rawDecision(50)).toBe("Attendre");
    expect(rawDecision(39)).toBe("Vendre");
  });
  it("Attendre → Acheter exige 65 + 3", () => {
    expect(decide(66, "Attendre")).toBe("Attendre");
    expect(decide(68, "Attendre")).toBe("Acheter");
  });
  it("Acheter reste Acheter jusqu'à 62", () => {
    expect(decide(63, "Acheter")).toBe("Acheter");
    expect(decide(61, "Acheter")).toBe("Attendre");
  });
  it("Vendre → Attendre exige 40 + 3", () => {
    expect(decide(41, "Vendre")).toBe("Vendre");
    expect(decide(43, "Vendre")).toBe("Attendre");
  });
  it("confiance selon la distance aux seuils", () => {
    expect(confidenceOf(90)).toBe("élevée");
    expect(confidenceOf(66)).toBe("faible");
  });
  it("lecture ETF", () => {
    expect(etfReading("Vendre")).toContain("Réduire");
  });
});

describe("règles MM200", () => {
  // Chute récente mais cours encore au-dessus de la MM200.
  const c = [...Array.from({ length: 280 }, (_, i) => 100 * 1.004 ** i), ...Array.from({ length: 20 }, (_, i) => 306 * 0.985 ** i)];
  const inp = { closes: c, benchCloses: Array(300).fill(100), vix: 30, fearGreed: 20 };
  it("sans règle → Vendre ; avec règle → Attendre tant que le cours est au-dessus de la MM200", () => {
    expect(scoreAsset(inp, null, undefined, {}).decision).toBe("Vendre");
    expect(scoreAsset(inp, null, undefined, { sellNeedsBelowMA200: true }).decision).toBe("Attendre");
  });
});

describe("règles v2 : baisse confirmée", () => {
  const bench = Array(300).fill(100);
  it("sous la MM200 mais en hausse sur 6 mois → Attendre, pas Vendre", () => {
    // Forte hausse puis rechute récente sous la MM200 ; le cours reste au-dessus de celui d'il y a 6 mois.
    const c = [...Array(150).fill(50), ...Array.from({ length: 110 }, (_, i) => 50 * 1.012 ** i), ...Array.from({ length: 40 }, (_, i) => 185 * 0.975 ** i)];
    const inp = { closes: c, benchCloses: bench, vix: 30, fearGreed: 20 };
    expect(scoreAsset(inp, null, undefined, V1_RULES).decision).toBe("Vendre");
    expect(scoreAsset(inp, null, undefined, DEFAULT_RULES).decision).toBe("Attendre");
  });
  it("baisse longue et confirmée → Vendre", () => {
    expect(scoreAsset({ closes: down, benchCloses: flat, vix: 30, fearGreed: 25 }).decision).toBe("Vendre");
  });
  it("juste sous la MM200 (moins de 2 %) → Attendre", () => {
    const c = [...Array(200).fill(100), ...Array.from({ length: 100 }, (_, i) => 100 * 0.9999 ** i)];
    expect(scoreAsset({ closes: c, benchCloses: bench, vix: 35, fearGreed: 10 }, "Acheter").decision).not.toBe("Vendre");
  });
  it("après Vendre, retour à Acheter dès que le cours repasse la MM200 avec un score ≥ 50", () => {
    const c = [...Array.from({ length: 200 }, (_, i) => 100 * 0.999 ** i), ...Array.from({ length: 100 }, (_, i) => 82 * 1.004 ** i)];
    const r = scoreAsset({ closes: c, benchCloses: bench, vix: 15, fearGreed: 55 }, "Vendre");
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.decision).toBe("Acheter");
  });
});
