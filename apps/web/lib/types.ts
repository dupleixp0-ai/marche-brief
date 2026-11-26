import type { BacktestSummary } from "@marche-brief/core";

export interface WatchItem {
  ticker: string; name?: string; sector?: string;
  /** ETF : nom complet, ISIN, émetteur, indice suivi, place de cotation. */
  fullName?: string; isin?: string; issuer?: string; index?: string; exchange?: string;
}
export interface Watchlist { stocks: WatchItem[]; etfs: WatchItem[]; }
export interface EventItem { date: string; title: string; source?: string; }
export interface DashboardData {
  backtest: BacktestSummary | null;
  watchlist: Watchlist;
  events: EventItem[];
}
