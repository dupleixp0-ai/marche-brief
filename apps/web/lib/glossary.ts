// Sigles et abréviations des noms d'ETF, avec leur nom complet (affichage uniquement).
export const GLOSSARY: Record<string, string> = {
  ETF: "Exchange Traded Fund : fonds indiciel coté en bourse",
  ETC: "Exchange Traded Commodity : titre coté adossé à une matière première (ici de l'or physique)",
  UCITS: "Undertakings for Collective Investment in Transferable Securities : norme européenne de protection des fonds (OPCVM)",
  MSCI: "Morgan Stanley Capital International : fournisseur d'indices boursiers",
  EM: "Emerging Markets : marchés émergents (Chine, Inde, Taïwan, Brésil…)",
  IMI: "Investable Market Index : grandes, moyennes ET petites entreprises",
  Core: "Gamme « Core » d'iShares : ETF de base à frais réduits",
  Acc: "Accumulating (capitalisant) : les dividendes sont réinvestis automatiquement",
  Dist: "Distributing (distribuant) : les dividendes sont versés",
  USD: "Dollar américain : devise de référence du fonds (il se négocie en € sur Xetra)",
  EUR: "Euro",
  NASDAQ: "National Association of Securities Dealers Automated Quotations : bourse américaine et fournisseur d'indices",
  Nasdaq: "National Association of Securities Dealers Automated Quotations : bourse américaine et fournisseur d'indices",
  "S&P": "Standard & Poor's : fournisseur d'indices (S&P 500 = 500 grandes entreprises américaines)",
  STOXX: "Fournisseur d'indices européens (groupe Deutsche Börse)",
  SRI: "Socially Responsible Investment : investissement socialement responsable",
  ESG: "Environnement, Social, Gouvernance : critères extra-financiers",
  ISIN: "International Securities Identification Number : identifiant unique d'un titre",
  ACWI: "All Country World Index : pays développés + émergents",
  REIT: "Real Estate Investment Trust : société foncière cotée",
  PHLX: "Philadelphia Stock Exchange : indice des semi-conducteurs (SOX)",
  ETN: "Exchange Traded Note : titre de dette coté",
};

/** Sigles du glossaire présents dans un texte (dans l'ordre d'apparition, sans doublon). */
export function termsIn(text: string): { term: string; meaning: string }[] {
  const found: { term: string; meaning: string; at: number }[] = [];
  for (const [term, meaning] of Object.entries(GLOSSARY)) {
    const re = new RegExp(`(^|[^A-Za-z&])${term.replace(/[&]/g, "\\&")}(?![A-Za-z])`);
    const m = re.exec(text);
    if (m && !found.some((f) => f.meaning === meaning)) found.push({ term, meaning, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map(({ term, meaning }) => ({ term, meaning }));
}
