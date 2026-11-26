"use client";
import { useEffect, useRef } from "react";
import { createChart, LineSeries, AreaSeries, ColorType, type IChartApi, type Time } from "lightweight-charts";

export interface Line {
  label: string;
  color: string;
  /** time : "AAAA-MM-JJ" (journalier) ou secondes UTC (intraday). */
  data: { time: string | number; value: number }[];
  width?: 1 | 2 | 3;
  area?: boolean;
}

/** Graphique de cours (lightweight-charts) avec une ou plusieurs courbes. */
export function PriceChart({ lines, height = 200, intraday = false, unit }: { lines: Line[]; height?: number; intraday?: boolean; unit?: string }) {
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
      timeScale: {
        borderVisible: false, timeVisible: intraday, secondsVisible: false,
        // Graduations intraday en heure de Berlin/Paris (les horodatages sont en UTC).
        ...(intraday ? {
          tickMarkFormatter: (t: Time, type: number) => typeof t !== "number" ? null
            : new Date(t * 1000).toLocaleString("fr-FR", type <= 2 ? { timeZone: "Europe/Berlin", day: "2-digit", month: "short" } : { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }),
        } : {}),
      },
      localization: {
        locale: "fr-FR",
        priceFormatter: (p: number) => `${p.toLocaleString("fr-FR", { maximumFractionDigits: p >= 1000 ? 0 : 2 })}${unit ? ` ${unit}` : ""}`,
        // Heure affichée en heure de Paris/Berlin pour l'intraday.
        timeFormatter: (t: Time) => typeof t === "number"
          ? new Date(t * 1000).toLocaleString("fr-FR", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          : String(t),
      },
      handleScroll: false,
      handleScale: false,
    });
    for (const l of lines) {
      const opts = { priceLineVisible: false, lastValueVisible: l.width !== 1 };
      const s = l.area
        ? chart.addSeries(AreaSeries, { ...opts, lineColor: l.color, topColor: `${l.color}55`, bottomColor: `${l.color}05`, lineWidth: l.width ?? 2 })
        : chart.addSeries(LineSeries, { ...opts, color: l.color, lineWidth: l.width ?? 2 });
      s.setData(l.data as { time: Time; value: number }[]);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [lines, height, intraday, unit]);
  return (
    <div>
      <div ref={ref} style={{ height }} />
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500">
        {lines.map((l) => <span key={l.label}><span className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: l.color }} />{l.label}</span>)}
      </div>
    </div>
  );
}
