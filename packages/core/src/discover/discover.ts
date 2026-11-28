// Rubrique « Découvertes » (section 7) : sélection d'actions et d'ETF prometteurs.
import type { Bar } from "../types";
import { scoreAsset, type Decision, type Factor } from "../scoring/score";
import { alignTo } from "../backtest/backtest";
import { returnOver, drawdown, volatility } from "../indicators/series";
import { isExchangeOpen } from "../market/exchanges";

export interface UniverseItem {
  ticker: string; name: string; type: "stock" | "etf"; region: string; country: string;
  exchange: string; sector: string; broker?: boolean | null;
}

export interface Discovery {
  ticker: string; name: string; type: "stock" | "etf"; region: string; country: string; exchange: string; sector: string;
  currency: string;
  score: number; decision: Decision; factors: Factor[];
  lastClose: number; lastDate: string; marketOpen: boolean | null;
  /** Heure exacte du dernier cours (ISO), si connue. */
  lastTime?: string;
  perf3m: number | null;       // en devise de cotation
  perf3mEUR: number | null;    // converti en euros
  relRegion: number | null;    // vs indice régional, 3 mois
  relWorld: number | null;     // vs indice mondial, 3 mois
  breakout: boolean;           // proche du plus haut 1 an avec volume en hausse
  buyable: boolean | null;
  spark: number[];
  /** ~1 an de clôtures (graphiques de la fiche détail). */
  history: Bar[];
  why: string[];
  risks: string[];
}

export interface CandidateInput {
  item: UniverseItem;
  bars: Bar[];
  currency: string;               // devise Yahoo (ex. "USD", "GBp")
  quoteTime?: string;             // heure exacte du dernier cours (ISO)
  regionBench: Bar[];
  worldBench: Bar[];
  eurPerUnit: Bar[] | null;       // EUR pour 1 unité de la devise (null si EUR)
  vix: number | null;
  fearGreed: number | null;
  minTurnoverEUR: number;
  now: Date;
}

export type Evaluated = { ok: true; d: Discovery } | { ok: false; ticker: string; reason: string };

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1).replace(".", ",")} %`;
const COUNTRY_RISK: Record<string, string> = {
  US: "Risque de change dollar/euro.",
  GB: "Risque de change livre/euro.",
  CH: "Risque de change franc suisse/euro.",
  SE: "Risque de change couronne suédoise/euro.",
  DK: "Couronne danoise arrimée à l'euro : risque de change faible.",
  NO: "Risque de change couronne norvégienne/euro, sensible au pétrole.",
};

export function evaluateCandidate(c: CandidateInput): Evaluated {
  const { item, bars, now } = c;
  const fail = (reason: string): Evaluated => ({ ok: false, ticker: item.ticker, reason });

  // Qualité des données : historique complet, cours récent, liquidité suffisante.
  if (bars.length < 210) return fail("historique insuffisant");
  const last = bars[bars.length - 1];
  const ageDays = (now.getTime() - Date.parse(`${last.date}T23:59:59Z`)) / 864e5;
  if (ageDays > 6) return fail(`dernier cours trop ancien (${last.date})`);
  const dates = bars.map((b) => b.date);
  const closes = bars.map((b) => b.close);
  const pence = c.currency === "GBp" || c.currency === "GBX";
  const fx = c.eurPerUnit ? alignTo(dates, c.eurPerUnit) : null;
  if (fx && fx.at(-1) == null) return fail("taux de change indisponible");
  const vols = bars.slice(-20).map((b) => b.volume ?? 0);
  const turnover = (vols.reduce((s, v) => s + v, 0) / 20) * last.close * (pence ? 0.01 : 1) * (fx?.at(-1) ?? 1);
  if (!(turnover >= c.minTurnoverEUR)) return fail("liquidité insuffisante");

  const region = alignTo(dates, c.regionBench).map((x, i) => x ?? closes[i]);
  const world = alignTo(dates, c.worldBench);
  const res = scoreAsset({ closes, benchCloses: region, vix: c.vix, fearGreed: c.fearGreed });

  const r3 = returnOver(closes, 63);
  const reg3 = returnOver(region, 63);
  const w = world.filter((x): x is number => x != null);
  const w3 = w.length > 64 ? returnOver(w, 63) : null;
  const fxRatio = fx && fx.length > 64 && fx.at(-64) ? (fx.at(-1)! / fx.at(-64)!) : 1;
  const r3EUR = r3 == null ? null : (1 + r3) * fxRatio - 1;

  const high = Math.max(...closes.slice(-252));
  const vol20 = vols.reduce((s, v) => s + v, 0) / 20;
  const vol50 = bars.slice(-50).reduce((s, b) => s + (b.volume ?? 0), 0) / 50;
  const breakout = last.close >= high * 0.97 && vol50 > 0 && vol20 > vol50 * 1.1;

  const relRegion = r3 != null && reg3 != null ? r3 - reg3 : null;
  const relWorld = r3EUR != null && w3 != null ? r3EUR - w3 : null;
  const v = volatility(closes, 20), dd = drawdown(closes, 252);

  const why: string[] = [];
  if (relRegion != null && relRegion > 0) why.push(`Fait mieux que son marché de référence sur 3 mois (${pct(relRegion)}).`);
  if (breakout) why.push("Proche de son plus haut sur un an, avec des volumes en hausse (cassure possible).");
  const trend = res.factors.find((f) => f.key === "trend");
  if (trend && trend.score >= 65) why.push("Tendance haussière : cours au-dessus de ses moyennes mobiles.");
  if (r3EUR != null && r3 != null && r3EUR > r3 + 0.02) why.push("La devise a renforcé la performance en euros.");
  if (!why.length) why.push(res.reasons[0] ?? "Score global parmi les meilleurs de l'univers.");

  const risks: string[] = [];
  if (v != null && v > 0.4) risks.push(`Volatilité élevée (${(v * 100).toFixed(0)} % annualisée).`);
  if (dd != null && dd < -0.15) risks.push(`Encore ${pct(dd)} sous son plus haut sur un an.`);
  const rsiF = res.factors.find((f) => f.key === "momentum");
  if (rsiF?.reason.includes("surachat")) risks.push("RSI en surachat : risque de repli à court terme.");
  if (COUNTRY_RISK[item.country]) risks.push(COUNTRY_RISK[item.country]);
  if (r3EUR != null && r3 != null && r3EUR < r3 - 0.02) risks.push("La devise a réduit la performance en euros.");
  if (item.type === "etf" && item.sector === "Émergents") risks.push("Marchés émergents : risques politiques et de liquidité plus élevés.");
  if (!risks.length) risks.push("Risque de marché général : un score élevé ne garantit pas la hausse.");

  return {
    ok: true,
    d: {
      ...item, currency: c.currency, score: res.score, decision: res.decision, factors: res.factors,
      lastClose: last.close, lastDate: last.date, ...(c.quoteTime ? { lastTime: c.quoteTime } : {}), marketOpen: isExchangeOpen(item.exchange, now),
      perf3m: r3, perf3mEUR: r3EUR, relRegion, relWorld, breakout, buyable: item.broker ?? null,
      spark: closes.slice(-63), history: bars.slice(-260).map((b) => ({ date: b.date, close: +b.close.toPrecision(6) })), why: why.slice(0, 3), risks: risks.slice(0, 3),
    },
  };
}

/**
 * Classement : score décroissant, filtré (force relative positive, volatilité acceptable),
 * diversifié (au plus `perCountry` valeurs d'un même pays et `perSector` d'un même secteur).
 */
export function rankDiscoveries(list: Discovery[], n = 5, perCountry = 2, perSector = 2): Discovery[] {
  const eligible = list
    .filter((d) => (d.relRegion ?? 0) > 0 && (d.factors.find((f) => f.key === "risk")?.score ?? 0) >= 30)
    .sort((a, b) => b.score - a.score);
  const out: Discovery[] = [], byC: Record<string, number> = {}, byS: Record<string, number> = {};
  for (const d of eligible) {
    if ((byC[d.country] ?? 0) >= perCountry || (byS[d.sector] ?? 0) >= perSector) continue;
    out.push(d);
    byC[d.country] = (byC[d.country] ?? 0) + 1;
    byS[d.sector] = (byS[d.sector] ?? 0) + 1;
    if (out.length === n) break;
  }
  return out;
}

export interface Discoveries {
  generatedAt: string;
  regions: string[];
  scanned: number;
  excluded: { ticker: string; reason: string }[];
  /** Top 5 global + top 5 par région, pour les filtres de l'interface. */
  stocks: Discovery[];
  etfs: Discovery[];
}

export function buildDiscoveries(evals: Evaluated[], now: Date): Discoveries {
  const ok = evals.flatMap((e) => (e.ok ? [e.d] : []));
  const regions = [...new Set(ok.map((d) => d.region))];
  const pick = (type: "stock" | "etf") => {
    const pool = ok.filter((d) => d.type === type);
    const all = [rankDiscoveries(pool), ...regions.map((r) => rankDiscoveries(pool.filter((d) => d.region === r)))].flat();
    return [...new Map(all.map((d) => [d.ticker, d])).values()];
  };
  return {
    generatedAt: now.toISOString(), regions, scanned: evals.length,
    excluded: evals.flatMap((e) => (e.ok ? [] : [{ ticker: e.ticker, reason: e.reason }])),
    stocks: pick("stock"), etfs: pick("etf"),
  };
}
