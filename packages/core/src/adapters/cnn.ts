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

export function fearGreedLabel(v: number): string {
  if (v < 25) return "Peur extrême";
  if (v < 45) return "Peur";
  if (v <= 55) return "Neutre";
  if (v <= 75) return "Avidité";
  return "Avidité extrême";
}

/** Couleur de la zone (mêmes seuils que le libellé) : peur extrême en rouge, peur en orange, avidité en vert, avidité extrême en alerte. */
export function fearGreedTone(v: number): "down" | "warn" | "up" | undefined {
  if (v < 25) return "down";
  if (v < 45) return "warn";
  if (v <= 55) return undefined;
  if (v <= 75) return "up";
  return "warn";
}

export function cnnFetcher(): Fetcher<FearGreed> {
  const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
  return { name: "CNN", run: async () => parseCnnFearGreed(await fetchText(url)) };
}
