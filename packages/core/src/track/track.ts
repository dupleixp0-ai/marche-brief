// Taux de réussite réel : on reprend les recommandations archivées (data/history/)
// et on regarde ce que le cours a fait dans les `horizon` séances suivantes.
import type { Bar } from "../types";
import type { Decision } from "../scoring/score";

export interface ArchivedDay {
  generatedAt: string;
  recommendations: Record<string, { decision: Decision; score: number; asOf: string }>;
}

export interface TrackStats { n: number; hits: number; hitRate: number | null; avgReturn: number | null; beatSpy: number | null }
export interface TrackRecord {
  generatedAt: string;
  horizon: number;
  since: string | null;
  evaluated: number;
  byDecision: Record<Decision, TrackStats>;
}

/** Acheter = juste si le cours monte ; Vendre = juste si le cours baisse ; Attendre : rendement moyen seulement. */
export function evaluateTrackRecord(history: ArchivedDay[], prices: Record<string, Bar[]>, horizon = 21, now = new Date()): TrackRecord {
  const seen = new Set<string>();
  const acc: Record<Decision, { n: number; hits: number; sum: number; beat: number; nBench: number }> = {
    Acheter: { n: 0, hits: 0, sum: 0, beat: 0, nBench: 0 },
    Attendre: { n: 0, hits: 0, sum: 0, beat: 0, nBench: 0 },
    Vendre: { n: 0, hits: 0, sum: 0, beat: 0, nBench: 0 },
  };
  const fwd = (bars: Bar[] | undefined, date: string) => {
    if (!bars) return null;
    const i = bars.findIndex((b) => b.date === date);
    return i >= 0 && i + horizon < bars.length ? bars[i + horizon].close / bars[i].close - 1 : null;
  };
  let since: string | null = null;
  for (const day of [...history].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))) {
    for (const [sym, r] of Object.entries(day.recommendations)) {
      const key = `${sym}@${r.asOf}`;
      if (seen.has(key)) continue; // plusieurs archives pour la même clôture (week-end)
      seen.add(key);
      const ret = fwd(prices[sym], r.asOf);
      if (ret == null) continue;
      since ??= r.asOf;
      const a = acc[r.decision];
      a.n++; a.sum += ret;
      if ((r.decision === "Acheter" && ret > 0) || (r.decision === "Vendre" && ret < 0)) a.hits++;
      const spy = fwd(prices.SPY, r.asOf);
      if (spy != null) { a.nBench++; if (r.decision === "Vendre" ? ret < spy : ret > spy) a.beat++; }
    }
  }
  const stats = (d: Decision): TrackStats => {
    const a = acc[d];
    return {
      n: a.n, hits: a.hits,
      hitRate: a.n && d !== "Attendre" ? a.hits / a.n : null,
      avgReturn: a.n ? a.sum / a.n : null,
      beatSpy: a.nBench && d !== "Attendre" ? a.beat / a.nBench : null,
    };
  };
  return {
    generatedAt: now.toISOString(), horizon, since,
    evaluated: acc.Acheter.n + acc.Attendre.n + acc.Vendre.n,
    byDecision: { Acheter: stats("Acheter"), Attendre: stats("Attendre"), Vendre: stats("Vendre") },
  };
}
