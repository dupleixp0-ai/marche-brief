// Backtest sur 10 ans de la stratégie « suivre le score » → data/backtest.json.
// Usage : npm run backtest
import { readFileSync, writeFileSync } from "node:fs";
import { yahooFetcher, fredFetcher, withFallback, backtest, summarize, type BacktestResult, type DecisionRules } from "@marche-brief/core";

const root = new URL("../", import.meta.url);
const path = (p: string) => new URL(p, root);
const watchlist = JSON.parse(readFileSync(path("config/watchlist.json"), "utf8"));
const symbols: string[] = [...watchlist.etfs, ...watchlist.stocks].map((v: { ticker: string }) => v.ticker);

const get = async (fetchers: Parameters<typeof withFallback>[0]) => {
  const r = await withFallback(fetchers as never);
  if (!r.data) throw new Error(r.error);
  return (r.data as { bars: { date: string; close: number }[] }).bars;
};

const bench = await get([yahooFetcher("^GSPC", "10y"), fredFetcher("SP500", "^GSPC", 2600)]);
const vix = await get([yahooFetcher("^VIX", "10y"), fredFetcher("VIXCLS", "^VIX", 2600)]);

const VARIANTS: Record<string, DecisionRules> = {
  "A · score seul": {},
  "B · vente si sous MM200": { sellNeedsBelowMA200: true },
  "C · B + retour au-dessus MM200": { sellNeedsBelowMA200: true, reentryAboveMA200: true },
};
const data: Record<string, { date: string; close: number }[]> = {};
for (const s of symbols) {
  try { data[s] = await get([yahooFetcher(s, "10y")]); } catch (e) { console.log(`${s} ignoré : ${e}`); }
  await new Promise((r) => setTimeout(r, 300));
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const variants: Record<string, ReturnType<typeof summarize>> = {};
for (const [name, rules] of Object.entries(VARIANTS)) {
  const res: BacktestResult[] = Object.entries(data).map(([s, bars]) => backtest(s, bars, bench, vix, { rules }));
  const v = summarize(res);
  variants[name] = v;
  console.log(`${name.padEnd(32)} CAGR ${v.beatsCagr}/${v.assets} · Sharpe ${v.beatsSharpe}/${v.assets} · baisse ${v.beatsDrawdown}/${v.assets} · écart ${pct(v.avgCagrDiff)}/an`);
}
const results = variants["B · vente si sous MM200"].results;
const sum = summarize(results);
writeFileSync(path("data/backtest-variants.json"), JSON.stringify(variants, null, 1) + "\n");
writeFileSync(path("data/backtest.json"), JSON.stringify(sum, null, 1) + "\n");
console.log(`\n${sum.verdict}\nMeilleur rendement : ${sum.beatsCagr}/${sum.assets} · meilleur Sharpe : ${sum.beatsSharpe}/${sum.assets} · baisse limitée : ${sum.beatsDrawdown}/${sum.assets} · écart CAGR moyen : ${(sum.avgCagrDiff * 100).toFixed(2)} pts`);
