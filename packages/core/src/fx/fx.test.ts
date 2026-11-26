import { describe, expect, it } from "vitest";
import { convertBars, convertPoints, fxFactor, rateAt, normalizeCurrency } from "./fx";

const usd = [{ date: "2026-01-02", close: 1.1 }, { date: "2026-01-05", close: 1.2 }];
const gbp = [{ date: "2026-01-02", close: 0.8 }];

describe("fx", () => {
  it("rateAt prend le dernier taux connu", () => {
    expect(rateAt(usd, "2026-01-04")).toBe(1.1);
    expect(rateAt(usd, "2026-01-06")).toBe(1.2);
    expect(rateAt(usd, "2025-12-31")).toBe(1.1); // avant le début : premier taux
  });
  it("USD → EUR divise par le taux", () => {
    expect(fxFactor("USD", "EUR", "2026-01-05", { USD: usd })).toBeCloseTo(1 / 1.2);
  });
  it("EUR → USD multiplie par le taux", () => {
    expect(fxFactor("EUR", "USD", "2026-01-02", { USD: usd })).toBeCloseTo(1.1);
  });
  it("croisé GBp → USD (pence)", () => {
    expect(fxFactor("GBp", "USD", "2026-01-02", { USD: usd, GBP: gbp })).toBeCloseTo((0.01 * 1.1) / 0.8);
    expect(normalizeCurrency("GBp")).toEqual({ code: "GBP", scale: 0.01 });
  });
  it("même devise : inchangé ; taux manquant : null", () => {
    const bars = [{ date: "2026-01-02", close: 10 }];
    expect(convertBars(bars, "EUR", "EUR", {})).toEqual(bars);
    expect(convertBars(bars, "USD", "EUR", {})).toBeNull();
  });
  it("convertit les points intraday", () => {
    const t = Date.parse("2026-01-05T15:00:00Z") / 1000;
    expect(convertPoints([{ t, close: 12 }], "USD", "EUR", { USD: usd })![0].close).toBeCloseTo(10);
  });
});
