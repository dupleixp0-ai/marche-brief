import { describe, it, expect } from "vitest";
import { marketSummary } from "./summary";
import { smaSeries } from "../indicators/sma";

describe("smaSeries", () => {
  it("MM glissante", () => {
    expect(smaSeries([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
});

describe("marketSummary", () => {
  it("marché nerveux et tendance dégradée", () => {
    const r = marketSummary({
      vixCloses: [...Array(60).fill(15), 25],
      spxCloses: [...Array(130).fill(100), 90],
      fearGreed: 15,
    });
    expect(r.sentence).toContain("nerveux");
    expect(r.sentence).toContain("sous sa moyenne 125 jours");
    expect(r.sentence).toContain("peur extrême");
  });
  it("sans données", () => {
    expect(marketSummary({ vixCloses: [], spxCloses: [], fearGreed: null }).sentence).toBe("Données de marché indisponibles.");
  });
});
