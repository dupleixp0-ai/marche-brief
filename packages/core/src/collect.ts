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
}

/** Calcule les scores de toutes les valeurs ; `previous` sert à l'hystérésis. */
export function scoreSnapshot(
  market: Snapshot["market"],
  prices: Snapshot["prices"],
  previous?: Snapshot | null,
  sentiments: Record<string, { value: number }> = {},
): Snapshot["scores"] {
  const out: Snapshot["scores"] = {};
  const bench = market.spx.data?.bars ?? [];
  const vix = market.vix.data?.bars.at(-1)?.close ?? null;
  const fg = market.fearGreed.data?.value ?? null;
  for (const [sym, r] of Object.entries(prices)) {
    const bars = r.data?.bars;
    if (!bars || bars.length < 210) continue; // pas assez d'historique : pas de score
    const closes = bars.map((b) => b.close);
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
  const baseScores = scoreSnapshot(market, prices, previous);
  const brief = await makeBrief(news, baseScores, previous?.brief, opt, now);
  const scores = scoreSnapshot(market, prices, previous, brief.data?.sentiments ?? {});

  const discoveries = opt.universe
    ? await collectDiscoveries(opt.universe, { vix: vix.data?.bars.at(-1)?.close ?? null, fearGreed: fearGreed.data?.value ?? null, now, delayMs })
    : previous?.discoveries ?? null;

  const lastUs = prices["SPY"]?.data?.bars.at(-1)?.date ?? spx.data?.bars.at(-1)?.date;
  return { generatedAt: now.toISOString(), marketNote: marketClosedNote(lastUs, now), market, prices, scores, news, brief, discoveries };
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
