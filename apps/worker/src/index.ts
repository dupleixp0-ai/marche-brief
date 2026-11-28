// Relais « Actualiser » : le navigateur ne peut pas interroger directement Yahoo, CNN, Stooq ou FRED
// (pas d'en-têtes CORS). Le Worker relaie ces requêtes ; tous les calculs (scores, marché, gains/pertes)
// sont faits dans le navigateur avec le même code que le job quotidien (packages/core).
// Aucune clé Claude ici : Claude ne sert qu'au brief du matin (GitHub Actions).
// Protections : code d'accès, CORS limité au site, liste fermée de sources, limite par IP, cache de 5 minutes.
import { USER_AGENT } from "@marche-brief/core";

interface Env {
  ACCESS_CODE: string;
  ALLOWED_ORIGINS: string;
}

const CACHE_SECONDS = 300;
/** Une actualisation complète ≈ 30 requêtes : on laisse de la marge, sans permettre d'abus. */
const RATE_LIMIT = 240; // requêtes par minute et par IP (par instance du Worker)
/** Seules ces sources peuvent être relayées (pas de relais ouvert). */
const ALLOWED_HOSTS = new Set([
  "query1.finance.yahoo.com", "query2.finance.yahoo.com",
  "production.dataviz.cnn.io", "stooq.com", "fred.stlouisfed.org",
]);
const hits = new Map<string, { n: number; t: number }>();

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return origin && allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "X-Access-Code", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400", Vary: "Origin" }
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

/** Récupère `target` (cache de 5 minutes partagé : plusieurs « Actualiser » rapprochés ne multiplient pas les appels). */
async function relay(target: URL, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(`https://cache.marketpulse/${encodeURIComponent(target.toString())}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(target.toString(), { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  const out = new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "text/plain", "Cache-Control": `max-age=${CACHE_SECONDS}` },
  });
  if (res.ok) ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req.headers.get("Origin"), env);

    if (req.method === "OPTIONS") return new Response(null, { status: h["Access-Control-Allow-Origin"] ? 204 : 403, headers: h });
    if (url.pathname === "/health") return json({ ok: true }, 200, h);
    const routes = ["/check", "/proxy"];
    if (req.method !== "GET" || !routes.includes(url.pathname)) return json({ error: "Introuvable" }, 404, h);

    if (!h["Access-Control-Allow-Origin"] && req.headers.get("Origin")) return json({ error: "Origine non autorisée" }, 403, h);
    if (!env.ACCESS_CODE) return json({ error: "Worker non configuré (ACCESS_CODE manquant)" }, 500, h);
    if (!sameCode(req.headers.get("X-Access-Code") ?? "", env.ACCESS_CODE)) return json({ error: "Code d'accès invalide" }, 401, h);
    if (rateLimited(req.headers.get("CF-Connecting-IP") ?? "local")) return json({ error: "Trop de requêtes, réessayer dans une minute" }, 429, h);

    // Vérification du code d'accès (avant une actualisation).
    if (url.pathname === "/check") return json({ ok: true }, 200, h);

    // Relais vers une source autorisée.
    let target: URL;
    try { target = new URL(url.searchParams.get("url") ?? ""); } catch { return json({ error: "URL invalide" }, 400, h); }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) return json({ error: "Source non autorisée" }, 403, h);
    const res = await relay(target, ctx);
    return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...h } });
  },
};
