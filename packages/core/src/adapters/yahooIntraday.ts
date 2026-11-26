import type { Fetcher } from "../types";
import { fetchText } from "./http";

/** Cours intraday (1 jour / 1 semaine). `t` = horodatage en secondes UTC. */
export interface IntradaySeries {
  symbol: string;
  currency?: string;
  interval: string;
  points: { t: number; close: number }[];
}

export function parseYahooIntraday(json: string, symbol: string, interval: string): IntradaySeries {
  const r = JSON.parse(json)?.chart?.result?.[0];
  if (!r) throw new Error("réponse Yahoo vide");
  const ts: number[] = r.timestamp ?? [];
  const close: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const points = ts.flatMap((t, i) => (typeof close[i] === "number" ? [{ t, close: +close[i]!.toPrecision(6) }] : []));
  if (points.length < 2) throw new Error("pas assez de points intraday");
  return { symbol, currency: r.meta?.currency, interval, points };
}

/** 5 jours en pas de 15 minutes : sert pour « 1 jour » (dernière séance) et « 1 semaine ». */
export function yahooIntradayFetcher(symbol: string, range = "5d", interval = "15m"): Fetcher<IntradaySeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  return { name: "Yahoo Finance", run: async () => parseYahooIntraday(await fetchText(url), symbol, interval) };
}

/** Points de la dernière séance (même date UTC que le dernier point). */
export function lastSession(points: { t: number; close: number }[]): { t: number; close: number }[] {
  if (!points.length) return [];
  const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const d = day(points[points.length - 1].t);
  return points.filter((p) => day(p.t) === d);
}
