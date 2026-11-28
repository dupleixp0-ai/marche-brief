import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseYahooChart } from "./yahoo";
import { parseStooqCsv, toStooqSymbol } from "./stooq";
import { parseFredCsv } from "./fred";
import { parseCnnFearGreed, fearGreedLabel, fearGreedTone } from "./cnn";

const fx = (f: string) => readFileSync(new URL(`../__fixtures__/${f}`, import.meta.url), "utf8");

describe("Yahoo", () => {
  it("lit les clôtures et ignore les séances vides", () => {
    const s = parseYahooChart(fx("yahoo-nvda.json"), "NVDA");
    expect(s.currency).toBe("USD");
    expect(s.bars.map((b) => b.close)).toEqual([180.5, 182.25]);
    expect(s.bars[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("rejette une réponse vide", () => {
    expect(() => parseYahooChart('{"chart":{"result":null}}', "X")).toThrow();
  });
});

describe("Stooq", () => {
  it("lit le CSV", () => {
    const s = parseStooqCsv(fx("stooq-nvda.csv"), "NVDA");
    expect(s.bars).toEqual([
      { date: "2026-11-23", close: 180.5, volume: 1000 },
      { date: "2026-11-24", close: 182.25, volume: 1200 },
    ]);
  });
  it("rejette une page HTML (anti-robot)", () => {
    expect(() => parseStooqCsv("<!DOCTYPE html>", "NVDA")).toThrow();
  });
  it("convertit les symboles", () => {
    expect(toStooqSymbol("BRK.B")).toBe("brk-b.us");
  });
});

describe("FRED", () => {
  it("ignore les jours sans valeur", () => {
    const s = parseFredCsv(fx("fred-vix.csv"), "^VIX");
    expect(s.bars.map((b) => b.close)).toEqual([18.2, 16.9]);
  });
});

describe("CNN", () => {
  it("lit le score", () => {
    expect(parseCnnFearGreed(fx("cnn.json"))).toEqual({ value: 62, label: "Avidité", homemade: false });
  });
  it("étiquettes", () => {
    expect(fearGreedLabel(10)).toBe("Peur extrême");
    expect(fearGreedLabel(50)).toBe("Neutre");
    expect(fearGreedLabel(90)).toBe("Avidité extrême");
  });
});

describe("historique Fear & Greed", () => {
  it("CNN : une valeur par jour, triée, arrondie", async () => {
    const { parseCnnFearGreed } = await import("./cnn");
    const json = JSON.stringify({
      fear_and_greed: { score: 18.4 },
      fear_and_greed_historical: { data: [
        { x: Date.parse("2026-11-26T21:00:00Z"), y: 15.2 },
        { x: Date.parse("2026-11-25T10:00:00Z"), y: 30.1 },
        { x: Date.parse("2026-11-25T21:00:00Z"), y: 28.6 },
      ] },
    });
    expect(parseCnnFearGreed(json).history).toEqual([{ date: "2026-11-25", value: 29 }, { date: "2026-11-26", value: 15 }]);
  });
  it("indice maison : calculé jour par jour sur les dates communes", async () => {
    const { homemadeFearGreedHistory } = await import("../indicators/fearGreed");
    const spx = Array.from({ length: 200 }, (_, i) => ({ date: `D${String(i).padStart(3, "0")}`, close: 100 + i }));
    const vix = spx.map((b) => ({ date: b.date, close: 15 }));
    const h = homemadeFearGreedHistory(vix, spx);
    expect(h).toHaveLength(75); // à partir de la 125e séance (MM125 disponible)
    expect(h.at(-1)!.value).toBeGreaterThan(50); // VIX bas et tendance haussière → avidité
  });
});

describe("repères Fear & Greed", () => {
  it("veille et 1 semaine seulement si l'historique est court", async () => {
    const { fearGreedLookback } = await import("../indicators/fearGreed");
    const h = Array.from({ length: 10 }, (_, i) => ({ date: `2026-11-${String(i + 10)}`, value: i * 10 }));
    expect(fearGreedLookback(h)).toEqual([{ label: "Veille", date: "2026-11-18", value: 80 }, { label: "1 semaine", date: "2026-11-14", value: 40 }]);
  });
});

describe("Fear & Greed : libellé et couleur", () => {
  it("libellé calculé sur la valeur arrondie affichée", () => {
    const r = parseCnnFearGreed(JSON.stringify({ fear_and_greed: { score: 24.6 } }));
    expect(r.value).toBe(25);
    expect(r.label).toBe("Peur");
  });
  it("une couleur par zone, mêmes seuils que le libellé", () => {
    expect(fearGreedTone(18)).toBe("down");
    expect(fearGreedTone(25)).toBe("warn");
    expect(fearGreedTone(50)).toBeUndefined();
    expect(fearGreedTone(65)).toBe("up");
    expect(fearGreedTone(80)).toBe("warn");
  });
});
