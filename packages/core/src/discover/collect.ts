import { withFallback } from "../fallback";
import { yahooFetcher } from "../adapters/yahoo";
import type { Bar, SourceResult } from "../types";
import { buildDiscoveries, evaluateCandidate, type Discoveries, type Evaluated, type UniverseItem } from "./discover";

export interface Universe {
  liquidityMinEUR: { stock: number; etf: number };
  regions: Record<string, { benchmark: string }>;
  worldBenchmark: string;
  items: UniverseItem[];
}

/** Taux Yahoo « EURxxx=X » = unités de devise pour 1 €. */
const FX_PAIR: Record<string, { pair: string; scale: number }> = {
  USD: { pair: "EURUSD=X", scale: 1 }, GBP: { pair: "EURGBP=X", scale: 1 }, GBp: { pair: "EURGBP=X", scale: 1 },
  CHF: { pair: "EURCHF=X", scale: 1 }, SEK: { pair: "EURSEK=X", scale: 1 }, DKK: { pair: "EURDKK=X", scale: 1 },
  NOK: { pair: "EURNOK=X", scale: 1 },
};

/** Collecte et évalue tout l'univers (job quotidien uniquement : ~130 requêtes). */
export async function collectDiscoveries(
  universe: Universe,
  ctx: { vix: number | null; fearGreed: number | null; now?: Date; delayMs?: number },
): Promise<SourceResult<Discoveries>> {
  const now = ctx.now ?? new Date();
  const wait = () => (ctx.delayMs ? new Promise((r) => setTimeout(r, ctx.delayMs)) : null);
  const cache = new Map<string, { bars: Bar[]; currency: string } | null>();
  const get = async (sym: string) => {
    if (!cache.has(sym)) {
      const r = await withFallback([yahooFetcher(sym, "2y")]);
      cache.set(sym, r.data ? { bars: r.data.bars, currency: r.data.currency ?? "" } : null);
      await wait();
    }
    return cache.get(sym)!;
  };
  const fxBars = async (currency: string): Promise<Bar[] | null | undefined> => {
    if (currency === "EUR") return null;
    const p = FX_PAIR[currency];
    if (!p) return undefined; // devise non gérée
    const s = await get(p.pair);
    return s ? s.bars.map((b) => ({ date: b.date, close: 1 / b.close })) : undefined; // € pour 1 unité
  };

  const world = (await get(universe.worldBenchmark))?.bars ?? [];
  const evals: Evaluated[] = [];
  for (const item of universe.items) {
    const s = await get(item.ticker);
    if (!s) { evals.push({ ok: false, ticker: item.ticker, reason: "cours indisponibles" }); continue; }
    const fx = await fxBars(s.currency);
    if (fx === undefined) { evals.push({ ok: false, ticker: item.ticker, reason: `devise non gérée (${s.currency})` }); continue; }
    const bench = universe.regions[item.region]?.benchmark ?? universe.worldBenchmark;
    const regionBench = (await get(bench))?.bars ?? world;
    evals.push(evaluateCandidate({
      item, bars: s.bars, currency: s.currency, regionBench, worldBench: world, eurPerUnit: fx,
      vix: ctx.vix, fearGreed: ctx.fearGreed, minTurnoverEUR: universe.liquidityMinEUR[item.type], now,
    }));
  }
  const data = buildDiscoveries(evals, now);
  const failed = data.excluded.length;
  return {
    data, source: "Yahoo Finance", fetchedAt: now.toISOString(),
    status: data.stocks.length + data.etfs.length ? "ok" : "error",
    error: failed ? `${failed} valeur(s) exclue(s) (données incomplètes ou illiquides)` : undefined,
  };
}
