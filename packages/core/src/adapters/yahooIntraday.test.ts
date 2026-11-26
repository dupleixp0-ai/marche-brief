import { describe, expect, it } from "vitest";
import { lastSession, parseYahooIntraday } from "./yahooIntraday";

const t0 = Date.parse("2026-11-24T15:00:00Z") / 1000;
const json = JSON.stringify({
  chart: { result: [{ meta: { currency: "EUR" }, timestamp: [t0, t0 + 900, t0 + 86400, t0 + 86400 + 900],
    indicators: { quote: [{ close: [10, null, 11, 11.5] }] } }] },
});

describe("intraday Yahoo", () => {
  it("garde les horodatages et ignore les trous", () => {
    const s = parseYahooIntraday(json, "EUNL.DE", "15m");
    expect(s.currency).toBe("EUR");
    expect(s.points).toEqual([{ t: t0, close: 10 }, { t: t0 + 86400, close: 11 }, { t: t0 + 86400 + 900, close: 11.5 }]);
  });
  it("lastSession ne garde que la dernière journée", () => {
    const s = parseYahooIntraday(json, "X", "15m");
    expect(lastSession(s.points).map((p) => p.close)).toEqual([11, 11.5]);
  });
  it("réponse vide : erreur", () => {
    expect(() => parseYahooIntraday('{"chart":{"result":null}}', "X", "15m")).toThrow();
  });
});
