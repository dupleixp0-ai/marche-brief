// Formatage d'affichage (aucune règle de calcul ici).
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
export const fmtNum = (x: number, d = 2) => x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (x: number | null, d = 2, signed = true) =>
  x == null ? "—" : `${signed && x >= 0 ? "+" : ""}${x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
/** « Düsseldorf 21:46 » pour un dernier cours pris sur une place secondaire. */
export const fmtLate = (late?: { venue: string; time: string }) =>
  late ? `${late.venue} ${new Date(late.time).toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}` : "";
export const fmtRatio = (x: number) => fmtPct(x * 100, 1, false);
