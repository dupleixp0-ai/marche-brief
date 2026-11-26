import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseYahooChart } from "./yahoo";
import { parseStooqCsv, toStooqSymbol } from "./stooq";
import { parseFredCsv } from "./fred";
import { parseCnnFearGreed, fearGreedLabel } from "./cnn";

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
