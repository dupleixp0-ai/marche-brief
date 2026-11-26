import { withFallback } from "../fallback";
import type { SourceResult } from "../types";
import type { NewsItem } from "./types";
import { RSS_FEEDS, rssFetcher } from "./rss";
import { finnhubCompanyFetcher, finnhubGeneralFetcher } from "./finnhub";

/** Symbole couvert par l'offre gratuite de Finnhub (cotation américaine, sans suffixe de place). */
export const finnhubCovers = (symbol: string) => /^[A-Z]{1,5}(-[A-Z])?$/.test(symbol);

export interface NewsOptions {
  finnhubKey?: string;
  /** Actualités par société (19 appels) : job quotidien seulement, pas le Worker. */
  companyNews?: boolean;
  previous?: SourceResult<NewsItem[]> | null;
  now?: Date;
}

/** Regroupe les actualités : RSS officiels + Finnhub (si clé), dédoublonnées par lien, les plus récentes d'abord. */
export async function collectNews(symbols: string[], opt: NewsOptions = {}): Promise<SourceResult<NewsItem[]>> {
  const results: SourceResult<NewsItem[]>[] = [];
  for (const f of RSS_FEEDS) results.push(await withFallback([rssFetcher(f)]));
  if (opt.finnhubKey) {
    results.push(await withFallback([finnhubGeneralFetcher(opt.finnhubKey)]));
    // Offre gratuite Finnhub : sociétés américaines seulement (pas les cotations européennes « XXX.DE », « XXX.MI »).
    if (opt.companyNews) for (const s of symbols.filter(finnhubCovers)) results.push(await withFallback([finnhubCompanyFetcher(opt.finnhubKey, s, opt.now)]));
  }
  // Le Worker ne relit pas les actualités par société : il garde celles du dernier snapshot.
  if (!opt.companyNews && opt.previous?.data) {
    results.push({ ...opt.previous, data: opt.previous.data.filter((n) => n.symbols.length > 0) });
  }

  const seen = new Set<string>();
  const items = results.flatMap((r) => r.data ?? []).filter((n) => !seen.has(n.url) && !!seen.add(n.url));
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const ok = results.filter((r) => r.data);
  const errors = results.filter((r) => r.status === "error").map((r) => r.error).filter(Boolean);

  if (!ok.length) {
    return opt.previous?.data ? { ...opt.previous, status: "stale", error: errors.join(" | ") }
      : { data: null, source: "aucune", fetchedAt: (opt.now ?? new Date()).toISOString(), status: "error", error: errors.join(" | ") };
  }
  return {
    data: items.slice(0, 80),
    source: [...new Set(ok.map((r) => r.source))].join(", "),
    fetchedAt: (opt.now ?? new Date()).toISOString(),
    status: errors.length ? "fallback" : "ok",
    error: errors.length ? errors.join(" | ") : undefined,
  };
}

/** Empreinte des actualités : le résumé Claude n'est régénéré que si elle change. */
export function newsHash(items: NewsItem[]): string {
  let h = 2166136261;
  for (const u of items.map((n) => n.url).sort()) for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
