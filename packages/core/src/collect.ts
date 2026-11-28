import { withFallback } from "./fallback";
import { yahooFetcher } from "./adapters/yahoo";
import { stooqFetcher } from "./adapters/stooq";
import { fredFetcher } from "./adapters/fred";
import { cnnFetcher } from "./adapters/cnn";
import { homemadeFearGreed, homemadeFearGreedHistory } from "./indicators/fearGreed";
import type { FearGreed, PriceSeries, SourceResult } from "./types";
import { scoreAsset, type ScoreResult } from "./scoring/score";
import { timingOf, type Timing, type TimingStats } from "./timing/timing";
import { alignTo } from "./backtest/backtest";
import { marketClosedNote } from "./market/session";
import type Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "./news/types";
import { collectNews, newsHash } from "./news/collect";
import { generateBrief, type Brief } from "./ai/brief";
import { dailyPoint } from "./market/dailyPoint";
import { marketOutlook } from "./market/outlook";
import { collectDiscoveries, type Universe } from "./discover/collect";
import type { Discoveries } from "./discover/discover";
import { convertBars, FX_PAIR, ratesFrom } from "./fx/fx";
import { yahooIntradayFetcher, type IntradaySeries } from "./adapters/yahooIntraday";
import { lateSymbol, mergeLateQuote, yahooLateQuoteFetcher } from "./adapters/lateQuote";

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
  scores: Record<string, ScoreResult & { asOf: string; timing?: Timing }>;
  /** Statistiques historiques du « moment d'entrée » (étude sur 10 ans, data/timing.json). */
  timingStats?: TimingStats;
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
  /**
   * Actualisation des cours seulement (bouton « Actualiser ») : cours, marché, taux et scores.
   * Actualités, brief Claude, découvertes et intraday du snapshot précédent sont conservés tels quels.
   */
  quotesOnly?: boolean;
  /** Nombre de cours téléchargés en parallèle (1 = séquentiel, défaut). */
  concurrency?: number;
  /** Statistiques de l'étude « moment d'entrée » (data/timing.json). Absent = celles du snapshot précédent. */
  timingStats?: TimingStats;
}

/** Exécute `fn` sur chaque élément avec au plus `n` appels simultanés. */
async function mapLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Peur du marché pour le « moment d'entrée » : indice maison (VIX + S&P 500), le même que dans l'étude sur 10 ans. */
export function marketFearOf(market: Snapshot["market"]): number | null {
  const vix = market.vix.data?.bars.at(-1)?.close;
  const spx = market.spx.data?.bars ?? [];
  return vix != null && spx.length > 125 ? homemadeFearGreed(vix, spx.map((b) => b.close)).value : null;
}

/**
 * Complète un snapshot qui n'a pas encore le « moment d'entrée » (snapshot publié avant la fonction,
 * ou statistiques plus récentes) : même calcul que lors de la collecte, sans rien télécharger.
 */
export function withTiming(snap: Snapshot, stats?: TimingStats): Snapshot {
  const st = stats ?? snap.timingStats;
  const fear = marketFearOf(snap.market);
  const scores: Snapshot["scores"] = {};
  for (const [sym, s] of Object.entries(snap.scores ?? {})) {
    const bars = snap.prices[sym]?.data?.bars;
    const timing = s.timing ?? (bars ? timingOf(bars.map((b) => b.close), fear, st) ?? undefined : undefined);
    scores[sym] = timing ? { ...s, timing } : s;
  }
  return { ...snap, scores, ...(st ? { timingStats: st } : {}) };
}

/** Calcule les scores de toutes les valeurs ; `previous` sert à l'hystérésis. */
export function scoreSnapshot(
  market: Snapshot["market"],
  prices: Snapshot["prices"],
  previous?: Snapshot | null,
  sentiments: Record<string, { value: number }> = {},
  fx?: Snapshot["fx"],
  timingStats?: TimingStats,
): Snapshot["scores"] {
  const out: Snapshot["scores"] = {};
  const benchUsd = market.spx.data?.bars ?? [];
  const rates = ratesFrom(fx);
  const vix = market.vix.data?.bars.at(-1)?.close ?? null;
  const fg = market.fearGreed.data?.value ?? null;
  const marketFear = marketFearOf(market);
  for (const [sym, r] of Object.entries(prices)) {
    const bars = r.data?.bars;
    if (!bars || bars.length < 210) continue; // pas assez d'historique : pas de score
    const closes = bars.map((b) => b.close);
    // Force relative comparée dans la même devise (ex. ETF en euros vs S&P 500 converti en euros).
    const cur = r.data?.currency ?? "USD";
    const bench = cur === "USD" ? benchUsd : convertBars(benchUsd, "USD", cur === "GBp" ? "GBP" : cur, rates) ?? benchUsd;
    const benchCloses = alignTo(bars.map((b) => b.date), bench).map((x, i) => x ?? closes[i]);
    const res = scoreAsset({ closes, benchCloses, vix, fearGreed: fg, newsSentiment: sentiments[sym]?.value ?? null }, previous?.scores?.[sym]?.decision);
    const timing = timingOf(closes, marketFear, timingStats) ?? undefined;
    out[sym] = { ...res, asOf: bars.at(-1)!.date, ...(timing ? { timing } : {}) };
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
  // Actualisation : si CNN refuse, on garde la valeur CNN du matin (marquée périmée) plutôt que l'indice maison.
  const keepCnn = opt.quotesOnly && previous?.market?.fearGreed?.data;
  const fearGreed = await withFallback(keepCnn ? [cnnFetcher()] : [cnnFetcher(), homemade], previous?.market.fearGreed);
  // Sans historique CNN : historique calculé avec l'indice maison (signalé comme tel).
  if (fearGreed.data && !fearGreed.data.history?.length && vix.data && spx.data) {
    fearGreed.data = { ...fearGreed.data, history: homemadeFearGreedHistory(vix.data.bars, spx.data.bars), historyHomemade: true };
  }

  const fx: Snapshot["fx"] = {};
  for (const c of FX_CURRENCIES) {
    const pair = FX_PAIR[c];
    const chain = [yahooFetcher(pair, "2y"), ...(c === "USD" ? [fredFetcher("DEXUSEU", pair)] : [])];
    fx[c] = await withFallback(chain, previous?.fx?.[c]);
  }

  const prices: Snapshot["prices"] = {};
  // Séquentiel avec petite pause : évite de saturer les sources gratuites.
  await mapLimit(symbols, opt.concurrency ?? 1, async (s) => {
    prices[s] = await withFallback([yahooFetcher(s, "2y"), stooqFetcher(s)], previous?.prices[s]);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  });

  // Cours du soir (Düsseldorf) pour les cotations européennes : plus proche du dernier cours de Trade Republic.
  const late = symbols.filter((s) => prices[s]?.data && lateSymbol(s));
  await mapLimit(late, opt.concurrency ?? 1, async (s) => {
    try {
      const q = await yahooLateQuoteFetcher(lateSymbol(s)!).run();
      prices[s] = { ...prices[s], data: mergeLateQuote(prices[s].data!, q) };
    } catch { /* place secondaire indisponible : on garde le cours de la place principale */ }
  });

  const market = { vix, spx, fearGreed };
  const now = new Date();

  // Actualités, puis brief Claude régénéré seulement si de nouvelles actualités sont arrivées.
  const keep = opt.quotesOnly && previous;
  const news = keep ? previous.news : await collectNews(symbols, { finnhubKey: opt.finnhubKey, companyNews: opt.companyNews, previous: previous?.news, now });
  const baseScores = scoreSnapshot(market, prices, previous, {}, fx);
  // Contexte chiffré pour Claude : mêmes phrases que « Le point du jour » (marché, nervosité, tendance).
  const spxC = spx.data?.bars.map((b) => b.close) ?? [], vixC = vix.data?.bars.map((b) => b.close) ?? [];
  const context = dailyPoint({
    spx: spx.data?.bars ?? [], vix: vix.data?.bars ?? [], fearGreed: fearGreed.data, marketNote: null, etfs: [], stocks: [],
    outlook: marketOutlook({ spxCloses: spxC, vixCloses: vixC, fearGreed: fearGreed.data?.value ?? null }),
  }).map((p) => `- ${p.text}`).join("\n");
  const brief = keep ? previous.brief : await makeBrief(news, baseScores, previous?.brief, opt, now, context);
  const timingStats = opt.timingStats ?? previous?.timingStats;
  const scores = scoreSnapshot(market, prices, previous, brief.data?.sentiments ?? {}, fx, timingStats);

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
  return { generatedAt: now.toISOString(), marketNote: marketClosedNote(lastUs, now), market, prices, scores, news, brief, discoveries, fx, intraday, ...(timingStats ? { timingStats } : {}) };
}

async function makeBrief(
  news: SourceResult<NewsItem[]>,
  scores: Snapshot["scores"],
  previous: SourceResult<Brief> | undefined,
  opt: CollectOptions,
  now: Date,
  context?: string,
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
    const data = await generateBrief(opt.anthropic, items.slice(0, 60), assets, hash, now, context);
    return { data, source: "Claude", fetchedAt: now.toISOString(), status: "ok" };
  } catch (e) {
    return stale(e instanceof Error ? e.message : String(e));
  }
}
