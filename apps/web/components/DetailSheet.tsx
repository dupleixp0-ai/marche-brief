"use client";
import { useMemo, useState } from "react";
import { smaSeries, etfReading, type PriceSeries, type ScoreResult, type SourceResult, type NewsItem } from "@marche-brief/core";
import { PriceChart } from "./PriceChart";
import { InfoTip } from "./InfoTip";
import { DecisionBadge, StatusBadge } from "./Badges";
import { fmtDateTime } from "../lib/format";

const RANGES = { "1M": 21, "3M": 63, "1A": 252 } as const;

export function DetailSheet({ ticker, name, r, s, isEtf, onClose, explanation, sentiment, news = [] }: {
  ticker: string; name?: string; r?: SourceResult<PriceSeries>; s?: ScoreResult & { asOf: string }; isEtf: boolean; onClose: () => void;
  explanation?: string; sentiment?: { value: number; reason: string }; news?: NewsItem[];
}) {
  const [range, setRange] = useState<keyof typeof RANGES>("3M");
  const lines = useMemo(() => {
    const bars = r?.data?.bars ?? [];
    const closes = bars.map((b) => b.close);
    const n = RANGES[range];
    const mk = (vals: (number | null)[]) =>
      bars.map((b, i) => ({ time: b.date, value: vals[i] })).slice(-n).filter((p): p is { time: string; value: number } => p.value != null);
    return [
      { label: ticker, color: "#2563eb", data: mk(closes), width: 2 as const },
      { label: "MM50", color: "#f59e0b", data: mk(smaSeries(closes, 50)), width: 1 as const },
      { label: "MM125", color: "#a855f7", data: mk(smaSeries(closes, 125)), width: 1 as const },
      { label: "MM200", color: "#64748b", data: mk(smaSeries(closes, 200)), width: 1 as const },
    ];
  }, [r, range, ticker]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center md:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 md:max-w-3xl md:rounded-2xl md:p-6 md:shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{ticker}</h2>
            <p className="text-xs text-slate-500">{name}</p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-xl" aria-label="Fermer">×</button>
        </div>

        <div className="mt-2 flex gap-1">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
            <button key={k} onClick={() => setRange(k)}
              className={`rounded-full px-3 py-1 text-xs ${k === range ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800"}`}>{k}</button>
          ))}
        </div>
        <div className="mt-2"><PriceChart lines={lines} height={typeof window !== "undefined" && window.innerWidth >= 768 ? 320 : 220} /></div>
        {r && (
          <p className="mt-1 text-[10px] text-slate-500">
            {r.source} · collecté le {fmtDateTime(r.fetchedAt)} · cours du {r.data?.bars.at(-1)?.date ?? "—"} <StatusBadge status={r.status} />
          </p>
        )}

        {s ? (
          <>
            <div className="mt-4 flex items-center gap-2">
              <DecisionBadge decision={s.decision} />
              <span className="text-sm">Score {s.score}/100<InfoTip k="tipScore" /> · confiance {s.confidence}</span>
            </div>
            {explanation && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-sm dark:bg-blue-950/40">{explanation}</p>}
            {isEtf && (
              <p className="mt-1 text-xs text-slate-500">
                Lecture long terme : <b>{etfReading(s.decision)}</b>. Pour un ETF, « Vendre » signifie surtout « tendance dégradée ».
              </p>
            )}
            <div className="md:grid md:grid-cols-2 md:gap-6"><div>
            <h3 className="mt-4 text-sm font-semibold">Raisons</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{s.reasons.map((x) => <li key={x}>{x}</li>)}</ul>

            </div><div>
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
            </div></div>
            <p className="mt-3 text-[10px] text-slate-500">Score calculé sur la clôture du {s.asOf}.</p>
          </>
        ) : <p className="mt-4 text-sm">Pas de score (historique insuffisant).</p>}

        <h3 className="mt-4 text-sm font-semibold">Actualités liées</h3>
        {sentiment && (
          <p className="text-xs">Sentiment : <b className={sentiment.value >= 0 ? "text-green-600" : "text-red-600"}>{sentiment.value >= 0 ? "+" : ""}{sentiment.value.toFixed(1)}</b> — {sentiment.reason}</p>
        )}
        {news.length ? (
          <ul className="mt-1 space-y-1 text-sm">
            {news.map((n) => (
              <li key={n.url}><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{n.title}</a> <span className="text-[10px] text-slate-500">· {n.source}{n.publishedAt ? ` · ${fmtDateTime(n.publishedAt)}` : ""}</span></li>
            ))}
          </ul>
        ) : <p className="text-xs text-slate-500">Aucune actualité récente pour cette valeur.</p>}
      </div>
    </div>
  );
}
