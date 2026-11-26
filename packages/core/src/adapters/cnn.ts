import type { FearGreed, Fetcher } from "../types";
import { fetchText } from "./http";

// Fear & Greed de CNN (endpoint non officiel). Peut refuser les clients automatisés :
// dans ce cas, le secours est l'indice maison (indicators/fearGreed.ts).

export function parseCnnFearGreed(json: string): FearGreed {
  const fg = JSON.parse(json)?.fear_and_greed;
  const value = Number(fg?.score);
  if (!Number.isFinite(value)) throw new Error("score CNN absent");
  return { value: Math.round(value), label: fearGreedLabel(value), homemade: false };
}

export function fearGreedLabel(v: number): string {
  if (v < 25) return "Peur extrême";
  if (v < 45) return "Peur";
  if (v <= 55) return "Neutre";
  if (v <= 75) return "Avidité";
  return "Avidité extrême";
}

export function cnnFetcher(): Fetcher<FearGreed> {
  const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
  return { name: "CNN", run: async () => parseCnnFearGreed(await fetchText(url)) };
}
