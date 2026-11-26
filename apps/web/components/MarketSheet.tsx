"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { lastSession, seriesStats, smaSeries, type Bar, type IntradaySeries, type Outlook, type Signal, type Snapshot } from "@marche-brief/core";
import { PriceChart, type Line } from "./PriceChart";
import { FearGreedGauge } from "./FearGreedGauge";
import { StatusBadge } from "./Badges";
import { fmtDateTime, fmtNum, fmtPct } from "../lib/format";

export type MarketKind = "spx" | "vix" | "fg";

const RANGES = ["1J", "1S", "1M", "3M", "6M", "1A"] as const;
type Range = (typeof RANGES)[number];
const DAYS = { "1M": 21, "3M": 63, "6M": 126, "1A": 252 } as const;
const LABEL: Record<Range, string> = { "1J": "1 jour", "1S": "1 semaine", "1M": "1 mois", "3M": "3 mois", "6M": "6 mois", "1A": "1 an" };

const BIAS_CLS: Record<string, string> = {
  haussier: "bg-green-600", "plutôt haussier": "bg-green-500", neutre: "bg-slate-500", "plutôt baissier": "bg-orange-500", baissier: "bg-red-600",
};
export function BiasBadge({ bias }: { bias: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${BIAS_CLS[bias] ?? "bg-slate-500"}`}>{bias}</span>;
}

/** Bloc « Lecture du marché » : biais + signaux, avec leur règle. */
export function OutlookBlock({ o, compact = false }: { o: Outlook; compact?: boolean }) {
  const arrow = (s: Signal) => (s.effect > 0 ? <span className="text-green-600">▲</span> : s.effect < 0 ? <span className="text-red-600">▼</span> : <span className="text-slate-400">●</span>);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Biais global</span><BiasBadge bias={o.bias} />
        <span className="text-xs text-slate-500">court terme</span><BiasBadge bias={o.shortTerm} />
        <span className="text-xs text-slate-500">moyen terme</span><BiasBadge bias={o.mediumTerm} />
      </div>
      {!compact && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {o.signals.map((s) => (
            <li key={s.label} className="flex gap-2">
              <span className="w-4 shrink-0 text-center">{arrow(s)}</span>
              <span><b>{s.label}</b> <span className="text-[10px] text-slate-500">({s.horizon})</span> — {s.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        {o.points >= 0 ? "+" : ""}{o.points} sur {o.max} signaux. Lecture par règles simples, pas une prédiction : elle dit dans quel sens penchent les indicateurs aujourd'hui.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: number | null }) {
  return (
    <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone == null ? "" : tone >= 0 ? "text-green-600" : "text-red-600"}`}>{value}</p>
    </div>
  );
}

function Explain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">{children}</div>
    </div>
  );
}

const Swatch = ({ c }: { c: string }) => <span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: c }} />;

export function MarketSheet({ kind, snap, outlook, onClose, loadIntraday }: {
  kind: MarketKind; snap: Snapshot; outlook: Outlook; onClose: () => void; loadIntraday?: (s: string) => Promise<IntradaySeries>;
}) {
  const [range, setRange] = useState<Range>("1A");
  const symbol = kind === "vix" ? "^VIX" : "^GSPC";
  const src = kind === "vix" ? snap.market.vix : snap.market.spx;
  const bars: Bar[] = src.data?.bars ?? [];
  const [intra, setIntra] = useState<IntradaySeries | null>(snap.intraday?.[symbol]?.data ?? null);
  const [intraState, setIntraState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (kind === "fg" || !(range === "1J" || range === "1S") || !loadIntraday || intraState !== "idle") return;
    if (intra && Date.now() / 1000 - intra.points.at(-1)!.t < 3 * 3600) return;
    setIntraState("loading");
    loadIntraday(symbol).then((s) => { setIntra(s); setIntraState("idle"); }).catch(() => setIntraState("error"));
  }, [kind, range, loadIntraday, symbol, intra, intraState]);

  const color = kind === "vix" ? "#dc2626" : "#2563eb";
  const view = useMemo(() => {
    if (range === "1J" || range === "1S") {
      if (intra?.points.length) {
        const pts = range === "1J" ? lastSession(intra.points) : intra.points;
        const data = pts.map((p) => ({ time: p.t, value: p.close }));
        return { intraday: true, lines: [{ label: kind === "vix" ? "VIX" : "S&P 500", color, data, area: true }] as Line[], first: data[0]?.value, last: data.at(-1)?.value, note: `Pas de 15 min · ${fmtDateTime(new Date(pts.at(-1)!.t * 1000).toISOString())}` };
      }
      const data = bars.slice(range === "1J" ? -2 : -6).map((b) => ({ time: b.date, value: b.close }));
      return { intraday: false, lines: [{ label: kind === "vix" ? "VIX" : "S&P 500", color, data, area: true }] as Line[], first: data[0]?.value, last: data.at(-1)?.value, note: "Intraday indisponible : clôtures journalières affichées." };
    }
    const n = DAYS[range], closes = bars.map((b) => b.close);
    const mk = (vals: (number | null)[]) => bars.map((b, i) => ({ time: b.date, value: vals[i] })).slice(-n).filter((p): p is { time: string; value: number } => p.value != null);
    const main = mk(closes);
    const lines: Line[] = kind === "vix"
      ? [{ label: "VIX", color, data: main, area: true }, { label: "MM50", color: "#94a3b8", data: mk(smaSeries(closes, 50)), width: 1 }]
      : [{ label: "S&P 500", color, data: main, area: true }, { label: "MM125", color: "#94a3b8", data: mk(smaSeries(closes, 125)), width: 1 }, { label: "MM200", color: "#f59e0b", data: mk(smaSeries(closes, 200)), width: 1 }];
    return { intraday: false, lines, first: main[0]?.value, last: main.at(-1)?.value, note: null as string | null };
  }, [range, intra, bars, kind, color]);

  const stats = useMemo(() => seriesStats(bars.map((b) => b.close)), [bars]);
  const perf = view.first && view.last ? (view.last / view.first - 1) * 100 : null;
  const fg = snap.market.fearGreed;
  const title = kind === "vix" ? "VIX — indice de la peur" : kind === "spx" ? "S&P 500" : "Fear & Greed (CNN)";
  const signal = (label: string) => outlook.signals.find((s) => s.label === label);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm md:items-center md:justify-center md:p-6" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 md:max-w-4xl md:rounded-2xl md:p-6 md:shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-xl" aria-label="Fermer">×</button>
        </div>

        {kind === "fg" ? (
          <>
            {fg.data ? <FearGreedGauge value={fg.data.value} label={fg.data.label} /> : <p className="text-sm">Indisponible</p>}
            <p className="text-center text-[10px] text-slate-500">{fg.source}{fg.data?.homemade ? " (indice maison)" : ""} · {fmtDateTime(fg.fetchedAt)} <StatusBadge status={fg.status} /></p>
            <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px]">
              {[["0–25", "Peur extrême", "bg-red-600"], ["25–45", "Peur", "bg-orange-500"], ["45–55", "Neutre", "bg-slate-400"], ["55–75", "Avidité", "bg-lime-500"], ["75–100", "Avidité extrême", "bg-green-600"]].map(([r, l, c]) => (
                <div key={r} className={`rounded-lg p-1.5 text-white ${c}`}><b>{r}</b><br />{l}</div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-bold tabular-nums">{view.last != null ? fmtNum(view.last, kind === "vix" ? 2 : 0) : "—"} <span className="text-base font-medium text-slate-500">{kind === "vix" ? "" : "pts"}</span></p>
                <p className={`text-sm tabular-nums ${perf == null ? "" : (kind === "vix" ? -perf : perf) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPct(perf)} sur {LABEL[range]}</p>
              </div>
              <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
                {RANGES.map((k) => (
                  <button key={k} onClick={() => setRange(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${k === range ? "bg-white shadow dark:bg-slate-600" : "text-slate-500"}`}>{k}</button>
                ))}
              </div>
            </div>
            <div className="mt-2"><PriceChart lines={view.lines} intraday={view.intraday} height={typeof window !== "undefined" && window.innerWidth >= 768 ? 340 : 230} /></div>
            <p className="mt-1 text-[10px] text-slate-500">
              {intraState === "loading" ? "Chargement de l'intraday… · " : intraState === "error" ? "Intraday indisponible (Worker). · " : ""}
              {view.note ? `${view.note} · ` : ""}{src.source} · collecté le {fmtDateTime(src.fetchedAt)} · clôture du {bars.at(-1)?.date ?? "—"} <StatusBadge status={src.status} />
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="1 mois" value={fmtPct(stats.change1m != null ? stats.change1m * 100 : null)} tone={stats.change1m != null ? (kind === "vix" ? -stats.change1m : stats.change1m) : null} />
              <Stat label="3 mois" value={fmtPct(stats.change3m != null ? stats.change3m * 100 : null)} tone={stats.change3m != null ? (kind === "vix" ? -stats.change3m : stats.change3m) : null} />
              <Stat label="Plus haut / bas 1 an" value={`${stats.high1y != null ? fmtNum(stats.high1y, kind === "vix" ? 1 : 0) : "—"} / ${stats.low1y != null ? fmtNum(stats.low1y, kind === "vix" ? 1 : 0) : "—"}`} />
              {kind === "vix"
                ? <Stat label="Rang sur 1 an" value={stats.percentile1y != null ? `plus haut que ${Math.round(stats.percentile1y * 100)} % des jours` : "—"} />
                : <Stat label="Sous le plus haut 1 an" value={fmtPct(stats.drawdown1y != null ? stats.drawdown1y * 100 : null)} tone={stats.drawdown1y} />}
            </div>
          </>
        )}

        <div className="mt-4 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/40">
          <h3 className="mb-2 text-sm font-semibold">Impression générale : hausse ou baisse ?</h3>
          <OutlookBlock o={outlook} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {kind === "vix" && (
            <>
              <Explain title="C'est quoi le VIX ?">
                <p>Il mesure la <b>volatilité attendue</b> du S&amp;P 500 sur les 30 prochains jours, déduite du prix des options. Quand les investisseurs ont peur, ils achètent des protections : le VIX monte.</p>
                <p>Le VIX monte presque toujours quand les actions baissent. Un VIX qui grimpe est donc mauvais signe à court terme ; un VIX très haut qui redescend accompagne souvent la fin d'une chute.</p>
              </Explain>
              <Explain title="Les lignes du graphique">
                <p><Swatch c="#dc2626" /><b>Rouge</b> : le VIX chaque jour.</p>
                <p><Swatch c="#94a3b8" /><b>Gris — MM50</b> : moyenne des 50 dernières séances (~2,5 mois). C'est le « niveau normal » récent.</p>
                <p>VIX <b>au-dessus</b> de sa MM50 : la nervosité augmente. <b>En dessous</b> : le calme revient. {signal("VIX vs sa MM50")?.text}</p>
              </Explain>
              <Explain title="Repères de niveau">
                <p><b>&lt; 15</b> calme · <b>15–20</b> normal · <b>20–30</b> nervosité · <b>&gt; 30</b> stress, voire panique (2020 : 80 ; 2008 : 80).</p>
                <p>Aujourd'hui : <b>{stats.last != null ? fmtNum(stats.last, 1) : "—"}</b>, plus haut que {stats.percentile1y != null ? Math.round(stats.percentile1y * 100) : "—"} % des séances de l'année.</p>
              </Explain>
            </>
          )}
          {kind === "spx" && (
            <>
              <Explain title="C'est quoi le S&P 500 ?">
                <p>L'indice des <b>500 plus grandes entreprises américaines</b> (≈ 80 % de la bourse US). Il sert de baromètre au marché mondial : ton MSCI World y est exposé à environ 70 %.</p>
                <p>Il est exprimé en <b>points</b>, pas en euros ni en dollars.</p>
              </Explain>
              <Explain title="Les lignes du graphique">
                <p><Swatch c="#2563eb" /><b>Bleu</b> : l'indice chaque jour.</p>
                <p><Swatch c="#94a3b8" /><b>Gris — MM125</b> : moyenne des 125 dernières séances (~6 mois). Au-dessus = tendance de moyen terme haussière ; passer dessous est un premier signal d'alerte. {signal("S&P 500 vs MM125")?.text}</p>
                <p><Swatch c="#f59e0b" /><b>Orange — MM200</b> : moyenne ~10 mois, la référence de la « tendance de fond ». {signal("S&P 500 vs MM200")?.text}</p>
                <p>Une moyenne mobile lisse les variations : elle ne prédit rien, elle montre la direction.</p>
              </Explain>
            </>
          )}
          {kind === "fg" && (
            <>
              <Explain title="C'est quoi le Fear & Greed ?">
                <p>Un indice de <b>sentiment</b> de CNN, de 0 (peur extrême) à 100 (avidité extrême), calculé à partir de 7 indicateurs : momentum du S&amp;P 500 (vs sa MM125), plus hauts vs plus bas sur 52 semaines, ampleur du marché, ratio put/call des options, demande d'obligations risquées, VIX vs sa MM50 et demande de valeurs refuges.</p>
              </Explain>
              <Explain title="Comment le lire">
                <p>Il se lit <b>à contre-courant</b> : quand tout le monde a peur, beaucoup ont déjà vendu, et les points bas sont souvent proches. Quand tout le monde est avide, le marché est plus fragile.</p>
                <p>Ce n'est pas un signal de date : la peur extrême peut durer des semaines. {signal("Fear & Greed")?.text}</p>
              </Explain>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
