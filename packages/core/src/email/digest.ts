// E-mail récapitulatif de 6h00 : contenu essentiel + alertes.
import type { Snapshot } from "../collect";
import type { Decision } from "../scoring/score";
import { dailyChangePct } from "../indicators/change";
import { marketSummary } from "../market/summary";

export interface Alert { kind: "decision" | "vix"; text: string }
export interface Digest { subject: string; html: string; text: string; alerts: Alert[] }
export interface DigestOptions {
  siteUrl?: string;
  vixAlert?: number;          // seuil d'alerte VIX (défaut 30)
  etfs: string[];
  stocks: string[];
  names?: Record<string, string>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (x: number, d = 2) => x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${num(x)} %`);
const berlin = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Berlin", dateStyle: "full", timeStyle: "short" });
const COLOR: Record<Decision, string> = { Acheter: "#16a34a", Attendre: "#64748b", Vendre: "#dc2626" };

/** Changements de recommandation depuis le snapshot précédent et dépassement du seuil VIX. */
export function computeAlerts(snap: Snapshot, previous: Snapshot | null, vixAlert = 30): Alert[] {
  const alerts: Alert[] = [];
  for (const [sym, s] of Object.entries(snap.scores)) {
    const before = previous?.scores?.[sym]?.decision;
    if (before && before !== s.decision) alerts.push({ kind: "decision", text: `${sym} : ${before} → ${s.decision} (score ${s.score})` });
  }
  const vix = snap.market.vix.data?.bars.at(-1)?.close;
  const vixBefore = previous?.market.vix.data?.bars.at(-1)?.close;
  if (vix != null && vix >= vixAlert && !(vixBefore != null && vixBefore >= vixAlert))
    alerts.push({ kind: "vix", text: `Le VIX dépasse ${vixAlert} (${num(vix)}) : forte nervosité du marché.` });
  return alerts;
}

export function buildDigest(snap: Snapshot, previous: Snapshot | null, opt: DigestOptions): Digest {
  const alerts = computeAlerts(snap, previous, opt.vixAlert ?? 30);
  const vixBars = snap.market.vix.data?.bars ?? [], spxBars = snap.market.spx.data?.bars ?? [];
  const fg = snap.market.fearGreed.data;
  const m = marketSummary({ vixCloses: vixBars.map((b) => b.close), spxCloses: spxBars.map((b) => b.close), fearGreed: fg?.value ?? null });
  const counts = { Acheter: 0, Attendre: 0, Vendre: 0 } as Record<Decision, number>;
  Object.values(snap.scores).forEach((s) => counts[s.decision]++);

  const row = (sym: string) => {
    const bars = snap.prices[sym]?.data?.bars ?? [];
    const s = snap.scores[sym];
    const ch = dailyChangePct(bars);
    return { sym, name: opt.names?.[sym] ?? "", close: bars.at(-1)?.close, date: bars.at(-1)?.date, ch, s };
  };
  const etfs = opt.etfs.map(row);
  const stocks = opt.stocks.map(row).sort((a, b) => (b.s?.score ?? -1) - (a.s?.score ?? -1));
  const bullets = snap.brief?.data?.bullets ?? [];
  const news = snap.news?.data ?? [];
  const disc = snap.discoveries?.data;

  const subject = `Marché-Brief · ${new Date(snap.generatedAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Berlin", day: "numeric", month: "long" })}`
    + (alerts.length ? ` · ${alerts.length} alerte(s)` : "")
    + (fg ? ` · Fear & Greed ${fg.value}` : "");

  // ---- HTML (styles en ligne, une colonne : lisible sur téléphone) ----
  const td = "padding:6px 4px;border-bottom:1px solid #e2e8f0;font-size:13px;";
  const table = (rows: ReturnType<typeof row>[]) => `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
      ${rows.map((r) => `<tr>
        <td style="${td}"><b>${esc(r.sym)}</b><br><span style="color:#64748b;font-size:11px">${esc(r.name)}</span></td>
        <td style="${td}text-align:right">${r.close != null ? num(r.close) : "—"}<br><span style="font-size:11px;color:${(r.ch ?? 0) >= 0 ? "#16a34a" : "#dc2626"}">${pct(r.ch)}</span></td>
        <td style="${td}text-align:right">${r.s ? `<span style="background:${COLOR[r.s.decision]};color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;white-space:nowrap">${r.s.decision} · ${r.s.score}</span>` : "—"}</td>
      </tr>`).join("")}
    </table>`;
  const h2 = (t: string) => `<h2 style="font-size:16px;margin:22px 0 8px">${t}</h2>`;
  const discList = (l: NonNullable<typeof disc>["stocks"]) => l.slice(0, 3).map((d) =>
    `<li style="margin-bottom:6px"><b>${esc(d.name)}</b> (${esc(d.ticker)}, ${esc(d.exchange)}) · score ${d.score} · 3 mois en € ${pct(d.perf3mEUR == null ? null : d.perf3mEUR * 100)}<br><span style="color:#475569;font-size:12px">${esc(d.why[0] ?? "")}</span></li>`).join("");

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:20px">
    <h1 style="font-size:20px;margin:0">Marché-Brief</h1>
    <p style="color:#64748b;font-size:12px;margin:4px 0 0">Collecte réelle : ${esc(berlin(snap.generatedAt))} (heure de Berlin)</p>
    ${snap.marketNote ? `<p style="background:#fef3c7;padding:8px;border-radius:6px;font-size:13px">${esc(snap.marketNote)}</p>` : ""}
    ${alerts.length ? `${h2("⚠️ Alertes")}<ul style="padding-left:18px;font-size:14px">${alerts.map((a) => `<li>${esc(a.text)}</li>`).join("")}</ul>` : ""}
    ${h2("Marché")}
    <p style="font-size:14px;margin:0">${fg ? `Fear &amp; Greed <b>${fg.value}</b> (${esc(fg.label)}) · ` : ""}VIX <b>${m.vix != null ? num(m.vix) : "—"}</b> · S&amp;P 500 <b>${m.spx != null ? num(m.spx, 0) : "—"}</b></p>
    <p style="font-size:14px;color:#334155">${esc(m.sentence)}</p>
    <p style="font-size:12px;color:#64748b">Recommandations : ${counts.Acheter} Acheter · ${counts.Attendre} Attendre · ${counts.Vendre} Vendre</p>
    ${h2("Brief du jour")}
    ${bullets.length
      ? `<ul style="padding-left:18px;font-size:14px">${bullets.map((b) => `<li style="margin-bottom:6px">${esc(b.text)} ${b.links.map((l, i) => `<a href="${esc(l.url)}" style="color:#2563eb;font-size:12px">[${i + 1}]</a>`).join(" ")}</li>`).join("")}</ul>`
      : `<ul style="padding-left:18px;font-size:13px">${news.slice(0, 6).map((n) => `<li><a href="${esc(n.url)}" style="color:#0f172a">${esc(n.title)}</a> <span style="color:#64748b">· ${esc(n.source)}</span></li>`).join("")}</ul>`}
    ${h2("Mes ETF")}${table(etfs)}
    <p style="font-size:11px;color:#64748b">Pour un ETF long terme, « Vendre » signifie surtout « tendance dégradée » (lecture : Réduire).</p>
    ${h2("Actions suivies")}${table(stocks)}
    ${disc ? `${h2("Découvertes")}<p style="font-size:13px;margin:0"><b>Actions</b></p><ul style="padding-left:18px;font-size:13px">${discList(disc.stocks)}</ul><p style="font-size:13px;margin:0"><b>ETF</b></p><ul style="padding-left:18px;font-size:13px">${discList(disc.etfs)}</ul>` : ""}
    ${opt.siteUrl ? `<p style="text-align:center;margin:24px 0"><a href="${esc(opt.siteUrl)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:20px;text-decoration:none;font-weight:600">Ouvrir le dashboard</a></p>` : ""}
    <p style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px">Information uniquement, pas un conseil en investissement. Les cours datent de la dernière clôture de chaque place.</p>
  </div></body></html>`;

  const text = [
    `Marché-Brief — collecte du ${berlin(snap.generatedAt)}`,
    snap.marketNote ?? "",
    alerts.length ? `\nALERTES\n${alerts.map((a) => `- ${a.text}`).join("\n")}` : "",
    `\nMARCHÉ\n${fg ? `Fear & Greed ${fg.value} (${fg.label}) · ` : ""}VIX ${m.vix != null ? num(m.vix) : "—"}\n${m.sentence}`,
    `\nBRIEF\n${(bullets.length ? bullets.map((b) => b.text) : news.slice(0, 6).map((n) => n.title)).map((t) => `- ${t}`).join("\n")}`,
    `\nETF\n${etfs.map((r) => `- ${r.sym} ${r.close != null ? num(r.close) : "—"} (${pct(r.ch)}) ${r.s ? `${r.s.decision} ${r.s.score}` : ""}`).join("\n")}`,
    `\nACTIONS\n${stocks.map((r) => `- ${r.sym} ${r.close != null ? num(r.close) : "—"} (${pct(r.ch)}) ${r.s ? `${r.s.decision} ${r.s.score}` : ""}`).join("\n")}`,
    opt.siteUrl ? `\nDashboard : ${opt.siteUrl}` : "",
    "\nInformation uniquement, pas un conseil en investissement.",
  ].filter(Boolean).join("\n");

  return { subject, html, text, alerts };
}
