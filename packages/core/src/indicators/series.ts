// Indicateurs de séries de prix. Tous prennent des clôtures en ordre chronologique.
import { sma } from "./sma";

/** RSI de Wilder (période 14 par défaut). null si pas assez de données. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** Rendement sur `days` séances (0,05 = +5 %). */
export function returnOver(closes: number[], days: number): number | null {
  if (closes.length < days + 1) return null;
  const a = closes[closes.length - 1 - days], b = closes[closes.length - 1];
  return a ? b / a - 1 : null;
}

/** Volatilité annualisée des rendements journaliers sur `days` séances. */
export function volatility(closes: number[], days = 20): number | null {
  if (closes.length < days + 1) return null;
  const r: number[] = [];
  for (let i = closes.length - days; i < closes.length; i++) r.push(closes[i] / closes[i - 1] - 1);
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

/** Baisse depuis le plus haut sur `days` séances (−0,1 = −10 %). */
export function drawdown(closes: number[], days = 252): number | null {
  if (closes.length === 0) return null;
  const w = closes.slice(-days);
  const max = Math.max(...w);
  return closes[closes.length - 1] / max - 1;
}

/** Pente de la MM `period` sur `lookback` séances (variation relative). */
export function smaSlope(closes: number[], period = 50, lookback = 20): number | null {
  const now = sma(closes, period);
  const before = sma(closes.slice(0, closes.length - lookback), period);
  return now != null && before ? now / before - 1 : null;
}
