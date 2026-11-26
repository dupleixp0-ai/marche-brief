"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { convertBars, convertPoints, DISPLAY_CURRENCIES, type Bar, type DisplayCurrency, type FxRates } from "@marche-brief/core";

const KEY = "marche-brief:devise";
const SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };

interface Ctx {
  currency: DisplayCurrency;
  /** Taux du snapshot (unités par €). */
  rates: FxRates;
  setCurrency: (c: DisplayCurrency) => void;
  /** Convertit une série (null si taux manquant : on garde alors la devise d'origine). */
  bars: (b: Bar[], from?: string) => { bars: Bar[]; currency: string };
  points: (p: { t: number; close: number }[], from?: string) => { points: { t: number; close: number }[]; currency: string };
  money: (x: number | null | undefined, currency?: string, digits?: number) => string;
}

const C = createContext<Ctx | null>(null);

export function CurrencyProvider({ rates, children }: { rates: FxRates; children: ReactNode }) {
  const [currency, set] = useState<DisplayCurrency>("EUR"); // euro par défaut
  useEffect(() => {
    const s = localStorage.getItem(KEY) as DisplayCurrency | null;
    if (s && (DISPLAY_CURRENCIES as readonly string[]).includes(s)) set(s);
  }, []);
  const value = useMemo<Ctx>(() => ({
    currency,
    rates,
    setCurrency: (c) => { localStorage.setItem(KEY, c); set(c); },
    bars: (b, from) => {
      const out = convertBars(b, from, currency, rates);
      return out ? { bars: out, currency } : { bars: b, currency: from === "GBp" ? "GBp" : from ?? "USD" };
    },
    points: (p, from) => {
      const out = convertPoints(p, from, currency, rates);
      return out ? { points: out, currency } : { points: p, currency: from ?? "USD" };
    },
    money: (x, cur = currency, digits = 2) => {
      if (x == null) return "—";
      const n = x.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
      return `${n} ${SYMBOL[cur as DisplayCurrency] ?? cur}`;
    },
  }), [currency, rates]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useCurrency(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("CurrencyProvider manquant");
  return c;
}

export const currencySymbol = (c: string) => SYMBOL[c as DisplayCurrency] ?? c;
