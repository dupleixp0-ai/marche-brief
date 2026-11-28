import { describe, it, expect } from "vitest";
import { timingOf, classifyTiming, annualVol, marketFearSeries, timingStudy, TIMING_RULES } from "./timing";
import type { Bar } from "../types";

// Séries figées : légère oscillation pour avoir une volatilité non nulle.
const wave = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i) * (1 + 0.005 * Math.sin(i)));
const flat = wave(260, () => 100);
const rocket = wave(260, (i) => (i < 200 ? 100 : 100 * 1.012 ** (i - 199))); // +100 % en 60 séances
const crash = wave(260, (i) => (i < 245 ? 100 : 100 * 0.97 ** (i - 244))); // chute récente → RSI bas

describe("moment d'entrée", () => {
  it("neutre sans peur, sans survente ni hausse étirée", () => {
    expect(timingOf(flat, 50)?.moment).toBe("neutre");
  });
  it("peur sur le marché (≤ 25) → favorable", () => {
    const t = timingOf(flat, 20)!;
    expect(t.moment).toBe("favorable");
    expect(t.reasons[0]).toContain("Peur");
  });
  it("valeur survendue (RSI < 30) → favorable même sans peur", () => {
    const t = timingOf(crash, 50)!;
    expect(t.rsi!).toBeLessThan(TIMING_RULES.oversoldRsi);
    expect(t.moment).toBe("favorable");
  });
  it("plus de 50 % au-dessus de la MM200 → hausse étirée, même en période de peur", () => {
    const t = timingOf(rocket, 10)!;
    expect(t.ext).toBeGreaterThan(0.5);
    expect(t.moment).toBe("etire");
  });
  it("seuils exacts", () => {
    const f = { ext: 0.5, vol: 0.3, rsi: 50, marketFear: 26 };
    expect(classifyTiming(f)).toBe("neutre");
    expect(classifyTiming({ ...f, marketFear: 25 })).toBe("favorable");
    expect(classifyTiming({ ...f, ext: 0.51, marketFear: 25 })).toBe("etire");
    expect(classifyTiming({ ...f, rsi: 29.9 })).toBe("favorable");
  });
  it("affiche les statistiques historiques quand elles existent", () => {
    const t = timingOf(flat, 20, { favorable: { n: 100, avg63: 0.09, hit63: 0.68, loss15: 0.07 }, all: { n: 1000, avg63: 0.04, hit63: 0.59, loss15: 0.08 } })!;
    expect(t.reasons.at(-1)).toContain("+9 %");
    expect(t.reasons.at(-1)).toContain("68 %");
  });
  it("historique trop court → pas de signal", () => {
    expect(timingOf(flat.slice(0, 150), 20)).toBeNull();
  });
  it("volatilité annualisée nulle pour une série constante", () => {
    expect(annualVol(Array(100).fill(10))).toBe(0);
  });
});

describe("étude historique", () => {
  const dates = Array.from({ length: 600 }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
  const bars = (f: (i: number) => number): Bar[] => dates.map((date, i) => ({ date, close: f(i) * (1 + 0.004 * Math.sin(i)) }));
  const spx = bars((i) => 100 + i * 0.05), vix = bars(() => 15);
  it("indice de peur maison aligné sur les dates", () => {
    const s = marketFearSeries(dates, vix, spx);
    expect(s[10]).toBeNull();
    expect(s[300]).toBeGreaterThan(50);
  });
  it("compte chaque jour une seule fois par moment, et le total", () => {
    const st = timingStudy({ A: bars((i) => 100 + i * 0.1) }, vix, spx, new Date("2026-01-01"));
    const sum = (["favorable", "neutre", "etire"] as const).reduce((s, k) => s + (st.stats[k]?.n ?? 0), 0);
    expect(st.assets).toBe(1);
    expect(sum).toBe(st.stats.all!.n);
    expect(st.stats.all!.avg63).toBeGreaterThan(0);
  });
});
