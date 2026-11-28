"use client";
import type { Decision, SourceStatus, TimingMoment } from "@marche-brief/core";
import { useI18n } from "../lib/i18n";

const STATUS: Record<SourceStatus, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-green-600" },
  fallback: { label: "Secours", cls: "bg-amber-500" },
  stale: { label: "Périmé", cls: "bg-orange-600" },
  error: { label: "Erreur", cls: "bg-red-600" },
};
export function StatusDot({ status }: { status: SourceStatus }) {
  const s = STATUS[status];
  return <span title={s.label} className={`inline-block h-2 w-2 rounded-full ${s.cls}`} />;
}
export function StatusBadge({ status }: { status: SourceStatus }) {
  const s = STATUS[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${s.cls}`}>{s.label}</span>;
}

const DEC: Record<Decision, string> = { Acheter: "bg-green-600", Attendre: "bg-slate-500", Vendre: "bg-red-600" };
export function DecisionBadge({ decision, score }: { decision: Decision; score?: number }) {
  const { t } = useI18n();
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white ${DEC[decision]}`}>
      {t(decision)}{score != null ? ` · ${score}` : ""}
    </span>
  );
}

/** Moment d'entrée : affiché seulement quand il dit quelque chose (bon moment, ou hausse très étirée). */
const MOMENT: Record<TimingMoment, { short: string; cls: string } | null> = {
  favorable: { short: "Bon moment", cls: "border-green-600 text-green-700 dark:text-green-400" },
  etire: { short: "Très étiré", cls: "border-amber-500 text-amber-700 dark:text-amber-400" },
  neutre: null,
};
export function TimingBadge({ moment, always }: { moment?: TimingMoment; always?: boolean }) {
  const m = moment ? MOMENT[moment] ?? (always ? { short: "Neutre", cls: "border-slate-400 text-slate-500" } : null) : null;
  if (!m) return null;
  return <span className={`whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold ${m.cls}`}>{m.short}</span>;
}
