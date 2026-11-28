"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { smaSeries, etfReading, lastSession, type Bar, type Decision, type Factor, type IntradaySeries, type NewsItem, type SourceStatus, type Timing, changeBetween } from "@marche-brief/core";
import { PriceChart } from "./PriceChart";
import { InfoTip } from "./InfoTip";
import { DecisionBadge, StatusBadge, TimingBadge } from "./Badges";
import { Abbr } from "./Abbr";
import { fmtChange, fmtDateTime, fmtNum, fmtPct, fmtQuote } from "../lib/format";
import { currencySymbol, useCurrency } from "../lib/currency";
import type { WatchItem } from "../lib/types";

const RANGES = ["1J", "1S", "1M", "3M", "6M", "1A"] as const;
type Range = (typeof RANGES)[number];
const DAYS: Record<Exclude<Range, "1J" | "1S">, number> = { "1M": 21, "3M": 63, "6M": 126, "1A": 252 };
const LABEL: Record<Range, string> = { "1J": "1 jour", "1S": "1 semaine", "1M": "1 mois", "3M": "3 mois", "6M": "6 mois", "1A": "1 an" };

export interface DetailTarget {
  ticker: string;
  name: string;
  subtitle?: string;
  isEtf: boolean;
  bars: Bar[];
  currency?: string;
  meta?: { source: string; fetchedAt: string; status: SourceStatus };
  /** Heure exacte et place du dernier cours. */
  quote?: { time?: string; venue?: string };
  score?: { score: number; decision: Decision; factors: Factor[]; reasons?: string[]; confidence?: string; asOf?: string; timing?: Timing };
  intraday?: IntradaySeries | null;
  info?: WatchItem;
  explanation?: string;
  sentiment?: { value: number; reason: string };
  news?: NewsItem[];
  extra?: ReactNode;
}

export function DetailSheet({ target: d, onClose, loadIntraday }: {
  target: DetailTarget; onClose: () => void; loadIntraday?: (symbol: string) => Promise<IntradaySeries>;
}) {
  const cur = useCurrency();
  const [range, setRange] = useState<Range>("3M");
  const [intra, setIntra] = useState<IntradaySeries | null>(d.intraday ?? null);
  const [intraState, setIntraState] = useState<"idle" | "loading" | "error">("idle");

  // Intraday à la demande (Worker) si le snapshot n'en contient pas, ou s'il date d'avant aujourd'hui.
  useEffect(() => {
    if (!(range === "1J" || range === "1S") || !loadIntraday || intraState !== "idle") return;
    const fresh = intra && Date.now() / 1000 - intra.points.at(-1)!.t < 3 * 3600;
    if (fresh) return;
    setIntraState("loading");
    loadIntraday(d.ticker).then((s) => { setIntra(s); setIntraState("idle"); }).catch(() => setIntraState("error"));
  }, [range, loadIntraday, d.ticker, intra, intraState]);

  const view = useMemo(() => {
    const conv = cur.bars(d.bars, d.currency);
    const unit = currencySymbol(conv.currency);
    if (range === "1J" || range === "1S") {
      if (intra?.points.length) {
        const pts = range === "1J" ? lastSession(intra.points) : intra.points;
        const c = cur.points(pts, intra.currency ?? d.currency);
        const data = c.points.map((p) => ({ time: p.t, value: p.close }));
        return { intraday: true, unit: currencySymbol(c.currency), lines: [{ label: d.ticker, color: "#2563eb", data, width: 2 as const, area: true }], first: data[0]?.value, last: data.at(-1)?.value, note: `Pas de 15 min · ${fmtDateTime(new Date(pts.at(-1)!.t * 1000).toISOString())}` };
      }
      // Secours : clôtures journalières.
      const n = range === "1J" ? 2 : 6;
      const data = conv.bars.slice(-n).map((b) => ({ time: b.date, value: b.close }));
      return { intraday: false, unit, lines: [{ label: d.ticker, color: "#2563eb", data, width: 2 as const, area: true }], first: data[0]?.value, last: data.at(-1)?.value, note: "Intraday indisponible : clôtures journalières affichées." };
    }
    const n = DAYS[range];
    const closes = conv.bars.map((b) => b.close);
    const mk = (vals: (number | null)[]) =>
      conv.bars.map((b, i) => ({ time: b.date, value: vals[i] })).slice(-n).filter((p): p is { time: string; value: number } => p.value != null);
    const main = mk(closes);
    return {
      intraday: false, unit, first: main[0]?.value, last: main.at(-1)?.value, note: null as string | null,
      lines: [
        { label: d.ticker, color: "#2563eb", data: main, width: 2 as const, area: true },
        { label: "MM50", color: "#f59e0b", data: mk(smaSeries(closes, 50)), width: 1 as const },
        { label: "MM125", color: "#a855f7", data: mk(smaSeries(closes, 125)), width: 1 as const },
        { label: "MM200", color: "#64748b", data: mk(smaSeries(closes, 200)), width: 1 as const },
      ],
    };
  }, [d, range, intra, cur]);

  const chg = changeBetween(view.first, view.last);
  const s = d.score;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm md:items-center md:justify-center md:p-6" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 md:max-w-4xl md:rounded-2xl md:p-6 md:shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold"><Abbr text={d.name} /> <span className="text-sm font-normal text-slate-500">{d.ticker}</span></h2>
            {d.subtitle && <p className="text-xs text-slate-500">{d.subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-xl" aria-label="Fermer">×</button>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-2xl font-bold tabular-nums">{view.last != null ? fmtNum(view.last) : "—"} <span className="text-base font-medium text-slate-500">{view.unit}</span></p>
            <p className={`text-sm tabular-nums ${chg == null ? "" : chg.pct >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtChange(chg, view.unit)} sur {LABEL[range]}</p>
          </div>
          <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
            {RANGES.map((k) => (
              <button key={k} onClick={() => setRange(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${k === range ? "bg-white shadow dark:bg-slate-600" : "text-slate-500"}`}>{k}</button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          <PriceChart lines={view.lines} intraday={view.intraday} unit={view.unit} height={typeof window !== "undefined" && window.innerWidth >= 768 ? 340 : 230} />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {intraState === "loading" ? "Chargement de l'intraday… · " : intraState === "error" ? "Intraday indisponible (Worker). · " : ""}
          {view.note ? `${view.note} · ` : ""}
          {d.meta ? <>{d.meta.source} · collecté le {fmtDateTime(d.meta.fetchedAt)} · </> : null}
          cours du {fmtQuote(d.bars.at(-1)?.date, d.quote?.time, d.quote?.venue)}{d.currency && d.currency !== cur.currency ? ` · cotation en ${d.currency}, converti en ${cur.currency}` : ""}
          {d.meta && <> <StatusBadge status={d.meta.status} /></>}
        </p>

        {d.info?.fullName && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <p className="font-medium"><Abbr text={d.info.fullName} /></p>
            {d.info.index && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Indice suivi : {d.info.index}</p>}
            <p className="mt-1 text-[11px] text-slate-500">{[d.info.issuer, d.info.isin && `ISIN ${d.info.isin}`, d.info.exchange].filter(Boolean).join(" · ")}</p>
            <Abbr text={`${d.name} ${d.info.fullName}`} legend />
          </div>
        )}

        {d.extra}

        {s ? (
          <>
            <div className="mt-4 flex items-center gap-2">
              <DecisionBadge decision={s.decision} />
              <span className="text-sm">Score {s.score}/100<InfoTip k="tipScore" />{s.confidence ? ` · confiance ${s.confidence}` : ""}</span>
            </div>
            {d.explanation && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-sm dark:bg-blue-950/40">{d.explanation}</p>}
            {s.timing && (
              <div className={`mt-3 rounded-xl border p-3 ${s.timing.moment === "favorable" ? "border-green-600/40 bg-green-50 dark:bg-green-950/30" : s.timing.moment === "etire" ? "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30" : "border-slate-200 dark:border-slate-800"}`}>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Moment d&apos;entrée<InfoTip k="tipTiming" /></h3>
                  <TimingBadge moment={s.timing.moment} always />
                </div>
                <p className="mt-1 text-sm font-medium">{s.timing.label}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">{s.timing.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            {d.isEtf && (
              <p className="mt-1 text-xs text-slate-500">
                Lecture long terme : <b>{etfReading(s.decision)}</b>. Pour un ETF, « Vendre » signifie surtout « tendance dégradée ».
              </p>
            )}
            <div className="md:grid md:grid-cols-2 md:gap-6">
              {s.reasons?.length ? (
                <div>
                  <h3 className="mt-4 text-sm font-semibold">Raisons</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{s.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ) : null}
              <div>
                <h3 className="mt-4 text-sm font-semibold">Score par facteur<InfoTip k="tipRsi" /></h3>
                <div className="mt-2 space-y-2">
                  {s.factors.map((f) => (
                    <div key={f.key}>
                      <div className="flex justify-between text-xs">
                        <span>{f.label} <span className="text-slate-500">({Math.round(f.weight * 100)} %)</span></span>
                        <span className="tabular-nums">{f.score}</span>
                      </div>
                      <div className="h-2 rounded bg-slate-200 dark:bg-slate-800">
                        <div className={`h-2 rounded ${f.score >= 65 ? "bg-green-600" : f.score < 40 ? "bg-red-600" : "bg-slate-500"}`} style={{ width: `${f.score}%` }} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">{f.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {s.asOf && <p className="mt-3 text-[10px] text-slate-500">Score calculé sur la clôture du {s.asOf} (en devise de cotation).</p>}
          </>
        ) : <p className="mt-4 text-sm">Pas de score (historique insuffisant).</p>}

        {d.news && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Actualités liées</h3>
            {d.sentiment && (
              <p className="text-xs">Sentiment : <b className={d.sentiment.value >= 0 ? "text-green-600" : "text-red-600"}>{d.sentiment.value >= 0 ? "+" : ""}{d.sentiment.value.toFixed(1)}</b> — {d.sentiment.reason}</p>
            )}
            {d.news.length ? (
              <ul className="mt-1 space-y-1 text-sm">
                {d.news.map((n) => (
                  <li key={n.url}><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{n.title}</a> <span className="text-[10px] text-slate-500">· {n.source}{n.publishedAt ? ` · ${fmtDateTime(n.publishedAt)}` : ""}</span></li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500">Aucune actualité récente pour cette valeur.</p>}
          </>
        )}
      </div>
    </div>
  );
}
