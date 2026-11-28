// Petit client HTTP commun (Node 18+, navigateur et Cloudflare Workers ont fetch).

export const USER_AGENT = "marche-brief/0.1 (dashboard personnel)";

/** Réécrit une requête (ex. passage par le relais du Worker depuis le navigateur, qui n'a pas accès direct aux sources). */
export type HttpRoute = (url: string) => { url: string; headers?: Record<string, string> };
let route: HttpRoute | null = null;

/** Active (ou désactive avec null) le passage des requêtes par un relais. */
export function setHttpRoute(r: HttpRoute | null): void {
  route = r;
}

export async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const target = route ? route(url) : { url, headers: { "User-Agent": USER_AGENT } };
  try {
    const res = await fetch(target.url, { headers: target.headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Vérifie qu'une série est exploitable (sinon on passe au secours). */
export function assertBars<T extends { bars: unknown[] }>(s: T, min = 5): T {
  if (s.bars.length < min) throw new Error(`série trop courte (${s.bars.length})`);
  return s;
}
