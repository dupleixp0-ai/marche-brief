// Formatage d'affichage (aucune règle de calcul ici).
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
export const fmtNum = (x: number, d = 2) => x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (x: number | null, d = 2, signed = true) =>
  x == null ? "—" : `${signed && x >= 0 ? "+" : ""}${x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
/** « Düsseldorf 21:46 » pour un dernier cours pris sur une place secondaire. */
export const fmtLate = (late?: { venue: string; time: string }) =>
  late ? `${late.venue} ${new Date(late.time).toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}` : "";
/**
 * Date et heure du dernier cours : « 27/11 à 21:46 · Düsseldorf » (heure de Berlin).
 * Sans heure connue (source de secours, ancien snapshot) : « 27/11 ».
 */
export function fmtQuote(date?: string, time?: string, venue?: string): string {
  if (!date) return "—";
  const d = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  if (!time) return venue ? `${d} · ${venue}` : d;
  const t = new Date(time);
  const day = t.toLocaleDateString("fr-FR", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
  const hm = t.toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  return `${day} à ${hm}${venue ? ` · ${venue}` : ""}`;
}
/** Montant signé avec unité : « +1,57 € », « -57 pts ». */
export const fmtSignedAmount = (x: number | null | undefined, unit: string, d = 2) =>
  x == null ? "—" : `${x >= 0 ? "+" : "-"}${Math.abs(x).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })}${unit ? ` ${unit}` : ""}`;
/** Variation : « +1,25 % · +1,57 € ». */
export const fmtChange = (c: { abs: number; pct: number } | null | undefined, unit: string, d = 2) =>
  c ? `${fmtPct(c.pct)} · ${fmtSignedAmount(c.abs, unit, d)}` : "—";
export const fmtRatio = (x: number) => fmtPct(x * 100, 1, false);
