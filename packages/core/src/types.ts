// Types partagés par les adaptateurs de données.

export type SourceStatus = "ok" | "fallback" | "stale" | "error";

/** Résultat standard de tout adaptateur : { data, source, fetchedAt, status }. */
export interface SourceResult<T> {
  data: T | null;
  source: string;
  fetchedAt: string; // ISO
  status: SourceStatus;
  error?: string;
}

/** Une séance de cotation (clôture journalière). */
export interface Bar {
  date: string; // AAAA-MM-JJ
  close: number;
  volume?: number;
}

export interface PriceSeries {
  symbol: string;
  currency?: string;
  bars: Bar[];
}

export interface FearGreed {
  value: number; // 0–100
  label: string;
  /** true si calculé par l'indice maison (secours). */
  homemade: boolean;
}

/** Une source nommée : renvoie la donnée ou lève une erreur. */
export interface Fetcher<T> {
  name: string;
  run: () => Promise<T>;
}
