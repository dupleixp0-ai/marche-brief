import { isExtremeFear, isExtremeGreed } from "../adapters/cnn";
// Lecture du marché : signaux simples et transparents qui penchent vers la hausse ou la baisse.
// Ce n'est pas une prédiction : chaque signal est affiché avec sa règle, et le résultat est un « biais ».
import { sma } from "../indicators/sma";
import { drawdown, returnOver, smaSlope } from "../indicators/series";

export type Bias = "haussier" | "plutôt haussier" | "neutre" | "plutôt baissier" | "baissier";

export interface Signal {
  label: string;
  /** +1 pousse vers la hausse, -1 vers la baisse, 0 neutre. */
  effect: -1 | 0 | 1;
  /** Horizon où ce signal compte le plus. */
  horizon: "court terme" | "moyen terme";
  text: string;
}

export interface Outlook {
  bias: Bias;
  /** Somme des effets, de -n à +n. */
  points: number;
  max: number;
  shortTerm: Bias;
  mediumTerm: Bias;
  signals: Signal[];
  headline: string;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1).replace(".", ",")} %`;

function toBias(points: number, max: number): Bias {
  if (!max) return "neutre";
  const r = points / max;
  return r >= 0.5 ? "haussier" : r >= 0.2 ? "plutôt haussier" : r <= -0.5 ? "baissier" : r <= -0.2 ? "plutôt baissier" : "neutre";
}

export function marketOutlook({ spxCloses, vixCloses, fearGreed }: { spxCloses: number[]; vixCloses: number[]; fearGreed: number | null }): Outlook {
  const s: Signal[] = [];
  const spx = spxCloses.at(-1), vix = vixCloses.at(-1);
  const ma125 = sma(spxCloses, 125), ma200 = sma(spxCloses, 200), ma50 = sma(spxCloses, 50);
  const vixMa50 = sma(vixCloses, 50);

  if (spx != null && ma200 != null) {
    const d = spx / ma200 - 1;
    s.push({ label: "S&P 500 vs MM200", effect: d >= 0 ? 1 : -1, horizon: "moyen terme",
      text: d >= 0 ? `Au-dessus de sa moyenne 200 jours (${pct(d)}) : tendance de fond haussière.` : `Sous sa moyenne 200 jours (${pct(d)}) : tendance de fond dégradée.` });
  }
  if (spx != null && ma125 != null) {
    const d = spx / ma125 - 1;
    s.push({ label: "S&P 500 vs MM125", effect: d >= 0 ? 1 : -1, horizon: "moyen terme",
      text: d >= 0 ? `Au-dessus de sa moyenne 125 jours (${pct(d)}).` : `Sous sa moyenne 125 jours (${pct(d)}) : la tendance des 6 derniers mois s'est retournée.` });
  }
  const slope = smaSlope(spxCloses, 50, 20);
  if (slope != null && ma50 != null) {
    s.push({ label: "Pente de la MM50", effect: slope > 0.005 ? 1 : slope < -0.005 ? -1 : 0, horizon: "court terme",
      text: slope > 0.005 ? `La moyenne 50 jours monte (${pct(slope)} en 20 séances).` : slope < -0.005 ? `La moyenne 50 jours baisse (${pct(slope)} en 20 séances).` : "La moyenne 50 jours est plate." });
  }
  const r1 = returnOver(spxCloses, 21);
  if (r1 != null) {
    s.push({ label: "Momentum 1 mois", effect: r1 > 0.02 ? 1 : r1 < -0.02 ? -1 : 0, horizon: "court terme",
      text: `Le S&P 500 a fait ${pct(r1)} sur un mois.` });
  }
  if (vix != null && vixMa50 != null) {
    const hi = vix > vixMa50 * 1.1, lo = vix < vixMa50 * 0.9;
    s.push({ label: "VIX vs sa MM50", effect: hi ? -1 : lo ? 1 : 0, horizon: "court terme",
      text: hi ? `VIX (${vix.toFixed(1)}) au-dessus de sa moyenne (${vixMa50.toFixed(1)}) : nervosité, mouvements brusques probables.`
        : lo ? `VIX (${vix.toFixed(1)}) sous sa moyenne (${vixMa50.toFixed(1)}) : marché calme.` : `VIX (${vix.toFixed(1)}) proche de sa moyenne.` });
  }
  if (fearGreed != null) {
    // Indicateur « à contre-courant » : la peur extrême a souvent précédé des rebonds sur plusieurs mois.
    s.push({ label: "Fear & Greed", effect: isExtremeFear(fearGreed) ? 1 : isExtremeGreed(fearGreed) ? -1 : 0, horizon: "moyen terme",
      text: isExtremeFear(fearGreed) ? `Peur extrême (${Math.round(fearGreed)}) : historiquement, souvent proche d'un point bas (lecture à contre-courant).`
        : isExtremeGreed(fearGreed) ? `Avidité extrême (${Math.round(fearGreed)}) : risque d'excès, prudence.` : `Sentiment intermédiaire (${Math.round(fearGreed)}/100).` });
  }

  const sum = (l: Signal[]) => l.reduce((a, x) => a + x.effect, 0);
  const points = sum(s), max = s.length;
  const st = s.filter((x) => x.horizon === "court terme"), mt = s.filter((x) => x.horizon === "moyen terme");
  const bias = toBias(points, max), shortTerm = toBias(sum(st), st.length), mediumTerm = toBias(sum(mt), mt.length);
  const headline = s.length
    ? `Biais ${bias} (${points >= 0 ? "+" : ""}${points} sur ${max} signaux) : court terme ${shortTerm}, moyen terme ${mediumTerm}.`
    : "Données insuffisantes pour une lecture du marché.";
  return { bias, points, max, shortTerm, mediumTerm, signals: s, headline };
}

export interface SeriesStats {
  last: number | null;
  change1m: number | null;
  change3m: number | null;
  change1y: number | null;
  high1y: number | null;
  low1y: number | null;
  /** Rang du dernier cours dans l'année (0 = plus bas, 1 = plus haut). */
  percentile1y: number | null;
  drawdown1y: number | null;
}

/** Statistiques de lecture d'une série (fiche détail VIX / S&P 500). */
export function seriesStats(closes: number[]): SeriesStats {
  const y = closes.slice(-252), last = closes.at(-1) ?? null;
  return {
    last,
    change1m: returnOver(closes, 21), change3m: returnOver(closes, 63), change1y: returnOver(closes, 252),
    high1y: y.length ? Math.max(...y) : null, low1y: y.length ? Math.min(...y) : null,
    percentile1y: last != null && y.length > 1 ? y.filter((v) => v < last).length / (y.length - 1) : null,
    drawdown1y: drawdown(closes, 252),
  };
}
