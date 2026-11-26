export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  /** Symboles suivis concernés (vide = actualité générale). */
  symbols: string[];
}
