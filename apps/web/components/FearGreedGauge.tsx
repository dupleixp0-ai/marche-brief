"use client";
import { PieChart, Pie, Cell } from "recharts";

// Jauge demi-cercle 0–100 : rouge (peur) → vert (avidité).
const ZONES = [
  { v: 25, c: "#dc2626" }, { v: 20, c: "#f97316" }, { v: 10, c: "#a3a3a3" }, { v: 20, c: "#84cc16" }, { v: 25, c: "#16a34a" },
];

export function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const angle = Math.PI * (1 - value / 100);
  const cx = 80, cy = 80, r = 52;
  return (
    <div className="relative mx-auto h-[96px] w-[160px]">
      <PieChart width={160} height={90}>
        <Pie data={ZONES} dataKey="v" startAngle={180} endAngle={0} cx={cx} cy={cy} innerRadius={56} outerRadius={74} stroke="none" isAnimationActive={false}>
          {ZONES.map((z, i) => <Cell key={i} fill={z.c} />)}
        </Pie>
      </PieChart>
      <svg className="absolute left-0 top-0" width={160} height={90} aria-hidden>
        <line x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy - r * Math.sin(angle)} strokeWidth="3" strokeLinecap="round" className="stroke-slate-800 dark:stroke-slate-100" />
        <circle cx={cx} cy={cy} r="4" className="fill-slate-800 dark:fill-slate-100" />
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center text-sm font-bold">{value} · {label}</p>
    </div>
  );
}
