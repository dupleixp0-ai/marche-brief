import { describe, it, expect } from "vitest";
import { evaluateTrackRecord } from "./track";

const bars = (closes: number[]) => closes.map((close, i) => ({ date: `d${String(i).padStart(2, "0")}`, close }));
const up = bars(Array.from({ length: 30 }, (_, i) => 100 + i));
const down = bars(Array.from({ length: 30 }, (_, i) => 100 - i));
const flat = bars(Array(30).fill(100));

describe("evaluateTrackRecord", () => {
  it("compte les réussites à l'horizon et ignore les doublons", () => {
    const day = (decA: "Acheter" | "Vendre") => ({
      generatedAt: "2026-01-01T05:00:00Z",
      recommendations: { UP: { decision: decA, score: 70, asOf: "d00" }, DOWN: { decision: "Vendre" as const, score: 30, asOf: "d00" } },
    });
    const r = evaluateTrackRecord([day("Acheter"), day("Acheter")], { UP: up, DOWN: down, SPY: flat }, 21);
    expect(r.evaluated).toBe(2);
    expect(r.byDecision.Acheter).toMatchObject({ n: 1, hits: 1, hitRate: 1, beatSpy: 1 });
    expect(r.byDecision.Vendre).toMatchObject({ n: 1, hits: 1, hitRate: 1 });
    expect(r.since).toBe("d00");
  });
  it("trop récent → rien d'évalué", () => {
    const r = evaluateTrackRecord([{ generatedAt: "x", recommendations: { UP: { decision: "Acheter", score: 70, asOf: "d20" } } }], { UP: up }, 21);
    expect(r.evaluated).toBe(0);
    expect(r.byDecision.Acheter.hitRate).toBeNull();
  });
});
