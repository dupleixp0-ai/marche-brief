import type { FearGreed } from "../types";
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
