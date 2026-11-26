// Petit client HTTP commun (Node 18+ et Cloudflare Workers ont fetch).

export const USER_AGENT = "marche-brief/0.1 (dashboard personnel)";

export async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: ctrl.signal });
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
