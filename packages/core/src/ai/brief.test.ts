import { describe, it, expect } from "vitest";
import { sanitizeBrief, buildBriefPrompt } from "./brief";

const news = [
  { title: "Fed holds rates", url: "https://fed/a", source: "Réserve fédérale", publishedAt: "2026-11-25T19:00:00Z", symbols: [] },
  { title: "Nvidia beats", url: "https://x/n", source: "Reuters", publishedAt: "2026-11-25T10:00:00Z", symbols: ["NVDA"] },
];
const meta = { generatedAt: "2026-11-26T05:00:00Z", model: "m", newsHash: "h" };

describe("sanitizeBrief", () => {
  it("borne le sentiment, ignore les symboles inconnus et les sources inexistantes", () => {
    const b = sanitizeBrief({
      bullets: [{ text: " La Fed maintient ses taux ", sources: [0, 0, 9] }],
      sentiments: [{ symbol: "NVDA", value: 3, reason: "résultats" }, { symbol: "FAKE", value: 0.5, reason: "?" }],
      explanations: [{ symbol: "NVDA", text: "Tendance dégradée." }, { symbol: "FAKE", text: "x" }],
    }, news, ["NVDA", "MSFT"], meta);
    expect(b.bullets).toEqual([{ text: "La Fed maintient ses taux", links: [{ title: "Fed holds rates", url: "https://fed/a" }] }]);
    expect(b.sentiments).toEqual({ NVDA: { value: 1, reason: "résultats" } });
    expect(Object.keys(b.explanations)).toEqual(["NVDA"]);
  });
  it("au plus 8 puces", () => {
    const b = sanitizeBrief({ bullets: Array(12).fill({ text: "x", sources: [] }) }, news, [], meta);
    expect(b.bullets).toHaveLength(8);
  });
});

describe("buildBriefPrompt", () => {
  it("numérote les actualités et liste les valeurs", () => {
    const p = buildBriefPrompt(news, [{ symbol: "NVDA", decision: "Vendre", reasons: ["Tendance : en baisse"] }]);
    expect(p).toContain("[1] 2026-11-25 · Reuters · NVDA · Nvidia beats");
    expect(p).toContain("NVDA : Vendre — Tendance : en baisse");
  });
});
