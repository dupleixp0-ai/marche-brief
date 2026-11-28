import { describe, expect, it } from "vitest";
import { lateSymbol, mergeLateQuote, parseYahooLastQuote } from "./lateQuote";
import { parseYahooChart } from "./yahoo";

const series = { symbol: "EUNL.DE", currency: "EUR", bars: [{ date: "2026-11-26", close: 125 }, { date: "2026-11-27", close: 127.2 }] };
const q = (time: string, price = 127.4, currency = "EUR") => ({ venue: "Düsseldorf", symbol: "EUNL.DU", price, time, currency });

describe("cours du soir (Düsseldorf)", () => {
  it("symbole correspondant pour Xetra et Milan seulement", () => {
    expect(lateSymbol("EUNL.DE")).toBe("EUNL.DU");
    expect(lateSymbol("HNSC.MI")).toBe("HNSC.DU");
    expect(lateSymbol("NVDA")).toBeNull();
    expect(lateSymbol("REL.L")).toBeNull();
  });
  it("lit le dernier cours et son heure", () => {
    const json = JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 127.4, regularMarketTime: 1795812360, currency: "EUR" } }] } });
    expect(parseYahooLastQuote(json, "EUNL.DU", "Düsseldorf")).toMatchObject({ price: 127.4, currency: "EUR" });
  });
  it("cours principal : heure exacte et place (Yahoo)", () => {
    const json = JSON.stringify({ chart: { result: [{ meta: { currency: "EUR", regularMarketTime: 1795797360, fullExchangeName: "XETRA" }, timestamp: [1795762800], indicators: { quote: [{ close: [127.2] }] } }] } });
    expect(parseYahooChart(json, "EUNL.DE")).toMatchObject({ venue: "XETRA", quoteTime: new Date(1795797360 * 1000).toISOString() });
  });
  it("après la clôture de Xetra, le même jour : remplace le dernier cours", () => {
    const m = mergeLateQuote(series, q("2026-11-27T20:46:00Z")); // 21h46 à Berlin
    expect(m.bars).toHaveLength(2);
    expect(m.bars.at(-1)).toMatchObject({ date: "2026-11-27", close: 127.4 });
    expect(m.late?.venue).toBe("Düsseldorf");
    expect(m).toMatchObject({ venue: "Düsseldorf", quoteTime: "2026-11-27T20:46:00Z" });
  });
  it("pendant les heures de Xetra : la place principale garde la main", () => {
    expect(mergeLateQuote(series, q("2026-11-27T10:00:00Z"))).toBe(series);
  });
  it("le lendemain avant l'ouverture de Xetra : ajoute une séance", () => {
    const m = mergeLateQuote(series, q("2026-11-30T07:30:00Z")); // 8h30 lundi
    expect(m.bars.at(-1)).toMatchObject({ date: "2026-11-30", close: 127.4 });
  });
  it("ignore une devise différente ou un écart aberrant", () => {
    expect(mergeLateQuote(series, q("2026-11-27T20:46:00Z", 127.4, "USD"))).toBe(series);
    expect(mergeLateQuote(series, q("2026-11-27T20:46:00Z", 200))).toBe(series);
  });
});
