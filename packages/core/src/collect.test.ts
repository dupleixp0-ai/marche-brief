import { afterEach, describe, expect, it, vi } from "vitest";
import { collectSnapshot, type Snapshot } from "./collect";
import { setHttpRoute } from "./adapters/http";

// Réponse Yahoo synthétique : 260 séances en hausse régulière.
const yahoo = (symbol: string, currency = "USD") => JSON.stringify({ chart: { result: [{
  meta: { currency, symbol },
  timestamp: Array.from({ length: 260 }, (_, i) => 1735776000 + i * 86400),
  indicators: { quote: [{ close: Array.from({ length: 260 }, (_, i) => 100 + i), volume: Array(260).fill(1000) }] },
}], error: null } });

const previous = {
  news: { data: [{ title: "Ancienne actu", url: "https://x", source: "S", symbols: [], publishedAt: null }], source: "RSS", fetchedAt: "2026-11-27T08:00:00Z", status: "ok" },
  brief: { data: { bullets: [{ text: "Brief du matin", links: [] }], sentiments: {}, explanations: {}, generatedAt: "2026-11-27T08:00:00Z", model: "m", newsHash: "h" }, source: "Claude", fetchedAt: "2026-11-27T08:00:00Z", status: "ok" },
  discoveries: null, intraday: {}, prices: {}, scores: {}, fx: {},
  market: { fearGreed: { data: { value: 15, label: "Peur extrême" }, source: "CNN", fetchedAt: "2026-11-27T08:00:00Z", status: "ok" } },
} as unknown as Snapshot;

afterEach(() => { vi.unstubAllGlobals(); setHttpRoute(null); });

describe("actualisation des cours (bouton « Actualiser »)", () => {
  it("met à jour les cours via le relais, sans actualités ni Claude", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>)["X-Access-Code"]).toBe("code");
      const target = decodeURIComponent(new URL(url).searchParams.get("url")!);
      const m = target.match(/chart\/([^?]+)/);
      if (m) return new Response(yahoo(decodeURIComponent(m[1])));
      return new Response("non", { status: 404 });
    }));
    setHttpRoute((u) => ({ url: `https://relais.test/proxy?url=${encodeURIComponent(u)}`, headers: { "X-Access-Code": "code" } }));

    const snap = await collectSnapshot(["NVDA", "EUNL.DE"], previous, { quotesOnly: true, delayMs: 0, concurrency: 4 });
    expect(snap.prices.NVDA.status).toBe("ok");
    expect(snap.prices["EUNL.DE"].data?.bars.at(-1)?.close).toBe(359);
    expect(snap.scores.NVDA).toBeDefined();
    expect(snap.brief).toBe(previous.brief); // brief du matin conservé
    expect(snap.news).toBe(previous.news);
    // CNN indisponible : valeur du matin conservée et marquée périmée (pas d'indice maison).
    expect(snap.market.fearGreed).toMatchObject({ source: "CNN", status: "stale", data: { value: 15 } });
    expect(calls.every((c) => c.startsWith("https://relais.test/proxy?url="))).toBe(true);
    expect(calls.some((c) => /finnhub|rss|federalreserve|ecb/i.test(decodeURIComponent(c)))).toBe(false);
  });
});

describe("withTiming", () => {
  it("ajoute le moment d'entrée à un snapshot qui ne l'a pas, sans changer le score", async () => {
    const { withTiming } = await import("./collect");
    const bars = Array.from({ length: 300 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), close: 100 * (1 + 0.01 * Math.sin(i)) }));
    const src = (data: unknown) => ({ data, source: "test", fetchedAt: "", status: "ok" as const });
    const snap = {
      generatedAt: "", market: { vix: src({ symbol: "^VIX", bars: bars.map((b) => ({ ...b, close: 40 })) }), spx: src({ symbol: "^GSPC", bars }), fearGreed: src({ value: 50, label: "Neutre" }) },
      prices: { AAA: src({ symbol: "AAA", bars }) },
      scores: { AAA: { score: 50, decision: "Attendre", confidence: "faible", factors: [], reasons: [], asOf: "x" } },
    } as never;
    const out = withTiming(snap, { favorable: { n: 1, avg63: 0.09, hit63: 0.7 } });
    expect(out.scores.AAA.score).toBe(50);
    expect(out.scores.AAA.timing?.moment).toBe("favorable"); // VIX 40 → peur extrême
    expect(out.timingStats?.favorable?.avg63).toBe(0.09);
  });
});
