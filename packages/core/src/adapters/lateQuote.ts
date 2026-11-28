// Dernier cours « du soir » : Xetra ferme à 17h30, alors que des places comme Düsseldorf cotent
// jusque vers 22h (Trade Republic utilise LS Exchange, ouvert jusqu'à 23h, non disponible gratuitement).
// On garde l'historique de la place principale et on remplace seulement le dernier cours s'il est plus récent.
import type { Fetcher, LateQuote, PriceSeries } from "../types";
import { fetchText } from "./http";
import { localDate } from "../market/session";

export const LATE_VENUE = { suffix: ".DU", name: "Düsseldorf" } as const;
/** Heure (Berlin) après laquelle la place principale est fermée : un cours plus tardif apporte une information. */
export const PRIMARY_CLOSE = "17:40";
/** Écart maximal accepté avec la dernière clôture (protège contre une donnée aberrante). */
export const MAX_GAP = 0.15;

/** Symbole Düsseldorf correspondant à une cotation européenne en euros (Xetra, Milan), sinon null. */
export function lateSymbol(symbol: string): string | null {
  const m = symbol.match(/^([A-Z0-9]+)\.(DE|MI)$/);
  return m ? `${m[1]}${LATE_VENUE.suffix}` : null;
}

export function parseYahooLastQuote(json: string, symbol: string, venue: string): LateQuote {
  const meta = JSON.parse(json)?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice, t = meta?.regularMarketTime;
  if (typeof price !== "number" || typeof t !== "number") throw new Error("cours absent");
  return { venue, symbol, price, time: new Date(t * 1000).toISOString(), currency: meta.currency };
}

export function yahooLateQuoteFetcher(symbol: string): Fetcher<LateQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  return { name: LATE_VENUE.name, run: async () => parseYahooLastQuote(await fetchText(url), symbol, LATE_VENUE.name) };
}

const berlinTime = (d: Date) => d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Intègre le cours tardif s'il est plus récent que la dernière clôture :
 * - même jour que la dernière séance et après la clôture de la place principale → remplace le dernier cours ;
 * - jour suivant (ex. Düsseldorf ouvre à 8h, Xetra à 9h) → ajoute une séance.
 * Ignoré si la devise diffère ou si l'écart est aberrant.
 */
export function mergeLateQuote(series: PriceSeries, q: LateQuote): PriceSeries {
  const last = series.bars.at(-1);
  if (!last || (q.currency && series.currency && q.currency !== series.currency)) return series;
  if (Math.abs(q.price / last.close - 1) > MAX_GAP) return series;
  const t = new Date(q.time);
  const day = localDate(t, "Europe/Berlin");
  if (day === last.date && berlinTime(t) >= PRIMARY_CLOSE) {
    return { ...series, bars: [...series.bars.slice(0, -1), { ...last, close: q.price }], late: q, quoteTime: q.time, venue: q.venue };
  }
  if (day > last.date) return { ...series, bars: [...series.bars, { date: day, close: q.price }], late: q, quoteTime: q.time, venue: q.venue };
  return series;
}
