// Portefeuille personnel : valeur, gains/pertes, poids, impôt estimé (Allemagne) et lecture
// « Renforcer / Conserver / Alléger » à partir du score. Les positions ne quittent jamais l'appareil :
// ce module ne fait que calculer, il ne stocke rien.
import type { Bar } from "../types";
import type { Decision } from "../scoring/score";
import { sma } from "../indicators/sma";
import { fxFactor, type FxRates } from "../fx/fx";

/** Ligne saisie par l'utilisateur. `avgPrice` est dans `avgCurrency` (EUR par défaut, comme chez Trade Republic). */
export interface Holding {
  ticker: string;
  shares: number;
  avgPrice: number;
  avgCurrency?: string;
}

/** Catégorie fiscale allemande : fonds actions (exonération partielle de 30 %), action, autre (or…). */
export type TaxClass = "equityFund" | "stock" | "other";

export interface HoldingMarket {
  bars: Bar[];
  currency?: string;
  decision?: Decision;
  score?: number;
  isEtf?: boolean;
  taxClass?: TaxClass;
}

export type Reading = "Renforcer" | "Conserver" | "Alléger";

export interface HoldingRow {
  ticker: string;
  shares: number;
  avgPrice: number;
  /** Cours actuel dans la devise d'affichage. */
  price: number | null;
  asOf: string | null;
  value: number | null;
  cost: number | null;
  pnl: number | null;
  pnlPct: number | null;
  dayPnl: number | null;
  weight: number | null;
  taxClass: TaxClass;
  /** Gain imposable (après exonération partielle), avant abattement. */
  taxableGain: number | null;
  decision?: Decision;
  score?: number;
  reading: Reading | null;
  reasons: string[];
}

export interface PortfolioSummary {
  currency: string;
  rows: HoldingRow[];
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number | null;
  dayPnl: number;
  /** Lignes sans cours (exclues des totaux). */
  missing: string[];
  tax: TaxEstimate;
}

export interface TaxEstimate {
  rate: number;
  allowance: number;
  taxableGain: number;
  tax: number;
  netPnl: number;
}

/** Impôt allemand sur les plus-values : 25 % + 5,5 % de solidarité = 26,375 % (hors impôt d'église). */
export const DE_TAX_RATE = 0.26375;
/** Abattement annuel (Sparerpauschbetrag) pour une personne seule. */
export const DE_ALLOWANCE = 1000;
/** Part exonérée des gains pour un fonds actions (Teilfreistellung). */
export const PARTIAL_EXEMPTION: Record<TaxClass, number> = { equityFund: 0.3, stock: 0, other: 0 };

/** Seuils de lecture (transparents et testés). */
export const READING_RULES = { maxWeight: 0.35, reinforceMaxWeight: 0.25, bigGain: 0.5, bigLoss: -0.2 };

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

/** Impôt estimé si tous les gains imposables étaient réalisés (gains et pertes compensés, simplifié). */
export function estimateTax(taxableGain: number, allowance = DE_ALLOWANCE, rate = DE_TAX_RATE, pnl = taxableGain): TaxEstimate {
  const base = Math.max(0, taxableGain - Math.max(0, allowance));
  const tax = base * rate;
  return { rate, allowance, taxableGain, tax, netPnl: pnl - tax };
}

/** Lecture d'une position : le score, rapporté à ta situation (gain/perte, poids, tendance). */
export function positionReading(inp: {
  decision?: Decision; score?: number; pnlPct: number | null; weight: number | null; aboveMa200: boolean | null; isEtf?: boolean;
}): { reading: Reading | null; reasons: string[] } {
  if (!inp.decision) return { reading: null, reasons: ["Pas de score pour cette valeur."] };
  const r: string[] = [];
  const w = inp.weight ?? 0;
  const heavy = w > READING_RULES.maxWeight;
  let reading: Reading;

  if (inp.decision === "Vendre") {
    reading = "Alléger";
    r.push(`Score ${inp.score ?? "—"} : tendance dégradée.`);
  } else if (heavy) {
    reading = inp.decision === "Acheter" ? "Conserver" : "Alléger";
    r.push(`Pèse ${pct(w).replace("+", "")} du portefeuille : concentration élevée (seuil ${READING_RULES.maxWeight * 100} %).`);
  } else if (inp.decision === "Acheter" && w < READING_RULES.reinforceMaxWeight) {
    reading = "Renforcer";
    r.push(`Score ${inp.score ?? "—"} : signal positif et poids raisonnable (${pct(w).replace("+", "")}).`);
  } else {
    reading = "Conserver";
    r.push(`Score ${inp.score ?? "—"} : ${inp.decision === "Acheter" ? "signal positif" : "pas de signal net"}.`);
  }

  if (inp.aboveMa200 === false) r.push("Cours sous sa moyenne 200 jours (tendance de fond baissière).");
  else if (inp.aboveMa200 === true) r.push("Cours au-dessus de sa moyenne 200 jours (tendance de fond intacte).");

  if (inp.pnlPct != null) {
    if (inp.pnlPct >= READING_RULES.bigGain) r.push(`En gain de ${pct(inp.pnlPct)} : alléger une partie sécuriserait ce gain.`);
    else if (inp.pnlPct <= READING_RULES.bigLoss) r.push(`En perte de ${pct(inp.pnlPct)} : vérifier si la raison de l'achat tient toujours.`);
    else r.push(`${inp.pnlPct >= 0 ? "En gain" : "En perte"} de ${pct(inp.pnlPct)} sur ton cours moyen.`);
  }
  if (heavy && inp.decision !== "Vendre" && reading === "Conserver") r.push("Signal positif, mais éviter de renforcer encore cette ligne.");
  if (heavy && inp.decision === "Vendre") r.push(`Pèse ${pct(w).replace("+", "")} du portefeuille : concentration élevée.`);
  if (inp.isEtf && reading === "Alléger") r.push("Pour un ETF de long terme, « Alléger » ne veut pas dire tout vendre.");
  return { reading, reasons: r };
}

/** Évalue le portefeuille dans la devise `currency` (EUR par défaut). */
export function evaluatePortfolio(
  holdings: Holding[], market: Record<string, HoldingMarket | undefined>, rates: FxRates,
  opt: { currency?: string; allowance?: number } = {},
): PortfolioSummary {
  const currency = opt.currency ?? "EUR";
  const rows: HoldingRow[] = holdings.map((h) => {
    const m = market[h.ticker];
    const bars = m?.bars ?? [];
    const last = bars.at(-1), prev = bars.at(-2);
    const taxClass: TaxClass = m?.taxClass ?? (m?.isEtf ? "equityFund" : "stock");
    const k = last ? fxFactor(m?.currency, currency, last.date, rates) : null;
    const today = new Date().toISOString().slice(0, 10);
    const kAvg = fxFactor(h.avgCurrency ?? "EUR", currency, last?.date ?? today, rates);
    const price = last && k != null ? last.close * k : null;
    const value = price != null ? price * h.shares : null;
    const cost = kAvg != null ? h.avgPrice * kAvg * h.shares : null;
    const pnl = value != null && cost != null ? value - cost : null;
    const pnlPct = pnl != null && cost ? pnl / cost : null;
    const kPrev = prev ? fxFactor(m?.currency, currency, prev.date, rates) : null;
    const dayPnl = price != null && prev && kPrev != null ? (price - prev.close * kPrev) * h.shares : null;
    // L'exonération partielle s'applique aussi aux pertes d'un fonds actions.
    const taxableGain = pnl != null ? pnl * (1 - PARTIAL_EXEMPTION[taxClass]) : null;
    return {
      ticker: h.ticker, shares: h.shares, avgPrice: h.avgPrice, price, asOf: last?.date ?? null,
      value, cost, pnl, pnlPct, dayPnl, weight: null, taxClass, taxableGain,
      decision: m?.decision, score: m?.score, reading: null, reasons: [],
    };
  });

  const priced = rows.filter((r) => r.value != null && r.cost != null);
  const value = priced.reduce((s, r) => s + r.value!, 0);
  const cost = priced.reduce((s, r) => s + r.cost!, 0);
  const pnl = value - cost;
  for (const r of rows) {
    r.weight = r.value != null && value > 0 ? r.value / value : null;
    const m = market[r.ticker];
    const closes = (m?.bars ?? []).map((b) => b.close);
    const ma200 = sma(closes, 200);
    const aboveMa200 = ma200 == null || !closes.length ? null : closes.at(-1)! >= ma200;
    Object.assign(r, positionReading({ decision: r.decision, score: r.score, pnlPct: r.pnlPct, weight: r.weight, aboveMa200, isEtf: m?.isEtf }));
  }
  const taxable = priced.reduce((s, r) => s + (r.taxableGain ?? 0), 0);
  return {
    currency, rows, value, cost, pnl, pnlPct: cost ? pnl / cost : null,
    dayPnl: priced.reduce((s, r) => s + (r.dayPnl ?? 0), 0),
    missing: rows.filter((r) => r.value == null || r.cost == null).map((r) => r.ticker),
    tax: estimateTax(taxable, opt.allowance ?? DE_ALLOWANCE, DE_TAX_RATE, pnl),
  };
}

/** Valide une ligne saisie (nombre de parts et cours moyen strictement positifs). */
export function validateHolding(h: Partial<Holding>): string | null {
  if (!h.ticker || !/^[A-Za-z0-9.^=-]{1,15}$/.test(h.ticker)) return "Symbole invalide.";
  if (!(typeof h.shares === "number" && Number.isFinite(h.shares) && h.shares > 0)) return "Le nombre de parts doit être positif.";
  if (!(typeof h.avgPrice === "number" && Number.isFinite(h.avgPrice) && h.avgPrice > 0)) return "Le cours moyen doit être positif.";
  return null;
}
