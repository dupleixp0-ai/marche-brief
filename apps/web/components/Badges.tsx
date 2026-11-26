"use client";
import type { Decision, SourceStatus } from "@marche-brief/core";
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
