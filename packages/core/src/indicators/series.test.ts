import { describe, it, expect } from "vitest";
import { rsi, returnOver, volatility, drawdown, smaSlope } from "./series";

describe("rsi", () => {
  it("100 si uniquement des hausses", () => {
    expect(rsi(Array.from({ length: 20 }, (_, i) => 100 + i))).toBe(100);
  });
  it("valeur de référence (série classique de Wilder)", () => {
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsi(c)!).toBeCloseTo(70.5, 0);
  });
  it("null si trop court", () => {
    expect(rsi([1, 2, 3])).toBeNull();
  });
});

describe("rendements et risque", () => {
  it("returnOver", () => {
    expect(returnOver([100, 105, 110], 2)).toBeCloseTo(0.1);
  });
  it("volatility nulle si prix constants", () => {
    expect(volatility(Array(30).fill(50), 20)).toBe(0);
  });
  it("drawdown depuis le plus haut", () => {
    expect(drawdown([100, 120, 90])).toBeCloseTo(-0.25);
  });
  it("pente positive en tendance haussière", () => {
    expect(smaSlope(Array.from({ length: 100 }, (_, i) => 100 + i))!).toBeGreaterThan(0);
  });
});
