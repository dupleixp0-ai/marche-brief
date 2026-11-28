import type { Bar, Fetcher, PriceSeries } from "../types";
import { assertBars, fetchText } from "./http";

// Yahoo Finance (endpoint non officiel) : /v8/finance/chart.

export function parseYahooChart(json: string, symbol: string): PriceSeries {
  const r = JSON.parse(json)?.chart?.result?.[0];
  if (!r) throw new Error("réponse Yahoo vide");
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  ts.forEach((t, i) => {
    const close = q.close?.[i];
    if (typeof close !== "number") return; // séance sans cours
    bars.push({ date: new Date(t * 1000).toISOString().slice(0, 10), close, volume: q.volume?.[i] ?? undefined });
  });
  const t = r.meta?.regularMarketTime;
  return {
    symbol, currency: r.meta?.currency, bars,
    ...(typeof t === "number" ? { quoteTime: new Date(t * 1000).toISOString() } : {}),
    ...(r.meta?.fullExchangeName || r.meta?.exchangeName ? { venue: r.meta.fullExchangeName ?? r.meta.exchangeName } : {}),
  };
}

export function yahooFetcher(symbol: string, range = "1y"): Fetcher<PriceSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  return { name: "Yahoo Finance", run: async () => assertBars(parseYahooChart(await fetchText(url), symbol)) };
}
