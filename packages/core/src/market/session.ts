// État d'ouverture du marché américain, vu depuis Berlin.

/** Date du jour (AAAA-MM-JJ) dans un fuseau donné. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Heure (0–23) dans un fuseau donné. */
export function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(now)) % 24;
}

const dayOfWeek = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Dernière séance US attendue (jour ouvré précédent la date de New York, jours fériés non compris). */
export function expectedLastSession(now: Date): string {
  let d = addDays(localDate(now, "America/New_York"), -1);
  while (dayOfWeek(d) === 0 || dayOfWeek(d) === 6) d = addDays(d, -1);
  return d;
}

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Note affichée quand les cours ne sont pas ceux de la veille :
 * week-end (« cours du vendredi ») ou jour férié / données en retard.
 * null si les cours sont à jour.
 */
export function marketClosedNote(lastBarDate: string | undefined, now: Date): string | null {
  if (!lastBarDate) return "Cours indisponibles.";
  const expected = expectedLastSession(now);
  const label = `${DAYS[dayOfWeek(lastBarDate)]} ${lastBarDate.slice(8, 10)}/${lastBarDate.slice(5, 7)}`;
  const nyDow = dayOfWeek(localDate(now, "America/New_York"));
  const weekend = nyDow === 0 || nyDow === 6 || (nyDow === 1 && localHour(now, "America/New_York") < 16);
  if (lastBarDate >= expected) return weekend && dayOfWeek(lastBarDate) === 5 ? `Marché fermé (week-end) : cours du ${label}.` : null;
  return `Marché fermé (jour férié) ou données en retard : cours du ${label}.`;
}
