"use client";
import { useEffect, useState } from "react";
import { exchangeStatus, type ExchangeStatus } from "@marche-brief/core";
import { useI18n } from "../lib/i18n";

/** Indique si Europe (Xetra) et New York sont ouverts : cours en direct ou de la veille (jours fériés compris). */
export function MarketClock() {
  const { t } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  if (!now) return null;
  const chip = (label: string, s: ExchangeStatus | null) => (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={s?.holiday ? `Jour férié : ${s.holiday}` : undefined}>
      <span className={`h-1.5 w-1.5 rounded-full ${s?.open ? "bg-green-500" : s?.reason === "holiday" ? "bg-amber-500" : "bg-slate-400"}`} />
      {label} {s?.open ? t("open") : t("closed")}
      {s?.holiday && <span className="text-amber-600">({s.holiday})</span>}
    </span>
  );
  return (
    <span className="flex gap-3 text-[11px] text-slate-500">
      {chip(t("europe"), exchangeStatus("XETRA", now))}
      {chip(t("newYork"), exchangeStatus("NASDAQ/NYSE", now))}
    </span>
  );
}
