export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  /** Symboles suivis concernés (vide = actualité générale). */
  symbols: string[];
  /** Court résumé fourni par la source (RSS description, Finnhub summary), si disponible. */
  summary?: string;
}
