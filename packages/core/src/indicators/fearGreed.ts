import type { Bar, FearGreed } from "../types";
import { fearGreedLabel } from "../adapters/cnn";
import { sma } from "./sma";

const clamp = (x: number) => Math.max(0, Math.min(100, x));

/**
 * Indice Fear & Greed maison (secours), moyenne de deux composantes :
 * - Volatilité : VIX 12 → 100 (avidité), VIX 37 → 0 (peur), linéaire.
 * - Momentum : écart du S&P 500 à sa MM125 ; +10 % → 100, −10 % → 0.
 */
export function homemadeFearGreed(vix: number, spxCloses: number[]): FearGreed {
  const volScore = clamp(100 - ((vix - 12) / 25) * 100);
  const ma125 = sma(spxCloses, 125);
  const last = spxCloses[spxCloses.length - 1];
  const momScore = ma125 && last ? clamp(50 + ((last / ma125 - 1) / 0.1) * 50) : 50;
  const value = Math.round((volScore + momScore) / 2);
  return { value, label: fearGreedLabel(value), homemade: true };
}

/** Historique de l'indice maison, jour par jour, à partir des séries VIX et S&P 500 (dates communes). */
export function homemadeFearGreedHistory(vix: Bar[], spx: Bar[], days = 260): { date: string; value: number }[] {
  const vixBy = new Map(vix.map((b) => [b.date, b.close]));
  const out: { date: string; value: number }[] = [];
  const start = Math.max(125, spx.length - days);
  for (let i = start; i < spx.length; i++) {
    const v = vixBy.get(spx[i].date);
    if (v == null) continue;
    out.push({ date: spx[i].date, value: homemadeFearGreed(v, spx.slice(0, i + 1).map((b) => b.close)).value });
  }
  return out;
}

/** Valeurs passées repères : veille, 1 semaine, 1 mois, 3 mois, 6 mois, 1 an (en séances). */
export function fearGreedLookback(history: { date: string; value: number }[]): { label: string; date: string; value: number }[] {
  const marks: [string, number][] = [["Veille", 1], ["1 semaine", 5], ["1 mois", 21], ["3 mois", 63], ["6 mois", 126], ["1 an", 252]];
  return marks.filter(([, n]) => history.length > n).map(([label, n]) => ({ label, ...history[history.length - 1 - n] }));
}
