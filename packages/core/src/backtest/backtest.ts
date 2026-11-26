// Backtest : « suivre le score » contre achat-conservation.
// Règles : décision calculée à la clôture du jour t avec les seules données ≤ t,
// appliquée au rendement de t à t+1 (pas de regard vers le futur).
// Acheter → investi, Vendre → liquidités (0 %), Attendre → on garde la position.
import type { Bar } from "../types";
import { scoreAsset, DEFAULT_WEIGHTS, DEFAULT_RULES, type Decision, type DecisionRules } from "../scoring/score";
import { homemadeFearGreed } from "../indicators/fearGreed";

export interface BacktestOptions {
  rules?: DecisionRules;
  warmup?: number;   // séances nécessaires avant le premier signal
  window?: number;   // historique passé au score à chaque date
  costPct?: number;  // frais par changement de position (0,001 = 0,1 %)
}

export interface PerfStats {
  totalReturn: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
}

export interface BacktestResult {
  symbol: string;
  from: string;
  to: string;
  days: number;
  strategy: PerfStats;
  buyHold: PerfStats;
  exposure: number;  // part du temps investi
  trades: number;
  /** Rendement moyen à 3 mois après chaque type de décision (qualité prédictive). */
  forward63: Record<Decision | "Tous", { avg: number; n: number }>;
  halves: { first: { strategy: number; buyHold: number }; second: { strategy: number; buyHold: number } };
}

/** Aligne une série de référence sur les dates de `dates` (dernière valeur connue). */
export function alignTo(dates: string[], ref: Bar[]): (number | null)[] {
  const out: (number | null)[] = [];
  let j = 0, last: number | null = null;
  for (const d of dates) {
    while (j < ref.length && ref[j].date <= d) last = ref[j++].close;
    out.push(last);
  }
  return out;
}

export function perfStats(dailyReturns: number[]): PerfStats {
  let eq = 1, peak = 1, mdd = 0;
  for (const r of dailyReturns) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }
  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((s, x) => s + x, 0) / (n || 1);
  const sd = Math.sqrt(dailyReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  return {
    totalReturn: eq - 1,
    cagr: n ? eq ** (252 / n) - 1 : 0,
    maxDrawdown: mdd,
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : 0,
  };
}

export function backtest(symbol: string, bars: Bar[], bench: Bar[], vix: Bar[], opt: BacktestOptions = {}): BacktestResult {
  const warmup = opt.warmup ?? 252, window = opt.window ?? 300, cost = opt.costPct ?? 0.001;
  const dates = bars.map((b) => b.date);
  const closes = bars.map((b) => b.close);
  const benchAl = alignTo(dates, bench);
  const vixAl = alignTo(dates, vix);
  if (bars.length < warmup + 70) throw new Error(`${symbol} : historique trop court`);

  const strat: number[] = [], hold: number[] = [];
  const decisions: Decision[] = [];
  let pos = 1, prev: Decision | null = null, trades = 0, invested = 0;

  for (let t = warmup; t < bars.length - 1; t++) {
    const lo = Math.max(0, t + 1 - window);
    const c = closes.slice(lo, t + 1);
    const b = benchAl.slice(lo, t + 1).map((x, i) => x ?? c[i]);
    const v = vixAl[t];
    const fg = v == null ? null : homemadeFearGreed(v, b).value;
    const d: Decision = scoreAsset({ closes: c, benchCloses: b, vix: v, fearGreed: fg }, prev, DEFAULT_WEIGHTS, opt.rules ?? DEFAULT_RULES).decision;
    decisions.push(d);
    prev = d;

    const newPos = d === "Acheter" ? 1 : d === "Vendre" ? 0 : pos;
    const r = closes[t + 1] / closes[t] - 1;
    const fee = newPos !== pos ? cost : 0;
    if (newPos !== pos) trades++;
    pos = newPos;
    invested += pos;
    strat.push(pos * r - fee);
    hold.push(r);
  }

  // Qualité prédictive : rendement des 63 séances suivant chaque décision.
  const acc: Record<string, { s: number; n: number }> = {};
  decisions.forEach((d, i) => {
    const t = warmup + i;
    if (t + 63 >= closes.length) return;
    const fwd = closes[t + 63] / closes[t] - 1;
    for (const k of [d, "Tous"]) { acc[k] ??= { s: 0, n: 0 }; acc[k].s += fwd; acc[k].n++; }
  });
  const forward63 = Object.fromEntries((["Acheter", "Attendre", "Vendre", "Tous"] as const)
    .map((k) => [k, { avg: acc[k] ? acc[k].s / acc[k].n : 0, n: acc[k]?.n ?? 0 }])) as BacktestResult["forward63"];

  const half = Math.floor(strat.length / 2);
  const tot = (rs: number[]) => perfStats(rs).totalReturn;

  return {
    symbol,
    from: dates[warmup],
    to: dates[dates.length - 1],
    days: strat.length,
    strategy: perfStats(strat),
    buyHold: perfStats(hold),
    exposure: invested / (strat.length || 1),
    trades,
    forward63,
    halves: {
      first: { strategy: tot(strat.slice(0, half)), buyHold: tot(hold.slice(0, half)) },
      second: { strategy: tot(strat.slice(half)), buyHold: tot(hold.slice(half)) },
    },
  };
}

export interface BacktestSummary {
  generatedAt: string;
  assets: number;
  beatsCagr: number;     // nb de valeurs où la stratégie a un meilleur rendement annuel
  beatsSharpe: number;   // nb de valeurs où elle a un meilleur rendement ajusté du risque
  beatsDrawdown: number; // nb de valeurs où elle limite mieux la pire baisse
  avgCagrDiff: number;
  verdict: string;
  results: BacktestResult[];
}

export function summarize(results: BacktestResult[], now = new Date()): BacktestSummary {
  const n = results.length;
  const beatsCagr = results.filter((r) => r.strategy.cagr > r.buyHold.cagr).length;
  const beatsSharpe = results.filter((r) => r.strategy.sharpe > r.buyHold.sharpe).length;
  const beatsDrawdown = results.filter((r) => r.strategy.maxDrawdown > r.buyHold.maxDrawdown).length;
  const avgCagrDiff = results.reduce((s, r) => s + r.strategy.cagr - r.buyHold.cagr, 0) / (n || 1);
  const verdict =
    beatsCagr > n / 2 && avgCagrDiff > 0
      ? "Le score fait mieux que l'achat-conservation sur la majorité des valeurs."
      : beatsSharpe > n / 2
        ? "Le score ne bat pas l'achat-conservation en rendement, mais il offre un meilleur rendement ajusté du risque."
        : beatsDrawdown > n / 2
          ? "Le score ne fait pas mieux que l'achat-conservation : il limite les fortes baisses, mais coûte trop de rendement (rendement ajusté du risque moins bon)."
          : "Le score ne fait pas mieux que l'achat-conservation sur cette période.";
  return { generatedAt: now.toISOString(), assets: n, beatsCagr, beatsSharpe, beatsDrawdown, avgCagrDiff, verdict, results };
}
