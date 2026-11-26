import type { Fetcher, SourceResult } from "./types";

/**
 * Essaie chaque source dans l'ordre. La première qui réussit gagne
 * ("ok" pour la principale, "fallback" pour une source de secours).
 * Si toutes échouent : dernière valeur connue marquée "stale", sinon "error".
 * Ne lève jamais d'exception.
 */
export async function withFallback<T>(
  fetchers: Fetcher<T>[],
  lastKnown?: SourceResult<T> | null,
  now: () => Date = () => new Date(),
): Promise<SourceResult<T>> {
  const errors: string[] = [];
  for (let i = 0; i < fetchers.length; i++) {
    const f = fetchers[i];
    try {
      const data = await f.run();
      return { data, source: f.name, fetchedAt: now().toISOString(), status: i === 0 ? "ok" : "fallback" };
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const error = errors.join(" | ");
  if (lastKnown?.data != null) {
    // On garde la date de collecte d'origine : l'âge réel reste visible.
    return { ...lastKnown, status: "stale", error };
  }
  return { data: null, source: "aucune", fetchedAt: now().toISOString(), status: "error", error };
}
