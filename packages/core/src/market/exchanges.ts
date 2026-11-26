// Horaires des places boursières (heure locale, jours ouvrés, jours fériés et séances écourtées).
import { localDate, localHour } from "./session";
import { marketDay, type Calendar } from "./holidays";

interface Hours { tz: string; open: number; close: number; cal: Calendar } // heures décimales
const HOURS: Record<string, Hours> = {
  "NASDAQ/NYSE": { tz: "America/New_York", open: 9.5, close: 16, cal: "US" },
  "NYSE Arca/Nasdaq": { tz: "America/New_York", open: 9.5, close: 16, cal: "US" },
  XETRA: { tz: "Europe/Berlin", open: 9, close: 17.5, cal: "DE" },
  "Euronext Paris": { tz: "Europe/Paris", open: 9, close: 17.5, cal: "EURONEXT" },
  "Euronext Amsterdam": { tz: "Europe/Amsterdam", open: 9, close: 17.5, cal: "EURONEXT" },
  SIX: { tz: "Europe/Zurich", open: 9, close: 17.5, cal: "CH" },
  LSE: { tz: "Europe/London", open: 8, close: 16.5, cal: "UK" },
  BME: { tz: "Europe/Madrid", open: 9, close: 17.5, cal: "EURONEXT" },
  "Borsa Italiana": { tz: "Europe/Rome", open: 9, close: 17.5, cal: "EURONEXT" },
  "Nasdaq Copenhague": { tz: "Europe/Copenhagen", open: 9, close: 17, cal: "EURONEXT" },
  "Nasdaq Helsinki": { tz: "Europe/Helsinki", open: 10, close: 18.5, cal: "EURONEXT" },
  "Nasdaq Stockholm": { tz: "Europe/Stockholm", open: 9, close: 17.5, cal: "EURONEXT" },
  "Oslo Børs": { tz: "Europe/Oslo", open: 9, close: 16.33, cal: "EURONEXT" },
};

export interface ExchangeStatus {
  open: boolean;
  /** "open", "weekend", "holiday" (avec son nom), "closed" (hors horaires). */
  reason: "open" | "weekend" | "holiday" | "closed";
  holiday?: string;
  /** Heure locale de clôture du jour (séance écourtée comprise). */
  closesAt?: number;
}

/** État détaillé d'une place ; null si place inconnue. */
export function exchangeStatus(exchange: string, now: Date): ExchangeStatus | null {
  const h = HOURS[exchange];
  if (!h) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: h.tz, weekday: "short", minute: "2-digit" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  if (wd === "Sat" || wd === "Sun") return { open: false, reason: "weekend" };
  const day = marketDay(h.cal, localDate(now, h.tz));
  if (day.holiday) return { open: false, reason: "holiday", holiday: day.holiday };
  const close = day.earlyClose ?? h.close;
  const t = localHour(now, h.tz) + Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  const open = t >= h.open && t < close;
  return { open, reason: open ? "open" : "closed", closesAt: close };
}

/** Place ouverte maintenant ? null si place inconnue. */
export function isExchangeOpen(exchange: string, now: Date): boolean | null {
  return exchangeStatus(exchange, now)?.open ?? null;
}
