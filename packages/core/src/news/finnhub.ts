import type { Fetcher } from "../types";
import type { NewsItem } from "./types";
import { fetchText } from "../adapters/http";

// Finnhub (clé gratuite) : actualités générales et par société. La clé n'est jamais dans le dépôt.

interface FinnhubNews { headline?: string; url?: string; source?: string; datetime?: number; related?: string }

export function parseFinnhub(json: string, symbols: string[] = [], max = 20): NewsItem[] {
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error((arr as { error?: string })?.error ?? "réponse Finnhub invalide");
  return (arr as FinnhubNews[]).slice(0, max).flatMap((n) =>
    n.headline && n.url
      ? [{
          title: n.headline, url: n.url, source: n.source ?? "Finnhub",
          publishedAt: n.datetime ? new Date(n.datetime * 1000).toISOString() : "",
          symbols: symbols.length ? symbols : (n.related ? n.related.split(",").filter(Boolean) : []),
        }]
      : []);
}

export function finnhubGeneralFetcher(key: string): Fetcher<NewsItem[]> {
  return { name: "Finnhub", run: async () => parseFinnhub(await fetchText(`https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(key)}`)) };
}

export function finnhubCompanyFetcher(key: string, symbol: string, now = new Date()): Fetcher<NewsItem[]> {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 3 * 864e5).toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(key)}`;
  return { name: "Finnhub", run: async () => parseFinnhub(await fetchText(url), [symbol], 5) };
}
