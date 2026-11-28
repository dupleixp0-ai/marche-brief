// Étude « moment d'entrée » sur 10 ans → data/timing.json (statistiques affichées avec chaque signal).
// Univers volontairement varié (valeurs suivies + gagnants ET perdants, secteurs, pays, obligations, matières premières)
// pour ne pas mesurer seulement un marché haussier de la tech.
// Usage : npm run timing
import { readFileSync, writeFileSync } from "node:fs";
import { yahooFetcher, timingStudy, type Bar } from "@marche-brief/core";

const root = new URL("../", import.meta.url);
const path = (p: string) => new URL(p, root);
const watchlist = JSON.parse(readFileSync(path("config/watchlist.json"), "utf8"));
const OTHERS = ["INTC", "PFE", "T", "VZ", "BA", "DIS", "NKE", "KO", "XOM", "F", "GE", "C", "MMM", "IBM", "CVS", "BABA", "PYPL", "INTU", "CSCO", "ORCL", "JPM", "WMT", "TSLA", "NFLX",
  "XLE", "XLF", "XLU", "XLV", "XLI", "EWJ", "EWG", "EWZ", "EEM", "FXI", "IWM", "QQQ", "SPY", "SMH", "GLD", "SLV", "TLT", "EWU", "INDA", "KWEB"];
const symbols = [...new Set([...watchlist.etfs, ...watchlist.stocks].map((v: { ticker: string }) => v.ticker).concat(OTHERS))];

const get = async (s: string) => (await yahooFetcher(s, "10y").run()).bars as Bar[];
const vix = await get("^VIX"), spx = await get("^GSPC");
const series: Record<string, Bar[]> = {};
for (const s of symbols) {
  try { series[s] = await get(s); } catch (e) { console.log(`${s} ignoré : ${e}`); }
  await new Promise((r) => setTimeout(r, 250));
}
const study = timingStudy(series, vix, spx);
writeFileSync(path("data/timing.json"), JSON.stringify(study, null, 1) + "\n");
const pc = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} %`;
console.log(`${study.assets} valeurs, ${study.from} → ${study.to}`);
for (const k of ["favorable", "neutre", "etire", "all"] as const) {
  const row = [study.stats[k], ...study.halves.map((h) => h[k])].map((s) => (s ? `${pc(s.avg63)} · hausse ${Math.round(s.hit63 * 100)} % · chute>15 % ${Math.round((s.loss15 ?? 0) * 100)} % (n=${s.n})` : "—"));
  console.log(`${k.padEnd(11)} total ${row[0]} | 1re moitié ${row[1]} | 2e moitié ${row[2]}`);
}
