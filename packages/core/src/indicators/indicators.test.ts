import { describe, it, expect } from "vitest";
import { sma } from "./sma";
import { homemadeFearGreed } from "./fearGreed";

describe("sma", () => {
  it("moyenne des n dernières valeurs", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });
  it("null si pas assez de données", () => {
    expect(sma([1, 2], 3)).toBeNull();
  });
});

describe("Fear & Greed maison", () => {
  const flat = Array(130).fill(100);
  it("VIX moyen et marché à plat → neutre", () => {
    expect(homemadeFearGreed(24.5, flat).value).toBe(50);
  });
  it("VIX bas et marché au-dessus de sa MM125 → avidité", () => {
    const up = [...flat.slice(0, 129), 110];
    expect(homemadeFearGreed(12, up).value).toBeGreaterThan(75);
  });
  it("VIX élevé → peur, borné à 0", () => {
    const r = homemadeFearGreed(60, [...flat.slice(0, 129), 80]);
    expect(r.value).toBe(0);
    expect(r.homemade).toBe(true);
  });
});

import { dailyChangePct } from "./change";
describe("dailyChangePct", () => {
  it("variation entre deux séances", () => {
    expect(dailyChangePct([{ date: "a", close: 100 }, { date: "b", close: 102 }])).toBeCloseTo(2);
  });
  it("null avec une seule séance", () => {
    expect(dailyChangePct([{ date: "a", close: 100 }])).toBeNull();
  });
});
