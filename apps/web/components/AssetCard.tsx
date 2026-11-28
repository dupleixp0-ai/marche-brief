"use client";
import { dailyChangePct, etfReading, type PriceSeries, type ScoreResult, type SourceResult } from "@marche-brief/core";
import { DecisionBadge, StatusDot } from "./Badges";
import { Sparkline } from "./Sparkline";
import { Abbr } from "./Abbr";
import { fmtLate, fmtPct } from "../lib/format";
import { useCurrency } from "../lib/currency";

export function AssetCard({ ticker, name, sub, r, s, isEtf, onOpen }: {
  ticker: string; name?: string; sub?: string; r?: SourceResult<PriceSeries>; s?: ScoreResult & { asOf: string }; isEtf: boolean; onOpen: () => void;
}) {
  const cur = useCurrency();
  const conv = cur.bars(r?.data?.bars ?? [], r?.data?.currency);
  const bars = conv.bars;
  const last = bars.at(-1);
  const ch = dailyChangePct(bars);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md active:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:active:bg-slate-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <span className={`font-semibold leading-tight ${isEtf ? "line-clamp-2" : "truncate"}`}>{isEtf && name ? <Abbr text={name} /> : ticker}</span>
          {r && <StatusDot status={r.status} />}
        </div>
        <p className="truncate text-xs text-slate-500">{isEtf ? `${ticker}${sub ? ` · ${sub}` : ""}` : name ?? ""}</p>
        <p className="text-[10px] text-slate-400">Cours du {last?.date ?? "—"}{r?.data?.late ? ` · ${fmtLate(r.data.late)}` : ""}</p>
      </div>
      <div className="hidden shrink-0 sm:block"><Sparkline values={bars.slice(-63).map((b) => b.close)} width={72} /></div>
      <div className="w-28 text-right">
        <p className="font-medium tabular-nums">{last ? cur.money(last.close, conv.currency) : "—"}</p>
        <p className={`text-xs tabular-nums ${ch == null ? "" : ch >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPct(ch)}</p>
        <div className="mt-1">{s ? <DecisionBadge decision={s.decision} score={s.score} /> : <span className="text-xs">—</span>}</div>
        {isEtf && s && <p className="mt-0.5 text-[10px] text-slate-500">{etfReading(s.decision)}</p>}
      </div>
    </button>
  );
}
