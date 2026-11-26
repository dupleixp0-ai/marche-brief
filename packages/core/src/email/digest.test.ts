import { describe, it, expect } from "vitest";
import { buildDigest, computeAlerts } from "./digest";
import type { Snapshot } from "../collect";

const bars = (closes: number[]) => closes.map((close, i) => ({ date: `2026-11-${String(10 + i).padStart(2, "0")}`, close }));
const res = <T>(data: T) => ({ data, source: "test", fetchedAt: "2026-11-26T05:00:00Z", status: "ok" as const });
const score = (decision: "Acheter" | "Attendre" | "Vendre", s: number) =>
  ({ score: s, decision, confidence: "moyenne" as const, factors: [], reasons: [], asOf: "2026-11-25" });

const snap = (vix: number, nvda: "Acheter" | "Attendre" | "Vendre"): Snapshot => ({
  generatedAt: "2026-11-26T05:02:00Z", marketNote: null,
  market: { vix: res({ symbol: "^VIX", bars: bars([20, vix]) }), spx: res({ symbol: "^GSPC", bars: bars([100, 101]) }), fearGreed: res({ value: 20, label: "Peur extrême", homemade: false }) },
  prices: { NVDA: res({ symbol: "NVDA", bars: bars([100, 98]) }), SPY: res({ symbol: "SPY", bars: bars([500, 505]) }) },
  scores: { NVDA: score(nvda, nvda === "Vendre" ? 30 : 50), SPY: score("Attendre", 55) },
  news: res([{ title: "Fed <holds> rates", url: "https://fed/a", source: "Réserve fédérale", publishedAt: "", symbols: [] }]),
  brief: { data: null, source: "Claude", fetchedAt: "", status: "error" as const },
  discoveries: null,
});

describe("alertes", () => {
  it("changement de recommandation", () => {
    expect(computeAlerts(snap(20, "Vendre"), snap(20, "Attendre"))).toEqual([{ kind: "decision", text: "NVDA : Attendre → Vendre (score 30)" }]);
  });
  it("VIX : alerte seulement au franchissement du seuil", () => {
    expect(computeAlerts(snap(32, "Attendre"), snap(25, "Attendre")).map((a) => a.kind)).toEqual(["vix"]);
    expect(computeAlerts(snap(33, "Attendre"), snap(31, "Attendre"))).toEqual([]);
  });
  it("pas d'alerte de décision sans historique", () => {
    expect(computeAlerts(snap(20, "Vendre"), null)).toEqual([]);
  });
});

describe("buildDigest", () => {
  const d = buildDigest(snap(32, "Vendre"), snap(25, "Attendre"), { etfs: ["SPY"], stocks: ["NVDA"], siteUrl: "https://exemple.github.io/marche-brief/" });
  it("objet avec date, alertes et Fear & Greed", () => {
    expect(d.subject).toBe("Marché-Brief · 26 novembre · 2 alerte(s) · Fear & Greed 20");
  });
  it("heure réelle de collecte, titres échappés, lien du dashboard", () => {
    expect(d.html).toContain("06:02");
    expect(d.html).toContain("Fed &lt;holds&gt; rates");
    expect(d.html).not.toContain("<holds>");
    expect(d.html).toContain("https://exemple.github.io/marche-brief/");
    expect(d.text).toContain("NVDA : Attendre → Vendre");
  });
});
