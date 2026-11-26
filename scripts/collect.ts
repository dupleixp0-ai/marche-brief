// Collecte les données et écrit data/snapshot.json (+ journal d'erreurs).
// Usage : npm run collect
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { collectSnapshot, evaluateTrackRecord, type Snapshot, type ArchivedDay } from "@marche-brief/core";
import { sendDailyEmail } from "./email";

const root = new URL("../", import.meta.url);
const path = (p: string) => new URL(p, root);

const watchlist = JSON.parse(readFileSync(path("config/watchlist.json"), "utf8"));
const symbols: string[] = [...watchlist.etfs, ...watchlist.stocks].map((v: { ticker: string }) => v.ticker);

const snapFile = path("data/snapshot.json");
const previous: Snapshot | null = existsSync(snapFile) ? JSON.parse(readFileSync(snapFile, "utf8")) : null;

// Clés lues dans l'environnement (GitHub Secrets) — jamais dans le dépôt.
const names = Object.fromEntries([...watchlist.etfs, ...watchlist.stocks].map((v: { ticker: string; name?: string; sector?: string }) => [v.ticker, v.name ?? v.sector ?? ""]));
const snap = await collectSnapshot(symbols, previous, {
  finnhubKey: process.env.FINNHUB_API_KEY,
  companyNews: true,
  intraday: true,
  anthropic: process.env.ANTHROPIC_API_KEY ? new Anthropic() : null,
  names,
  universe: JSON.parse(readFileSync(path("config/universe.json"), "utf8")),
});
writeFileSync(snapFile, JSON.stringify(snap, null, 1) + "\n");

// Archive des recommandations du jour (data/history/AAAA-MM-JJ.json).
const day = snap.generatedAt.slice(0, 10);
const archive = Object.fromEntries(Object.entries(snap.scores).map(([k, v]) =>
  [k, { score: v.score, decision: v.decision, confidence: v.confidence, asOf: v.asOf, close: snap.prices[k]?.data?.bars.at(-1)?.close }]));
writeFileSync(path(`data/history/${day}.json`), JSON.stringify({ generatedAt: snap.generatedAt, recommendations: archive }, null, 1) + "\n");

// Taux de réussite réel : recommandations archivées vs cours 21 séances plus tard.
const history: ArchivedDay[] = readdirSync(path("data/history/"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path(`data/history/${f}`), "utf8")));
const priceMap: Record<string, { date: string; close: number }[]> = Object.fromEntries(Object.entries(snap.prices).map(([k, r]) => [k, r.data?.bars ?? []]));
priceMap.SPY ??= snap.market.spx.data?.bars ?? []; // référence : S&P 500
writeFileSync(path("data/track-record.json"), JSON.stringify(evaluateTrackRecord(history, priceMap), null, 1) + "\n");

// Résumé console + journal des sources en échec.
const all = { ...snap.market, news: snap.news, brief: snap.brief, ...(snap.discoveries ? { discoveries: snap.discoveries } : {}), ...snap.prices } as Record<string, { status: string; source: string; error?: string }>;
const problems: string[] = [];
for (const [k, r] of Object.entries(all)) {
  const sc = snap.scores[k];
  console.log(`${r.status.padEnd(8)} ${k.padEnd(10)} ${r.source.padEnd(14)} ${sc ? `${sc.score} ${sc.decision}` : ""}`);
  if (r.status !== "ok") problems.push(`${snap.generatedAt} ${k} ${r.status} ${r.error ?? ""}`);
}
if (problems.length) appendFileSync(path(`data/logs/${snap.generatedAt.slice(0, 10)}.log`), problems.join("\n") + "\n");

if (snap.discoveries?.data) {
  const d = snap.discoveries.data;
  console.log(`\nDécouvertes : ${d.scanned} analysées, ${d.excluded.length} exclues`);
  console.log(`  Actions : ${d.stocks.slice(0, 5).map((x) => `${x.ticker} ${x.score}`).join(", ")}`);
  console.log(`  ETF     : ${d.etfs.slice(0, 5).map((x) => `${x.ticker} ${x.score}`).join(", ")}`);
  for (const e of d.excluded) console.log(`  exclue ${e.ticker} : ${e.reason}`);
}

// E-mail de 6h00 (envoyé seulement si SEND_EMAIL=true : job quotidien).
await sendDailyEmail(snap, previous);
