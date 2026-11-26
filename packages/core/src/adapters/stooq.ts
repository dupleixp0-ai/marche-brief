import type { Bar, Fetcher, PriceSeries } from "../types";
import { assertBars, fetchText } from "./http";

// Stooq : CSV journalier. Symboles US au format "nvda.us".

export function toStooqSymbol(symbol: string): string {
  return `${symbol.toLowerCase().replace(".", "-")}.us`;
}

export function parseStooqCsv(csv: string, symbol: string): PriceSeries {
  const lines = csv.trim().split(/\r?\n/);
  if (!lines[0]?.toLowerCase().startsWith("date")) throw new Error("CSV Stooq invalide");
  const bars: Bar[] = [];
  for (const line of lines.slice(1)) {
    const [date, , , , close, volume] = line.split(",");
    const c = Number(close);
    if (date && Number.isFinite(c)) bars.push({ date, close: c, volume: volume ? Number(volume) : undefined });
  }
  return { symbol, currency: "USD", bars };
}

export function stooqFetcher(symbol: string, days = 400): Fetcher<PriceSeries> {
  const url = `https://stooq.com/q/d/l/?s=${toStooqSymbol(symbol)}&i=d`;
  return {
    name: "Stooq",
    run: async () => {
      const s = parseStooqCsv(await fetchText(url), symbol);
      return assertBars({ ...s, bars: s.bars.slice(-days) });
    },
  };
}
