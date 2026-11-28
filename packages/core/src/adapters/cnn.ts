import type { FearGreed, Fetcher } from "../types";
import { fetchText } from "./http";

// Fear & Greed de CNN (endpoint non officiel). Peut refuser les clients automatisés :
// dans ce cas, le secours est l'indice maison (indicators/fearGreed.ts).

export function parseCnnFearGreed(json: string): FearGreed {
  const fg = JSON.parse(json)?.fear_and_greed;
  const value = Number(fg?.score);
  if (!Number.isFinite(value)) throw new Error("score CNN absent");
  // Historique (≈ 1 an) : fear_and_greed_historical.data = [{ x: horodatage ms, y: score }].
  const raw: unknown[] = JSON.parse(json)?.fear_and_greed_historical?.data ?? [];
  const byDate = new Map<string, number>();
  for (const p of raw as { x?: number; y?: number }[]) {
    if (typeof p?.x !== "number" || typeof p?.y !== "number") continue;
    byDate.set(new Date(p.x).toISOString().slice(0, 10), Math.round(p.y)); // dernière valeur du jour
  }
  const history = [...byDate].map(([date, v]) => ({ date, value: v })).sort((a, b) => a.date.localeCompare(b.date));
  return { value: Math.round(value), label: fearGreedLabel(Math.round(value)), homemade: false, ...(history.length ? { history } : {}) };
}

/** Zones du Fear & Greed (valeur arrondie) : 0–25, 26–45, 46–55, 56–75, 76–100. */
export const FG_ZONES = { extremeFear: 25, fear: 45, neutral: 55, greed: 75 };
export const isExtremeFear = (v: number) => Math.round(v) <= FG_ZONES.extremeFear;
export const isExtremeGreed = (v: number) => Math.round(v) > FG_ZONES.greed;

export function fearGreedLabel(v: number): string {
  const r = Math.round(v);
  if (r <= FG_ZONES.extremeFear) return "Peur extrême";
  if (r <= FG_ZONES.fear) return "Peur";
  if (r <= FG_ZONES.neutral) return "Neutre";
  if (r <= FG_ZONES.greed) return "Avidité";
  return "Avidité extrême";
}

/** Couleur de la zone (mêmes seuils que le libellé) : peur extrême en rouge, peur en orange, avidité en vert, avidité extrême en alerte. */
export function fearGreedTone(v: number): "down" | "warn" | "up" | undefined {
  const r = Math.round(v);
  if (r <= FG_ZONES.extremeFear) return "down";
  if (r <= FG_ZONES.fear) return "warn";
  if (r <= FG_ZONES.neutral) return undefined;
  if (r <= FG_ZONES.greed) return "up";
  return "warn";
}

export function cnnFetcher(): Fetcher<FearGreed> {
  const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
  return { name: "CNN", run: async () => parseCnnFearGreed(await fetchText(url)) };
}
