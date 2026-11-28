import { isExtremeFear, isExtremeGreed } from "../adapters/cnn";
// « Le point du jour » : résumé en phrases simples, calculé uniquement à partir des chiffres collectés.
// Fiable sans clé API (pas d'IA) ; le résumé des actualités par Claude vient en complément.
import type { Bar } from "../types";
import { sma } from "../indicators/sma";
import { dailyChangePct } from "../indicators/change";
import { returnOver } from "../indicators/series";
import type { Outlook } from "./outlook";

export type Tone = "up" | "down" | "neutral" | "warn";
export interface PointBullet { topic: string; text: string; tone: Tone }

export interface DailyPointInput {
  spx: Bar[];
  vix: Bar[];
  fearGreed: { value: number; label: string } | null;
  outlook: Outlook | null;
  marketNote: string | null;
  etfs: { ticker: string; name: string; bars: Bar[]; decision?: string }[];
  stocks: { ticker: string; bars: Bar[]; decision?: string }[];
  discoveries?: { stock?: { name: string; country: string; score: number }; etf?: { name: string; score: number } };
}

const num = (x: number, d = 1) => x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x: number) => `${x >= 0 ? "+" : ""}${num(x, 1)} %`;

export function dailyPoint(inp: DailyPointInput): PointBullet[] {
  const out: PointBullet[] = [];

  // 1. Marché américain (référence mondiale).
  const spxC = inp.spx.map((b) => b.close);
  const spx = spxC.at(-1), spxCh = dailyChangePct(inp.spx), ma125 = sma(spxC, 125);
  if (spx != null && spxCh != null) {
    const dir = spxCh > 0.3 ? "monte" : spxCh < -0.3 ? "recule" : "est stable";
    const trend = ma125 == null ? "" : spx >= ma125 ? ", au-dessus de sa moyenne 6 mois (tendance haussière)" : ", sous sa moyenne 6 mois (tendance dégradée)";
    out.push({ topic: "Marché", tone: spxCh > 0.3 ? "up" : spxCh < -0.3 ? "down" : "neutral",
      text: `Le S&P 500 ${dir} (${pct(spxCh)} à ${num(spx, 0)} points, séance du ${inp.spx.at(-1)!.date.slice(8, 10)}/${inp.spx.at(-1)!.date.slice(5, 7)})${trend}.${inp.marketNote ? ` ${inp.marketNote}` : ""}` });
  }

  // 2. Nervosité et sentiment.
  const vix = inp.vix.at(-1)?.close, vixMa = sma(inp.vix.map((b) => b.close), 50);
  if (vix != null) {
    const level = vix >= 30 ? "très élevée" : vix >= 20 ? "élevée" : vix >= 15 ? "normale" : "faible";
    const fg = inp.fearGreed ? ` Le sentiment des investisseurs est à « ${inp.fearGreed.label.toLowerCase()} » (Fear & Greed ${Math.round(inp.fearGreed.value)}/100)${isExtremeFear(inp.fearGreed.value) ? ", ce qui a souvent précédé des rebonds" : isExtremeGreed(inp.fearGreed.value) ? ", signe possible d'excès" : ""}.` : "";
    out.push({ topic: "Nervosité", tone: vix >= 20 ? "warn" : "neutral",
      text: `Nervosité ${level} : VIX à ${num(vix)}${vixMa != null ? ` (moyenne 50 jours ${num(vixMa)})` : ""}.${fg}` });
  }

  // 3. Tendance générale (biais des signaux).
  if (inp.outlook && inp.outlook.max) {
    const o = inp.outlook;
    const down = o.signals.filter((s) => s.effect < 0).length, up = o.signals.filter((s) => s.effect > 0).length;
    out.push({ topic: "Tendance", tone: o.points > 0 ? "up" : o.points < 0 ? "down" : "neutral",
      text: `Lecture des indicateurs : biais ${o.bias} (${up} signal${up > 1 ? "s" : ""} vers la hausse, ${down} vers la baisse) — court terme ${o.shortTerm}, moyen terme ${o.mediumTerm}.` });
  }

  // 4. Tes ETF aujourd'hui et sur un mois.
  const etf = inp.etfs.map((e) => ({ ...e, d: dailyChangePct(e.bars), m: returnOver(e.bars.map((b) => b.close), 21) }))
    .filter((e): e is typeof e & { d: number } => e.d != null);
  if (etf.length) {
    const sorted = [...etf].sort((a, b) => b.d - a.d);
    const ups = etf.filter((e) => e.d > 0).length;
    const best = sorted[0], worst = sorted.at(-1)!;
    const head = ups === etf.length ? "tous en hausse" : ups === 0 ? "tous en baisse" : `${ups} sur ${etf.length} en hausse`;
    out.push({ topic: "Mes ETF", tone: ups * 2 > etf.length ? "up" : ups * 2 < etf.length ? "down" : "neutral",
      text: `Tes ETF sont ${head} sur la dernière séance : de ${pct(worst.d)} (${worst.name}) à ${pct(best.d)} (${best.name}).` });
    const m = etf.filter((e): e is typeof e & { m: number } => e.m != null).sort((a, b) => b.m - a.m);
    if (m.length >= 2) {
      out.push({ topic: "Sur 1 mois", tone: m[0].m > 0 && m.at(-1)!.m > 0 ? "up" : m[0].m < 0 ? "down" : "neutral",
        text: `Sur un mois, le meilleur est ${m[0].name} (${pct(m[0].m * 100)}) et le plus faible ${m.at(-1)!.name} (${pct(m.at(-1)!.m * 100)}).` });
    }
  }

  // 5. Signaux du score.
  const all = [...inp.etfs, ...inp.stocks].filter((x) => x.decision);
  if (all.length) {
    const c = { Acheter: 0, Attendre: 0, Vendre: 0 } as Record<string, number>;
    for (const x of all) c[x.decision!] = (c[x.decision!] ?? 0) + 1;
    const buys = all.filter((x) => x.decision === "Acheter").map((x) => ("name" in x ? x.name : x.ticker));
    out.push({ topic: "Signaux", tone: c.Vendre > all.length / 2 ? "down" : c.Acheter > all.length / 2 ? "up" : "neutral",
      text: `Signaux du score : ${c.Acheter} Acheter, ${c.Attendre} Attendre, ${c.Vendre} Vendre sur ${all.length} valeurs suivies${buys.length ? ` (Acheter : ${buys.slice(0, 4).join(", ")})` : ""}.${c.Vendre > all.length / 2 ? " Beaucoup de « Vendre » : pour un ETF de long terme, cela signifie surtout « tendance dégradée », pas forcément de vendre." : ""}` });
  }

  // 6. Action la plus marquante du jour.
  const mv = inp.stocks.map((s) => ({ ...s, d: dailyChangePct(s.bars) })).filter((s): s is typeof s & { d: number } => s.d != null)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  if (mv && Math.abs(mv.d) >= 2) {
    out.push({ topic: "Actions", tone: mv.d > 0 ? "up" : "down", text: `Plus forte variation parmi tes actions suivies : ${mv.ticker} (${pct(mv.d)}).` });
  }

  // 7. Découvertes.
  const d = inp.discoveries;
  if (d?.stock || d?.etf) {
    const parts = [d.stock && `${d.stock.name} (${d.stock.country}, score ${d.stock.score})`, d.etf && `l'ETF ${d.etf.name} (score ${d.etf.score})`].filter(Boolean);
    out.push({ topic: "Découvertes", tone: "neutral", text: `En tête des découvertes du jour : ${parts.join(" et ")}.` });
  }
  return out;
}
