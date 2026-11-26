"use client";
import { dailyChangePct, etfReading, type PriceSeries, type ScoreResult, type SourceResult } from "@marche-brief/core";
import { DecisionBadge, StatusDot } from "./Badges";
import { Sparkline } from "./Sparkline";
import { fmtNum, fmtPct } from "../lib/format";

export function AssetCard({ ticker, name, r, s, isEtf, onOpen }: {
  ticker: string; name?: string; r?: SourceResult<PriceSeries>; s?: ScoreResult & { asOf: string }; isEtf: boolean; onOpen: () => void;
}) {
  const bars = r?.data?.bars ?? [];
  const last = bars.at(-1);
  const ch = dailyChangePct(bars);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md active:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:active:bg-slate-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{ticker}</span>
          {r && <StatusDot status={r.status} />}
        </div>
        <p className="truncate text-xs text-slate-500">{name ?? ""}</p>
        <p className="text-[10px] text-slate-400">Cours du {last?.date ?? "—"}</p>
      </div>
      <Sparkline values={bars.slice(-63).map((b) => b.close)} />
      <div className="w-24 text-right">
        <p className="font-medium tabular-nums">{last ? fmtNum(last.close) : "—"}</p>
        <p className={`text-xs tabular-nums ${ch == null ? "" : ch >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPct(ch)}</p>
        <div className="mt-1">{s ? <DecisionBadge decision={s.decision} score={s.score} /> : <span className="text-xs">—</span>}</div>
        {isEtf && s && <p className="mt-0.5 text-[10px] text-slate-500">{etfReading(s.decision)}</p>}
      </div>
    </button>
  );
}
