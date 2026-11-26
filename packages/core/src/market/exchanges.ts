// Horaires des places boursières (heure locale, jours ouvrés ; jours fériés non gérés).
import { localHour } from "./session";

interface Hours { tz: string; open: number; close: number } // heures décimales
const HOURS: Record<string, Hours> = {
  "NASDAQ/NYSE": { tz: "America/New_York", open: 9.5, close: 16 },
  "NYSE Arca/Nasdaq": { tz: "America/New_York", open: 9.5, close: 16 },
  XETRA: { tz: "Europe/Berlin", open: 9, close: 17.5 },
  "Euronext Paris": { tz: "Europe/Paris", open: 9, close: 17.5 },
  "Euronext Amsterdam": { tz: "Europe/Amsterdam", open: 9, close: 17.5 },
  SIX: { tz: "Europe/Zurich", open: 9, close: 17.5 },
  LSE: { tz: "Europe/London", open: 8, close: 16.5 },
  BME: { tz: "Europe/Madrid", open: 9, close: 17.5 },
  "Borsa Italiana": { tz: "Europe/Rome", open: 9, close: 17.5 },
  "Nasdaq Copenhague": { tz: "Europe/Copenhagen", open: 9, close: 17 },
  "Nasdaq Helsinki": { tz: "Europe/Helsinki", open: 10, close: 18.5 },
  "Nasdaq Stockholm": { tz: "Europe/Stockholm", open: 9, close: 17.5 },
  "Oslo Børs": { tz: "Europe/Oslo", open: 9, close: 16.33 },
};

/** Place ouverte maintenant ? null si place inconnue. */
export function isExchangeOpen(exchange: string, now: Date): boolean | null {
  const h = HOURS[exchange];
  if (!h) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: h.tz, weekday: "short", minute: "2-digit" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  if (wd === "Sat" || wd === "Sun") return false;
  const t = localHour(now, h.tz) + Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  return t >= h.open && t < h.close;
}
