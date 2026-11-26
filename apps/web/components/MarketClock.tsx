"use client";
import { useEffect, useState } from "react";
import { isExchangeOpen } from "@marche-brief/core";
import { useI18n } from "../lib/i18n";

/** Indique si Europe (Xetra) et New York sont ouverts : cours en direct ou de la veille. */
export function MarketClock() {
  const { t } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  if (!now) return null;
  const chip = (label: string, open: boolean | null) => (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-green-500" : "bg-slate-400"}`} />{label} {open ? t("open") : t("closed")}
    </span>
  );
  return (
    <span className="flex gap-3 text-[11px] text-slate-500">
      {chip(t("europe"), isExchangeOpen("XETRA", now))}
      {chip(t("newYork"), isExchangeOpen("NASDAQ/NYSE", now))}
    </span>
  );
}
