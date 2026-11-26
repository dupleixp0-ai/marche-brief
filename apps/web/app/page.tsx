import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Dashboard } from "../components/Dashboard";
import { I18nProvider } from "../lib/i18n";
import type { DashboardData } from "../lib/types";

// Lecture des données au moment du build (export statique).
const root = path.join(process.cwd(), "../..");
function load<T>(rel: string, fallback: T): T {
  const f = path.join(root, rel);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : fallback;
}

export default function Home() {
  const data: DashboardData = {
    backtest: load("data/backtest.json", null),
    watchlist: load("config/watchlist.json", { stocks: [], etfs: [] }),
    events: load<{ events: DashboardData["events"] }>("config/events.json", { events: [] }).events,
  };
  return <I18nProvider><Dashboard data={data} /></I18nProvider>;
}
