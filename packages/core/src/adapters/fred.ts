import type { Bar, Fetcher, PriceSeries } from "../types";
import { assertBars, fetchText } from "./http";

// FRED (Réserve fédérale de St. Louis) : CSV public, sans clé.
// VIXCLS = VIX, SP500 = S&P 500. Les jours sans valeur sont notés "." ou vides.

export function parseFredCsv(csv: string, symbol: string): PriceSeries {
  const lines = csv.trim().split(/\r?\n/);
  const bars: Bar[] = [];
  for (const line of lines.slice(1)) {
    const [date, v] = line.split(",");
    const n = Number(v);
    if (date && v && v !== "." && Number.isFinite(n)) bars.push({ date, close: n });
  }
  return { symbol, currency: "USD", bars };
}

export function fredFetcher(seriesId: string, symbol: string, days = 400): Fetcher<PriceSeries> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  return {
    name: "FRED",
    run: async () => {
      const s = parseFredCsv(await fetchText(url), symbol);
      return assertBars({ ...s, bars: s.bars.slice(-days) });
    },
  };
}
