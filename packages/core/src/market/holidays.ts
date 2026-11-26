// Jours fériés et séances écourtées des places boursières, calculés par règles (valables chaque année).
// NYSE/Nasdaq, Xetra, LSE et SIX : calendriers officiels. Autres places européennes : base commune
// (Euronext) — approximation à vérifier si une place ajoute un jour particulier.

export type Calendar = "US" | "DE" | "EURONEXT" | "UK" | "CH";

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dow = (s: string) => new Date(`${s}T12:00:00Z`).getUTCDay();
const shift = (s: string, n: number) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Dimanche de Pâques (algorithme grégorien anonyme). */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

/** n-ième jour de semaine `wd` (0 = dimanche) du mois ; n = -1 : le dernier. */
function nthWeekday(y: number, m: number, wd: number, n: number): string {
  if (n > 0) {
    const first = iso(y, m, 1);
    return shift(first, ((wd - dow(first) + 7) % 7) + (n - 1) * 7);
  }
  const last = shift(iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1);
  return shift(last, -((dow(last) - wd + 7) % 7));
}

/** Règle américaine : samedi → vendredi, dimanche → lundi. */
const usObserved = (s: string) => (dow(s) === 6 ? shift(s, -1) : dow(s) === 0 ? shift(s, 1) : s);
/** Règle britannique : week-end → lundi suivant (ou mardi si le lundi est déjà pris). */
const ukObserved = (s: string, taken: string[] = []) => {
  let d = dow(s) === 6 ? shift(s, 2) : dow(s) === 0 ? shift(s, 1) : s;
  while (taken.includes(d)) d = shift(d, 1);
  return d;
};

export interface MarketDay { holiday?: string; earlyClose?: number }

function calendarYear(cal: Calendar, y: number): Record<string, MarketDay> {
  const out: Record<string, MarketDay> = {};
  const add = (d: string, name: string) => { if (dow(d) !== 0 && dow(d) !== 6) out[d] = { holiday: name }; };
  const early = (d: string, hour: number) => { if (dow(d) !== 0 && dow(d) !== 6 && !out[d]) out[d] = { earlyClose: hour }; };
  const e = easter(y);
  const goodFriday = shift(e, -2), easterMonday = shift(e, 1);

  if (cal === "US") {
    const ny = iso(y, 1, 1);
    if (dow(ny) !== 6) add(usObserved(ny), "Nouvel An"); // samedi : pas de report au vendredi 31/12
    add(nthWeekday(y, 1, 1, 3), "Martin Luther King Day");
    add(nthWeekday(y, 2, 1, 3), "Presidents' Day");
    add(goodFriday, "Vendredi saint");
    add(nthWeekday(y, 5, 1, -1), "Memorial Day");
    add(usObserved(iso(y, 6, 19)), "Juneteenth");
    add(usObserved(iso(y, 7, 4)), "Independence Day");
    add(nthWeekday(y, 9, 1, 1), "Labor Day");
    const thanksgiving = nthWeekday(y, 11, 4, 4);
    add(thanksgiving, "Thanksgiving");
    add(usObserved(iso(y, 12, 25)), "Noël");
    early(shift(thanksgiving, 1), 13);
    early(iso(y, 12, 24), 13);
    if (dow(iso(y, 7, 4)) !== 6) early(iso(y, 7, 3), 13);
  } else if (cal === "UK") {
    add(ukObserved(iso(y, 1, 1)), "Nouvel An");
    add(goodFriday, "Vendredi saint");
    add(easterMonday, "Lundi de Pâques");
    add(nthWeekday(y, 5, 1, 1), "Early May Bank Holiday");
    add(nthWeekday(y, 5, 1, -1), "Spring Bank Holiday");
    add(nthWeekday(y, 8, 1, -1), "Summer Bank Holiday");
    const xmas = ukObserved(iso(y, 12, 25));
    add(xmas, "Noël");
    add(ukObserved(iso(y, 12, 26), [xmas]), "Boxing Day");
    early(iso(y, 12, 24), 12.5);
    early(iso(y, 12, 31), 12.5);
  } else {
    add(iso(y, 1, 1), "Nouvel An");
    add(goodFriday, "Vendredi saint");
    add(easterMonday, "Lundi de Pâques");
    add(iso(y, 5, 1), "Fête du travail");
    add(iso(y, 12, 25), "Noël");
    add(iso(y, 12, 26), "Lendemain de Noël");
    if (cal === "DE" || cal === "CH") { add(iso(y, 12, 24), "Veille de Noël"); add(iso(y, 12, 31), "Saint-Sylvestre"); }
    if (cal === "CH") {
      add(iso(y, 1, 2), "Saint-Berchtold");
      add(shift(e, 39), "Ascension");
      add(shift(e, 50), "Lundi de Pentecôte");
      add(iso(y, 8, 1), "Fête nationale suisse");
    }
    if (cal === "EURONEXT") { early(iso(y, 12, 24), 14); early(iso(y, 12, 31), 14); }
  }
  return out;
}

const memo = new Map<string, Record<string, MarketDay>>();
/** Jour férié ou séance écourtée à la date locale `date` (AAAA-MM-JJ) ; {} si séance normale. */
export function marketDay(cal: Calendar, date: string): MarketDay {
  const y = Number(date.slice(0, 4));
  const k = `${cal}${y}`;
  if (!memo.has(k)) memo.set(k, calendarYear(cal, y));
  return memo.get(k)![date] ?? {};
}

/** Nom du jour férié, ou null. */
export const holidayName = (cal: Calendar, date: string): string | null => marketDay(cal, date).holiday ?? null;
