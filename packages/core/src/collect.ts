import { withFallback } from "./fallback";
import { yahooFetcher } from "./adapters/yahoo";
import { stooqFetcher } from "./adapters/stooq";
import { fredFetcher } from "./adapters/fred";
import { cnnFetcher } from "./adapters/cnn";
import { homemadeFearGreed } from "./indicators/fearGreed";
import type { FearGreed, PriceSeries, SourceResult } from "./types";
import { scoreAsset, type ScoreResult } from "./scoring/score";
import { alignTo } from "./backtest/backtest";
import { marketClosedNote } from "./market/session";
import type Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "./news/types";
import { collectNews, newsHash } from "./news/collect";
import { generateBrief, type Brief } from "./ai/brief";
import { collectDiscoveries, type Universe } from "./discover/collect";
import type { Discoveries } from "./discover/discover";
import { convertBars, FX_PAIR, ratesFrom } from "./fx/fx";
import { yahooIntradayFetcher, type IntradaySeries } from "./adapters/yahooIntraday";

/** Devises dont on garde le taux contre l'euro (affichage et conversions). */
export const FX_CURRENCIES = ["USD", "GBP", "CHF"] as const;

export interface Snapshot {
  generatedAt: string;
  /** Ex. « Marché fermé (week-end) : cours du vendredi 20/11. » ; null si cours à jour. */
  marketNote: string | null;
  market: {
    vix: SourceResult<PriceSeries>;
    spx: SourceResult<PriceSeries>;
    fearGreed: SourceResult<FearGreed>;
  };
  prices: Record<string, SourceResult<PriceSeries>>;
  scores: Record<string, ScoreResult & { asOf: string }>;
  news: SourceResult<NewsItem[]>;
  brief: SourceResult<Brief>;
  discoveries: SourceResult<Discoveries> | null;
  /** Taux EURxxx=X (unités de devise pour 1 €), clé = devise. */
  fx: Record<string, SourceResult<PriceSeries>>;
  /** Cours intraday 5 jours / 15 min (job quotidien ; le Worker garde les précédents). */
  intraday?: Record<string, SourceResult<IntradaySeries>>;
}

export interface CollectOptions {
  delayMs?: number;
  finnhubKey?: string;
  /** Actualités par société (job quotidien). */
  companyNews?: boolean;
  /** Client Claude ; absent = pas de nouveau résumé (le précédent est conservé, marqué périmé). */
  anthropic?: Anthropic | null;
  names?: Record<string, string>;
  /** Univers des découvertes (job quotidien). Absent = on garde les découvertes précédentes. */
  universe?: Universe | null;
  /** Collecter l'intraday des valeurs suivies et des découvertes (job quotidien). */
  intraday?: boolean;
}

/** Calcule les scores de toutes les valeurs ; `previous` sert à l'hystérésis. */
export function scoreSnapshot(
  market: Snapshot["market"],
  prices: Snapshot["prices"],
  previous?: Snapshot | null,
  sentiments: Record<string, { value: number }> = {},
  fx?: Snapshot["fx"],
): Snapshot["scores"] {
  const out: Snapshot["scores"] = {};
  const benchUsd = market.spx.data?.bars ?? [];
  const rates = ratesFrom(fx);
  const vix = market.vix.data?.bars.at(-1)?.close ?? null;
  const fg = market.fearGreed.data?.value ?? null;
  for (const [sym, r] of Object.entries(prices)) {
    const bars = r.data?.bars;
    if (!bars || bars.length < 210) continue; // pas assez d'historique : pas de score
    const closes = bars.map((b) => b.close);
    // Force relative comparée dans la même devise (ex. ETF en euros vs S&P 500 converti en euros).
    const cur = r.data?.currency ?? "USD";
    const bench = cur === "USD" ? benchUsd : convertBars(benchUsd, "USD", cur === "GBp" ? "GBP" : cur, rates) ?? benchUsd;
    const benchCloses = alignTo(bars.map((b) => b.date), bench).map((x, i) => x ?? closes[i]);
    const res = scoreAsset({ closes, benchCloses, vix, fearGreed: fg, newsSentiment: sentiments[sym]?.value ?? null }, previous?.scores?.[sym]?.decision);
    out[sym] = { ...res, asOf: bars.at(-1)!.date };
  }
  return out;
}

/** Collecte complète. `previous` = dernier snapshot, utilisé comme valeur « périmée ». */
export async function collectSnapshot(symbols: string[], previous?: Snapshot | null, opt: CollectOptions = {}): Promise<Snapshot> {
  const delayMs = opt.delayMs ?? 300;
  const [vix, spx] = await Promise.all([
    withFallback([yahooFetcher("^VIX"), fredFetcher("VIXCLS", "^VIX")], previous?.market.vix),
    withFallback([yahooFetcher("^GSPC", "2y"), fredFetcher("SP500", "^GSPC")], previous?.market.spx),
  ]);

  const homemade = {
    name: "Indice maison",
    run: async () => {
      const v = vix.data?.bars.at(-1)?.close;
      if (v == null || !spx.data) throw new Error("VIX ou S&P 500 indisponible");
      return homemadeFearGreed(v, spx.data.bars.map((b) => b.close));
    },
  };
  const fearGreed = await withFallback([cnnFetcher(), homemade], previous?.market.fearGreed);

  const fx: Snapshot["fx"] = {};
  for (const c of FX_CURRENCIES) {
    const pair = FX_PAIR[c];
    const chain = [yahooFetcher(pair, "2y"), ...(c === "USD" ? [fredFetcher("DEXUSEU", pair)] : [])];
    fx[c] = await withFallback(chain, previous?.fx?.[c]);
  }

  const prices: Snapshot["prices"] = {};
  // Séquentiel avec petite pause : évite de saturer les sources gratuites.
  for (const s of symbols) {
    prices[s] = await withFallback([yahooFetcher(s, "2y"), stooqFetcher(s)], previous?.prices[s]);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  const market = { vix, spx, fearGreed };
  const now = new Date();

  // Actualités, puis brief Claude régénéré seulement si de nouvelles actualités sont arrivées.
  const news = await collectNews(symbols, { finnhubKey: opt.finnhubKey, companyNews: opt.companyNews, previous: previous?.news, now });
  const baseScores = scoreSnapshot(market, prices, previous, {}, fx);
  const brief = await makeBrief(news, baseScores, previous?.brief, opt, now);
  const scores = scoreSnapshot(market, prices, previous, brief.data?.sentiments ?? {}, fx);

  const discoveries = opt.universe
    ? await collectDiscoveries(opt.universe, { vix: vix.data?.bars.at(-1)?.close ?? null, fearGreed: fearGreed.data?.value ?? null, now, delayMs })
    : previous?.discoveries ?? null;

  let intraday = previous?.intraday;
  if (opt.intraday) {
    intraday = {};
    const extra = [...(discoveries?.data?.stocks ?? []), ...(discoveries?.data?.etfs ?? [])].map((d) => d.ticker);
    for (const s of [...new Set(["^GSPC", "^VIX", ...symbols, ...extra])]) {
      intraday[s] = await withFallback([yahooIntradayFetcher(s)], previous?.intraday?.[s]);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const lastUs = prices["SPY"]?.data?.bars.at(-1)?.date ?? spx.data?.bars.at(-1)?.date;
  return { generatedAt: now.toISOString(), marketNote: marketClosedNote(lastUs, now), market, prices, scores, news, brief, discoveries, fx, intraday };
}

async function makeBrief(
  news: SourceResult<NewsItem[]>,
  scores: Snapshot["scores"],
  previous: SourceResult<Brief> | undefined,
  opt: CollectOptions,
  now: Date,
): Promise<SourceResult<Brief>> {
  const items = news.data ?? [];
  const hash = newsHash(items);
  if (previous?.data && previous.data.newsHash === hash) return previous; // rien de nouveau : pas d'appel (économie)
  const stale = (error: string): SourceResult<Brief> =>
    previous?.data ? { ...previous, status: "stale", error } : { data: null, source: "Claude", fetchedAt: now.toISOString(), status: "error", error };
  if (!opt.anthropic) return stale("ANTHROPIC_API_KEY non configurée");
  if (!items.length) return stale("aucune actualité");
  try {
    const assets = Object.entries(scores).map(([symbol, s]) => ({ symbol, name: opt.names?.[symbol], decision: s.decision, reasons: s.reasons }));
    const data = await generateBrief(opt.anthropic, items.slice(0, 60), assets, hash, now);
    return { data, source: "Claude", fetchedAt: now.toISOString(), status: "ok" };
  } catch (e) {
    return stale(e instanceof Error ? e.message : String(e));
  }
}
