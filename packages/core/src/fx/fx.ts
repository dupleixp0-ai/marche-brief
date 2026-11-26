// Conversion de devises. Les taux Yahoo « EURxxx=X » donnent le nombre d'unités de devise pour 1 €.
import type { Bar } from "../types";

/** Paire Yahoo par devise (les pence « GBp » sont ramenés en livres). */
export const FX_PAIR: Record<string, string> = {
  USD: "EURUSD=X", GBP: "EURGBP=X", GBp: "EURGBP=X", GBX: "EURGBP=X",
  CHF: "EURCHF=X", SEK: "EURSEK=X", DKK: "EURDKK=X", NOK: "EURNOK=X", JPY: "EURJPY=X",
};

/** Devises proposées à l'affichage. */
export const DISPLAY_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

/** Séries de taux par devise : unités de devise pour 1 € (clé "USD", "GBP"…). */
export type FxRates = Record<string, Bar[] | undefined>;

/** Ramène les sous-unités (pence) à la devise principale. */
export function normalizeCurrency(c: string | undefined): { code: string; scale: number } {
  if (c === "GBp" || c === "GBX") return { code: "GBP", scale: 0.01 };
  return { code: c || "USD", scale: 1 };
}

/** Dernier taux connu à la date `date` (AAAA-MM-JJ), sinon le premier disponible. */
export function rateAt(rates: Bar[], date: string): number | null {
  if (!rates.length) return null;
  let lo = 0, hi = rates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rates[mid].date <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return rates[ans < 0 ? 0 : ans].close;
}

/** Facteur multiplicatif pour passer de `from` à `to` à une date ; null si un taux manque. */
export function fxFactor(from: string | undefined, to: string, date: string, rates: FxRates): number | null {
  const f = normalizeCurrency(from);
  if (f.code === to) return f.scale;
  const perEur = (code: string) => (code === "EUR" ? 1 : rates[code] ? rateAt(rates[code]!, date) : null);
  const a = perEur(f.code), b = perEur(to);
  if (a == null || b == null || a === 0) return null;
  return (f.scale * b) / a;
}

/** Convertit une série journalière ; null si la conversion est impossible (taux manquant). */
export function convertBars(bars: Bar[], from: string | undefined, to: string, rates: FxRates): Bar[] | null {
  const out: Bar[] = [];
  for (const b of bars) {
    const k = fxFactor(from, to, b.date, rates);
    if (k == null) return null;
    out.push({ ...b, close: b.close * k });
  }
  return out;
}

/** Convertit des points intraday (horodatage en secondes UTC). */
export function convertPoints(points: { t: number; close: number }[], from: string | undefined, to: string, rates: FxRates) {
  const out: { t: number; close: number }[] = [];
  for (const p of points) {
    const k = fxFactor(from, to, new Date(p.t * 1000).toISOString().slice(0, 10), rates);
    if (k == null) return null;
    out.push({ t: p.t, close: p.close * k });
  }
  return out;
}

/** Taux d'un snapshot (séries EURxxx=X) sous forme FxRates. */
export function ratesFrom(fx: Record<string, { data: { bars: Bar[] } | null } | undefined> | undefined): FxRates {
  const out: FxRates = {};
  for (const [k, v] of Object.entries(fx ?? {})) if (v?.data?.bars?.length) out[k] = v.data.bars;
  return out;
}
