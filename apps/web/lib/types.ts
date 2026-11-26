import type { BacktestSummary } from "@marche-brief/core";

export interface WatchItem { ticker: string; name?: string; sector?: string; tickerEUR?: string | null; }
export interface Watchlist { stocks: WatchItem[]; etfs: WatchItem[]; }
export interface EventItem { date: string; title: string; source?: string; }
export interface DashboardData {
  backtest: BacktestSummary | null;
  watchlist: Watchlist;
  events: EventItem[];
}
