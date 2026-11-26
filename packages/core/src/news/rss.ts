import type { Fetcher } from "../types";
import type { NewsItem } from "./types";
import { fetchText } from "../adapters/http";

// Lecteur RSS minimal (sans dépendance, compatible Worker) : titre + lien + date uniquement.

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

export function parseRss(xml: string, source: string, max = 10): NewsItem[] {
  if (!/<rss|<feed/i.test(xml)) throw new Error("flux RSS invalide");
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.slice(0, max).flatMap((b) => {
    const title = tag(b, "title"), url = tag(b, "link"), date = tag(b, "pubDate");
    if (!title || !/^https?:\/\//.test(url)) return [];
    const t = Date.parse(date);
    return [{ title, url, source, publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : "", symbols: [] }];
  });
}

export const RSS_FEEDS = [
  { source: "Réserve fédérale", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { source: "BCE", url: "https://www.ecb.europa.eu/rss/press.html" },
];

export function rssFetcher(feed: { source: string; url: string }): Fetcher<NewsItem[]> {
  return { name: feed.source, run: async () => parseRss(await fetchText(feed.url), feed.source) };
}
