import type { Bar } from "../types";

/** Variation en % entre les deux dernières clôtures (null si moins de 2 séances). */
export function dailyChangePct(bars: Bar[]): number | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2].close;
  const last = bars[bars.length - 1].close;
  return prev ? ((last - prev) / prev) * 100 : null;
}
