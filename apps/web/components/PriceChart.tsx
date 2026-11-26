"use client";
import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType, type IChartApi } from "lightweight-charts";

export interface Line {
  label: string;
  color: string;
  data: { time: string; value: number }[];
  width?: 1 | 2 | 3;
}

/** Graphique de cours (lightweight-charts) avec une ou plusieurs courbes. */
export function PriceChart({ lines, height = 200 }: { lines: Line[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const chart: IChartApi = createChart(ref.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: dark ? "#cbd5e1" : "#334155", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#1e293b" : "#e2e8f0" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    for (const l of lines) {
      const s = chart.addSeries(LineSeries, { color: l.color, lineWidth: l.width ?? 2, priceLineVisible: false, lastValueVisible: l.width !== 1 });
      s.setData(l.data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [lines, height]);
  return (
    <div>
      <div ref={ref} style={{ height }} />
      <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
        {lines.map((l) => <span key={l.label}><span className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: l.color }} />{l.label}</span>)}
      </div>
    </div>
  );
}
