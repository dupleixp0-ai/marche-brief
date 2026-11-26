// API « Actualiser » : collecte à la demande avec les mêmes calculs que le job quotidien.
// Protections : code d'accès, CORS limité, 5 requêtes/minute par IP, cache de 5 minutes.
import Anthropic from "@anthropic-ai/sdk";
import { collectSnapshot, withFallback, yahooIntradayFetcher, type Snapshot } from "@marche-brief/core";
import watchlist from "../../../config/watchlist.json";

interface Env {
  ACCESS_CODE: string;
  ANTHROPIC_API_KEY?: string;
  FINNHUB_API_KEY?: string;
  ALLOWED_ORIGINS: string;
  SNAPSHOT_URL?: string;
}

const CACHE_SECONDS = 300;
const RATE_LIMIT = 5; // requêtes par minute et par IP (par instance du Worker)
const hits = new Map<string, { n: number; t: number }>();
const symbols = [...watchlist.etfs, ...watchlist.stocks].map((v) => v.ticker);

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return origin && allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "X-Access-Code", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" }
    : {};
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

/** Comparaison à durée constante (évite de deviner le code caractère par caractère). */
function sameCode(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  return ++h.n > RATE_LIMIT;
}

async function previousSnapshot(env: Env): Promise<Snapshot | null> {
  if (!env.SNAPSHOT_URL) return null;
  try {
    const r = await fetch(env.SNAPSHOT_URL, { cf: { cacheTtl: 300 } } as RequestInit);
    return r.ok ? ((await r.json()) as Snapshot) : null;
  } catch { return null; }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req.headers.get("Origin"), env);

    if (req.method === "OPTIONS") return new Response(null, { status: h["Access-Control-Allow-Origin"] ? 204 : 403, headers: h });
    if (url.pathname === "/health") return json({ ok: true }, 200, h);
    const isRefresh = url.pathname === "/refresh" && req.method === "POST";
    const isIntraday = url.pathname === "/intraday" && req.method === "GET";
    if (!isRefresh && !isIntraday) return json({ error: "Introuvable" }, 404, h);

    if (!h["Access-Control-Allow-Origin"] && req.headers.get("Origin")) return json({ error: "Origine non autorisée" }, 403, h);
    if (!env.ACCESS_CODE) return json({ error: "Worker non configuré (ACCESS_CODE manquant)" }, 500, h);
    if (!sameCode(req.headers.get("X-Access-Code") ?? "", env.ACCESS_CODE)) return json({ error: "Code d'accès invalide" }, 401, h);
    if (rateLimited(req.headers.get("CF-Connecting-IP") ?? "local")) return json({ error: "Trop de requêtes, réessayer dans une minute" }, 429, h);

    // Cours intraday d'une valeur (graphiques 1 jour / 1 semaine), cache 5 minutes.
    if (isIntraday) {
      const symbol = url.searchParams.get("symbol") ?? "";
      if (!/^[A-Za-z0-9.^=-]{1,15}$/.test(symbol)) return json({ error: "Symbole invalide" }, 400, h);
      const cache = caches.default;
      const key = new Request(`${url.origin}/__cache/intraday/${encodeURIComponent(symbol)}`);
      const hit = await cache.match(key);
      if (hit) return json(await hit.json(), 200, { ...h, "X-Cache": "HIT" });
      const r = await withFallback([yahooIntradayFetcher(symbol)]);
      if (r.data) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(r), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
      return json(r, r.data ? 200 : 502, { ...h, "X-Cache": "MISS" });
    }

    // Cache de 5 minutes : plusieurs « Actualiser » rapprochés ne relancent pas la collecte.
    const cache = caches.default;
    const key = new Request(`${url.origin}/__cache/snapshot`);
    const hit = await cache.match(key);
    if (hit) return json(await hit.json(), 200, { ...h, "X-Cache": "HIT" });

    // Le résumé Claude n'est régénéré que si de nouvelles actualités sont arrivées (voir collectSnapshot).
    const snap = await collectSnapshot(symbols, await previousSnapshot(env), {
      delayMs: 100,
      finnhubKey: env.FINNHUB_API_KEY,
      companyNews: false, // limite de sous-requêtes du Worker : actualités par société via le job quotidien
      anthropic: env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null,
    });
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(snap), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
    return json(snap, 200, { ...h, "X-Cache": "MISS" });
  },
};
