// « Moment d'entrée » : bon moment pour acheter, neutre, ou hausse très étirée (risque de forte chute plus élevé).
// Complète le score (qui dit QUOI détenir) en disant QUAND entrer et avec quel risque.
// Règles simples, validées par une étude sur 10 ans et ~60 actions/ETF (scripts/timing.ts → data/timing.json),
// sur deux périodes séparées. Ce sont des tendances statistiques, pas des certitudes.
import type { Bar } from "../types";
import { sma } from "../indicators/sma";
import { rsi } from "../indicators/series";
import { homemadeFearGreed } from "../indicators/fearGreed";

export type TimingMoment = "favorable" | "neutre" | "etire";

export const TIMING_RULES = {
  /** Peur sur le marché (indice maison VIX + S&P 500, testable sur 10 ans) : ≤ 25. */
  fearMax: 25,
  /** Survente de la valeur : RSI(14) < 30. */
  oversoldRsi: 30,
  /**
   * Hausse très étirée : cours à plus de 50 % au-dessus de sa MM200. L'étude montre que la hausse continue
   * souvent (élan), mais que le risque d'une chute de plus de 15 % en 3 mois est environ deux fois plus élevé.
   */
  stretchedExt: 0.5,
  /** Fenêtre de volatilité (séances), affichée pour situer le risque. */
  volDays: 60,
};

export interface TimingFeatures {
  /** Écart à la MM200 (0,25 = 25 % au-dessus). */
  ext: number;
  /** Volatilité annualisée sur 60 séances. */
  vol: number;
  rsi: number | null;
  /** Indice de peur maison (0–100) ; null si VIX/S&P indisponibles. */
  marketFear: number | null;
}

export interface Timing extends TimingFeatures {
  moment: TimingMoment;
  label: string;
  reasons: string[];
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)} %`;

/** Volatilité annualisée (écart-type des rendements logarithmiques). */
export function annualVol(closes: number[], days = TIMING_RULES.volDays): number | null {
  if (closes.length < days + 1) return null;
  const r: number[] = [];
  for (let i = closes.length - days; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt((r.reduce((s, x) => s + (x - m) ** 2, 0) / r.length) * 252);
}

export function timingFeatures(closes: number[], marketFear: number | null): TimingFeatures | null {
  const ma200 = sma(closes, 200);
  const vol = annualVol(closes);
  if (ma200 == null || vol == null) return null;
  const ext = closes[closes.length - 1] / ma200 - 1;
  return { ext, vol, rsi: rsi(closes, 14), marketFear };
}

/** Classement seul (utilisé à l'identique par l'app et par l'étude historique). */
export function classifyTiming(f: TimingFeatures): TimingMoment {
  if (f.ext > TIMING_RULES.stretchedExt) return "etire";
  const fear = f.marketFear != null && f.marketFear <= TIMING_RULES.fearMax;
  const oversold = f.rsi != null && f.rsi < TIMING_RULES.oversoldRsi;
  return fear || oversold ? "favorable" : "neutre";
}

export const TIMING_LABELS: Record<TimingMoment, string> = {
  favorable: "Bon moment pour entrer",
  neutre: "Moment neutre",
  etire: "Hausse très étirée : risque élevé",
};

/** Statistiques historiques mesurées (data/timing.json), affichées avec chaque signal. */
export interface TimingStat {
  n: number;
  /** Rendement moyen 63 séances (≈ 3 mois) après le signal. */
  avg63: number;
  /** Part des cas en hausse 3 mois après. */
  hit63: number;
  /** Part des cas en baisse de plus de 15 % 3 mois après (risque de forte chute). */
  loss15?: number;
}
export type TimingStats = Partial<Record<TimingMoment | "all", TimingStat>>;

export function timingOf(closes: number[], marketFear: number | null, stats?: TimingStats): Timing | null {
  const f = timingFeatures(closes, marketFear);
  if (!f) return null;
  const moment = classifyTiming(f);
  const r: string[] = [];
  const s = stats?.[moment];
  if (moment === "etire") {
    r.push(`Cours ${pct(f.ext)} au-dessus de sa MM200 (volatilité ${Math.round(f.vol * 100)} % par an) : hausse très étirée.`);
    r.push("L'élan peut continuer, mais une forte correction est plus probable : entrer par petites tranches plutôt qu'en une fois.");
  } else if (moment === "favorable") {
    if (f.marketFear != null && f.marketFear <= TIMING_RULES.fearMax) r.push(`Peur sur le marché (indice ${f.marketFear}/100) : les achats en période de peur ont historiquement mieux réussi.`);
    if (f.rsi != null && f.rsi < TIMING_RULES.oversoldRsi) r.push(`Valeur survendue (RSI ${Math.round(f.rsi)}) : rebond fréquent dans les semaines suivantes.`);
    r.push(`Hausse non étirée (cours ${pct(f.ext)} par rapport à sa MM200).`);
  } else {
    r.push(`Ni peur marquée sur le marché${f.marketFear != null ? ` (indice ${f.marketFear}/100)` : ""}, ni survente (RSI ${f.rsi != null ? Math.round(f.rsi) : "n.d."}), ni hausse étirée (${pct(f.ext)} vs MM200).`);
  }
  if (s && s.n > 0) {
    const all = stats?.all;
    const risk = s.loss15 != null ? `, chute de plus de 15 % dans ${Math.round(s.loss15 * 100)} %` : "";
    const ref = all ? ` (en temps normal : ${pct(all.avg63)}, ${Math.round(all.hit63 * 100)} %${all.loss15 != null ? `, ${Math.round(all.loss15 * 100)} %` : ""})` : "";
    r.push(`Historique (10 ans) : 3 mois après, ${pct(s.avg63)} en moyenne, en hausse dans ${Math.round(s.hit63 * 100)} % des cas${risk}${ref}.`);
  }
  return { ...f, moment, label: TIMING_LABELS[moment], reasons: r };
}

/** Indice de peur maison au jour le jour (aligné sur les dates de `dates`). */
export function marketFearSeries(dates: string[], vix: Bar[], spx: Bar[]): (number | null)[] {
  const vm = new Map(vix.map((b) => [b.date, b.close]));
  const si = new Map(spx.map((b, i) => [b.date, i]));
  const spxC = spx.map((b) => b.close);
  let lastV: number | null = null, lastI: number | null = null;
  return dates.map((d) => {
    lastV = vm.get(d) ?? lastV;
    lastI = si.get(d) ?? lastI;
    if (lastV == null || lastI == null || lastI < 125) return null;
    return homemadeFearGreed(lastV, spxC.slice(lastI - 130, lastI + 1)).value;
  });
}

export interface TimingStudy {
  generatedAt: string;
  assets: number;
  from: string;
  to: string;
  /** Rendement moyen à 3 mois et taux de hausse, par moment, sur toute la période puis par moitié. */
  stats: TimingStats;
  halves: [TimingStats, TimingStats];
  rules: typeof TIMING_RULES;
}

/** Étude historique : pour chaque jour et chaque valeur, le moment calculé et le rendement des 63 séances suivantes. */
export function timingStudy(series: Record<string, Bar[]>, vix: Bar[], spx: Bar[], now = new Date()): TimingStudy {
  type Acc = { n: number; s: number; up: number; dn: number };
  const acc = (): Record<string, Acc> => ({});
  const total = acc(), h1 = acc(), h2 = acc();
  const add = (a: Record<string, Acc>, k: string, f: number) => { const x = (a[k] ??= { n: 0, s: 0, up: 0, dn: 0 }); x.n++; x.s += f; x.up += f > 0 ? 1 : 0; x.dn += f < -0.15 ? 1 : 0; };
  let from = "9999", to = "0000", assets = 0;
  for (const bars of Object.values(series)) {
    if (bars.length < 400) continue;
    assets++;
    const c = bars.map((b) => b.close);
    const fear = marketFearSeries(bars.map((b) => b.date), vix, spx);
    const start = 260, mid = Math.floor((start + c.length - 63) / 2);
    for (let t = start; t + 63 < c.length; t++) {
      const f = timingFeatures(c.slice(t - 259, t + 1), fear[t]);
      if (!f) continue;
      const m = classifyTiming(f), fwd = c[t + 63] / c[t] - 1;
      for (const a of [total, t < mid ? h1 : h2]) { add(a, m, fwd); add(a, "all", fwd); }
      if (bars[t].date < from) from = bars[t].date;
      if (bars[t].date > to) to = bars[t].date;
    }
  }
  const fin = (a: Record<string, Acc>): TimingStats =>
    Object.fromEntries(Object.entries(a).map(([k, x]) => [k, { n: x.n, avg63: x.s / x.n, hit63: x.up / x.n, loss15: x.dn / x.n }]));
  return { generatedAt: now.toISOString(), assets, from, to, stats: fin(total), halves: [fin(h1), fin(h2)], rules: TIMING_RULES };
}
