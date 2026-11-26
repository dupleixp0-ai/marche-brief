// Moteur de score explicable (section 6 de CLAUDE.md).
import { sma } from "../indicators/sma";
import { rsi, returnOver, volatility, drawdown, smaSlope } from "../indicators/series";

export type FactorKey = "trend" | "momentum" | "relative" | "risk" | "news" | "market";
export type Decision = "Acheter" | "Attendre" | "Vendre";

export const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  trend: 0.3, momentum: 0.25, relative: 0.15, risk: 0.15, news: 0.1, market: 0.05,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  trend: "Tendance", momentum: "Momentum", relative: "Force relative",
  risk: "Risque", news: "Actualité", market: "Contexte de marché",
};

export const THRESHOLDS = { buy: 65, sell: 40, hysteresis: 3 };

export interface ScoreInput {
  closes: number[];          // valeur étudiée, ordre chronologique
  benchCloses: number[];     // S&P 500 sur les mêmes dates
  vix: number | null;
  fearGreed: number | null;  // 0–100
  newsSentiment?: number | null; // −1..+1 (étape 6) ; absent = neutre
}

export interface Factor {
  key: FactorKey;
  label: string;
  score: number;   // 0–100
  weight: number;
  reason: string;  // phrase explicative
}

export interface ScoreResult {
  score: number;
  decision: Decision;
  confidence: "faible" | "moyenne" | "élevée";
  factors: Factor[];
  reasons: string[];
}

/** Interpolation linéaire bornée : x=lo → 0, x=hi → 100. */
const lin = (x: number, lo: number, hi: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1).replace(".", ",")} %`;
const avg = (xs: [number | null, number][]) => {
  const ok = xs.filter(([v]) => v != null) as [number, number][];
  const w = ok.reduce((s, [, w]) => s + w, 0);
  return w ? ok.reduce((s, [v, wt]) => s + v * wt, 0) / w : 50;
};

export function computeFactors(inp: ScoreInput, weights = DEFAULT_WEIGHTS): Factor[] {
  const c = inp.closes;
  const last = c[c.length - 1];
  const f = (key: FactorKey, score: number, reason: string): Factor =>
    ({ key, label: FACTOR_LABELS[key], score: Math.round(score), weight: weights[key], reason });

  // Tendance : écart aux MM50/125/200 (±5 %) et pente de la MM50 (±3 % sur 20 j).
  const ma = [50, 125, 200].map((p) => sma(c, p));
  const dist = ma.map((m) => (m ? last / m - 1 : null));
  const slope = smaSlope(c, 50, 20);
  const trend = avg([...dist.map((d) => [d == null ? null : lin(d, -0.05, 0.05), 1] as [number | null, number]),
    [slope == null ? null : lin(slope, -0.03, 0.03), 1]]);
  const above = dist.filter((d) => d != null && d > 0).length;
  const trendReason = `Cours au-dessus de ${above} moyenne(s) mobile(s) sur 3 (MM200 : ${dist[2] == null ? "n.d." : pct(dist[2])})`
    + (slope == null ? "" : `, MM50 ${slope >= 0 ? "en hausse" : "en baisse"}`);

  // Momentum : rendements 1/3/6 mois (±15 %) + RSI(14).
  const r1 = returnOver(c, 21), r3 = returnOver(c, 63), r6 = returnOver(c, 126);
  const rs = rsi(c, 14);
  const rsiScore = rs == null ? null : rs <= 70 ? lin(rs, 30, 70) : Math.max(0, 100 - (rs - 70) * 4);
  const mom = avg([[r1 == null ? null : lin(r1, -0.15, 0.15), 0.2], [r3 == null ? null : lin(r3, -0.15, 0.15), 0.3],
    [r6 == null ? null : lin(r6, -0.15, 0.15), 0.3], [rsiScore, 0.2]]);
  const momReason = `Rendement 3 mois ${r3 == null ? "n.d." : pct(r3)}, 6 mois ${r6 == null ? "n.d." : pct(r6)}`
    + (rs == null ? "" : `, RSI ${rs.toFixed(0)}${rs > 70 ? " (surachat)" : rs < 30 ? " (survente)" : ""}`);

  // Force relative : rendement 3 mois moins celui du S&P 500 (±10 %).
  const b3 = returnOver(inp.benchCloses, 63);
  const rel = r3 != null && b3 != null ? r3 - b3 : null;
  const relScore = rel == null ? 50 : lin(rel, -0.1, 0.1);
  const relReason = rel == null ? "Force relative non calculable"
    : `${rel >= 0 ? "Fait mieux" : "Fait moins bien"} que le S&P 500 sur 3 mois (${pct(rel)})`;

  // Risque (100 = risque faible) : volatilité 20 j, drawdown 1 an, VIX.
  const vol = volatility(c, 20), dd = drawdown(c, 252);
  const risk = avg([[vol == null ? null : 100 - lin(vol, 0.15, 0.6), 0.4], [dd == null ? null : lin(dd, -0.3, 0), 0.4],
    [inp.vix == null ? null : 100 - lin(inp.vix, 12, 35), 0.2]]);
  const riskReason = `Volatilité ${vol == null ? "n.d." : `${(vol * 100).toFixed(0)} %`}, baisse depuis le plus haut ${dd == null ? "n.d." : pct(dd)}`
    + (inp.vix == null ? "" : `, VIX ${inp.vix.toFixed(1)}`);

  // Actualité : sentiment −1..+1 → 0..100 (neutre tant que l'étape 6 n'existe pas).
  const ns = inp.newsSentiment;
  const news = ns == null ? 50 : lin(Math.max(-1, Math.min(1, ns)), -1, 1);
  const newsReason = ns == null ? "Pas encore d'analyse d'actualité (neutre)" : `Sentiment des actualités ${ns >= 0 ? "positif" : "négatif"}`;

  // Contexte de marché : S&P 500 vs sa MM200 et Fear & Greed.
  const bm = sma(inp.benchCloses, 200);
  const bLast = inp.benchCloses[inp.benchCloses.length - 1];
  const bDist = bm && bLast ? bLast / bm - 1 : null;
  const market = avg([[bDist == null ? null : lin(bDist, -0.05, 0.05), 1], [inp.fearGreed, 1]]);
  const marketReason = `S&P 500 ${bDist == null ? "n.d." : bDist >= 0 ? "au-dessus" : "en dessous"} de sa MM200`
    + (inp.fearGreed == null ? "" : `, Fear & Greed ${Math.round(inp.fearGreed)}`);

  return [
    f("trend", trend, trendReason), f("momentum", mom, momReason), f("relative", relScore, relReason),
    f("risk", risk, riskReason), f("news", news, newsReason), f("market", market, marketReason),
  ];
}

export function weightedScore(factors: Factor[]): number {
  const w = factors.reduce((s, x) => s + x.weight, 0);
  return factors.reduce((s, x) => s + x.score * x.weight, 0) / w;
}

/** Décision brute (sans mémoire). */
export function rawDecision(score: number): Decision {
  return score >= THRESHOLDS.buy ? "Acheter" : score < THRESHOLDS.sell ? "Vendre" : "Attendre";
}

/**
 * Décision avec hystérésis : quitter l'état précédent exige de franchir
 * le seuil d'au moins `hysteresis` points.
 */
export function decide(score: number, previous?: Decision | null): Decision {
  const { buy, sell, hysteresis: h } = THRESHOLDS;
  if (!previous) return rawDecision(score);
  if (previous === "Acheter") return score < sell - h ? "Vendre" : score < buy - h ? "Attendre" : "Acheter";
  if (previous === "Vendre") return score >= buy + h ? "Acheter" : score >= sell + h ? "Attendre" : "Vendre";
  return score >= buy + h ? "Acheter" : score < sell - h ? "Vendre" : "Attendre";
}

export function confidenceOf(score: number): ScoreResult["confidence"] {
  const d = Math.min(Math.abs(score - THRESHOLDS.buy), Math.abs(score - THRESHOLDS.sell));
  return d > 10 ? "élevée" : d > 4 ? "moyenne" : "faible";
}

/** Score complet + décision + raisons (3 à 5 facteurs les plus marquants). */
/** Règles de décision optionnelles (comparées au backtest). */
export interface DecisionRules {
  /** « Vendre » seulement si le cours est sous sa MM200 ; sinon « Attendre ». */
  sellNeedsBelowMA200?: boolean;
  /** Après « Vendre », repasser à « Acheter » dès que le cours repasse au-dessus de sa MM200 avec un score ≥ 43. */
  reentryAboveMA200?: boolean;
}
export const DEFAULT_RULES: DecisionRules = { sellNeedsBelowMA200: true, reentryAboveMA200: false };

export function scoreAsset(inp: ScoreInput, previous?: Decision | null, weights = DEFAULT_WEIGHTS, rules: DecisionRules = DEFAULT_RULES): ScoreResult {
  const factors = computeFactors(inp, weights);
  const score = weightedScore(factors);
  let decision = decide(score, previous);

  // Garde-fou : l'actualité seule ne peut pas changer la décision.
  const neutral = factors.map((x) => (x.key === "news" ? { ...x, score: 50 } : x));
  const decisionWithoutNews = decide(weightedScore(neutral), previous);
  if (decisionWithoutNews !== decision) decision = decisionWithoutNews;

  const ma200 = sma(inp.closes, 200);
  const last = inp.closes[inp.closes.length - 1];
  if (ma200 != null) {
    if (rules.sellNeedsBelowMA200 && decision === "Vendre" && last >= ma200) decision = "Attendre";
    if (rules.reentryAboveMA200 && previous === "Vendre" && last > ma200 && score >= THRESHOLDS.sell + THRESHOLDS.hysteresis)
      decision = "Acheter";
  }

  const reasons = [...factors]
    .filter((x) => x.key !== "news" || inp.newsSentiment != null)
    .sort((a, b) => Math.abs(b.score - 50) * b.weight - Math.abs(a.score - 50) * a.weight)
    .slice(0, 4)
    .map((x) => `${x.label} : ${x.reason}`);

  return { score: Math.round(score), decision, confidence: confidenceOf(score), factors, reasons };
}

/** Lecture « long terme » pour les ETF. */
export function etfReading(d: Decision): string {
  return d === "Acheter" ? "Renforcer" : d === "Vendre" ? "Réduire (tendance dégradée)" : "Conserver";
}
