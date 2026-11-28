import { isExtremeFear, isExtremeGreed } from "../adapters/cnn";
// Phrase d'explication du marché (section « Marché » du dashboard).
import { sma } from "../indicators/sma";

export interface MarketInputs {
  vixCloses: number[];
  spxCloses: number[];
  fearGreed: number | null;
}

export interface MarketSummary {
  vix: number | null;
  vixMa50: number | null;
  spx: number | null;
  spxMa125: number | null;
  sentence: string;
}

export function marketSummary({ vixCloses, spxCloses, fearGreed }: MarketInputs): MarketSummary {
  const vix = vixCloses.at(-1) ?? null, spx = spxCloses.at(-1) ?? null;
  const vixMa50 = sma(vixCloses, 50), spxMa125 = sma(spxCloses, 125);
  const parts: string[] = [];
  if (vix != null && vixMa50 != null)
    parts.push(vix > vixMa50 * 1.1 ? "La volatilité est au-dessus de sa moyenne : le marché est nerveux"
      : vix < vixMa50 * 0.9 ? "La volatilité est sous sa moyenne : le marché est calme"
      : "La volatilité est proche de sa moyenne");
  if (spx != null && spxMa125 != null)
    parts.push(spx >= spxMa125 ? "le S&P 500 reste au-dessus de sa moyenne 125 jours (tendance haussière)"
      : "le S&P 500 est passé sous sa moyenne 125 jours (tendance dégradée)");
  if (fearGreed != null)
    parts.push(isExtremeFear(fearGreed) ? "le sentiment est à la peur extrême, souvent proche des points bas"
      : isExtremeGreed(fearGreed) ? "le sentiment est à l'avidité extrême, prudence sur les excès"
      : `le sentiment est à ${Math.round(fearGreed)}/100`);
  const s = parts.join(", ");
  return { vix, vixMa50, spx, spxMa125, sentence: s ? s.charAt(0).toUpperCase() + s.slice(1) + "." : "Données de marché indisponibles." };
}
