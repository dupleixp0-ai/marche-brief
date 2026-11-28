import type { Bar } from "../types";

/** Variation en % entre les deux dernières clôtures (null si moins de 2 séances). */
export function dailyChangePct(bars: Bar[]): number | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2].close;
  const last = bars[bars.length - 1].close;
  return prev ? ((last - prev) / prev) * 100 : null;
}

/** Variation entre deux cours : montant (même unité que les cours) et pourcentage. */
export interface Change { abs: number; pct: number }

export function changeBetween(first: number | null | undefined, last: number | null | undefined): Change | null {
  if (first == null || last == null || !first) return null;
  return { abs: last - first, pct: ((last - first) / first) * 100 };
}

/** Variation de la dernière séance (montant et %), null si moins de 2 séances. */
export function dailyChange(bars: Bar[]): Change | null {
  if (bars.length < 2) return null;
  return changeBetween(bars[bars.length - 2].close, bars[bars.length - 1].close);
}
