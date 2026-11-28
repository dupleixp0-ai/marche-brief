"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Traductions de l'interface (français d'abord). Les textes générés (raisons, brief) restent en français.
export type Lang = "fr" | "en" | "de";
const LANG_KEY = "marche-brief:lang";

const fr = {
  overview: "Vue d'ensemble", portfolio: "Personnel", news: "Actualités", updated: "Mis à jour le", noData: "Aucune donnée", sourcesOk: "sources OK", refresh: "Actualiser",
  market: "Marché", brief: "Brief du jour", upcoming: "Événements à venir", noEvents: "Aucun événement saisi (config/events.json).",
  myEtfs: "Mes ETF", stocks: "Actions suivies", byScore: "Par score", byName: "Par nom",
  discoveries: "Découvertes", reliability: "Fiabilité", pullToRefresh: "Relâcher pour actualiser",
  europe: "Europe", newYork: "New York", open: "ouverte", closed: "fermée",
  Acheter: "Acheter", Attendre: "Attendre", Vendre: "Vendre",
  trackRecord: "Taux de réussite réel", trackNone: "Pas encore assez d'historique : il faut au moins un mois de recommandations archivées.",
  // Infobulles pédagogiques
  tipVix: "VIX : « indice de la peur ». Il mesure la volatilité attendue du S&P 500 sur 30 jours. Sous 15 : marché calme ; au-dessus de 30 : forte nervosité.",
  tipFg: "Fear & Greed (CNN) : de 0 (peur extrême) à 100 (avidité extrême). Une peur extrême coïncide souvent avec des points bas, l'avidité extrême avec des excès.",
  tipMa: "Moyenne mobile (MM) : moyenne des cours de clôture sur N jours. Un cours au-dessus de sa MM200 indique une tendance de fond haussière.",
  tipRsi: "RSI (14) : force des hausses récentes, de 0 à 100. Au-dessus de 70 : surachat (risque de repli) ; sous 30 : survente.",
  tipScore: "Score de 0 à 100 : somme pondérée de 6 facteurs (tendance, momentum, force relative, risque, actualité, contexte). ≥ 65 Acheter, < 40 Vendre (seulement sous la MM200).",
  tipTiming: "Quand entrer : « Bon moment » si le marché a peur (indice ≤ 25) ou si la valeur est survendue (RSI < 30) ; « Très étiré » si le cours dépasse sa MM200 de plus de 50 % (hausse souvent continue, mais risque de forte chute doublé). Mesuré sur 10 ans et 63 valeurs (page Fiabilité).",
  tipBacktest: "Backtest : on rejoue la règle du score sur les années passées et on compare à un simple achat-conservation, frais compris.",
};
type Dict = typeof fr;

const en: Dict = {
  overview: "Overview", portfolio: "My portfolio", news: "News", updated: "Updated", noData: "No data", sourcesOk: "sources OK", refresh: "Refresh",
  market: "Market", brief: "Daily brief", upcoming: "Upcoming events", noEvents: "No events entered (config/events.json).",
  myEtfs: "My ETFs", stocks: "Watched stocks", byScore: "By score", byName: "By name",
  discoveries: "Discoveries", reliability: "Reliability", pullToRefresh: "Release to refresh",
  europe: "Europe", newYork: "New York", open: "open", closed: "closed",
  Acheter: "Buy", Attendre: "Hold", Vendre: "Sell",
  trackRecord: "Actual hit rate", trackNone: "Not enough history yet: at least one month of archived recommendations is needed.",
  tipVix: "VIX: the 'fear index'. Expected 30-day volatility of the S&P 500. Below 15: calm market; above 30: high stress.",
  tipFg: "Fear & Greed (CNN): from 0 (extreme fear) to 100 (extreme greed). Extreme fear often coincides with lows, extreme greed with excesses.",
  tipMa: "Moving average (MA): average closing price over N days. A price above its 200-day MA signals a long-term uptrend.",
  tipRsi: "RSI (14): strength of recent gains, 0 to 100. Above 70: overbought (pullback risk); below 30: oversold.",
  tipScore: "Score 0–100: weighted sum of 6 factors (trend, momentum, relative strength, risk, news, context). ≥ 65 Buy, < 40 Sell (only below the 200-day MA).",
  tipTiming: "When to enter: “Good time” when the market is fearful (index ≤ 25) or the asset is oversold (RSI < 30); “Very stretched” when the price is more than 50 % above its 200-day MA (gains often continue, but the risk of a sharp drop doubles). Measured over 10 years and 63 assets (Reliability page).",
  tipBacktest: "Backtest: the score rule is replayed over past years and compared with plain buy-and-hold, fees included.",
};

const de: Dict = {
  overview: "Übersicht", portfolio: "Mein Depot", news: "Nachrichten", updated: "Aktualisiert am", noData: "Keine Daten", sourcesOk: "Quellen OK", refresh: "Aktualisieren",
  market: "Markt", brief: "Tagesbriefing", upcoming: "Anstehende Termine", noEvents: "Keine Termine erfasst (config/events.json).",
  myEtfs: "Meine ETFs", stocks: "Beobachtete Aktien", byScore: "Nach Score", byName: "Nach Name",
  discoveries: "Entdeckungen", reliability: "Zuverlässigkeit", pullToRefresh: "Loslassen zum Aktualisieren",
  europe: "Europa", newYork: "New York", open: "geöffnet", closed: "geschlossen",
  Acheter: "Kaufen", Attendre: "Halten", Vendre: "Verkaufen",
  trackRecord: "Tatsächliche Trefferquote", trackNone: "Noch zu wenig Historie: mindestens ein Monat archivierter Empfehlungen nötig.",
  tipVix: "VIX: „Angstindex“. Erwartete 30-Tage-Volatilität des S&P 500. Unter 15: ruhiger Markt; über 30: hohe Nervosität.",
  tipFg: "Fear & Greed (CNN): von 0 (extreme Angst) bis 100 (extreme Gier). Extreme Angst fällt oft mit Tiefpunkten zusammen, extreme Gier mit Übertreibungen.",
  tipMa: "Gleitender Durchschnitt (GD): Durchschnitt der Schlusskurse über N Tage. Kurs über dem GD200 = langfristiger Aufwärtstrend.",
  tipRsi: "RSI (14): Stärke der jüngsten Anstiege, 0 bis 100. Über 70: überkauft (Rücksetzerrisiko); unter 30: überverkauft.",
  tipScore: "Score 0–100: gewichtete Summe aus 6 Faktoren (Trend, Momentum, relative Stärke, Risiko, Nachrichten, Umfeld). ≥ 65 Kaufen, < 40 Verkaufen (nur unter GD200).",
  tipTiming: "Einstiegszeitpunkt: „Guter Moment“ bei Angst am Markt (Index ≤ 25) oder überverkauftem Wert (RSI < 30); „Stark gedehnt“, wenn der Kurs mehr als 50 % über dem GD200 liegt (Anstieg hält oft an, aber doppeltes Risiko eines starken Rückgangs). Gemessen über 10 Jahre und 63 Werte (Seite Zuverlässigkeit).",
  tipBacktest: "Backtest: Die Score-Regel wird über vergangene Jahre nachgespielt und mit einfachem Kaufen-und-Halten verglichen, inkl. Gebühren.",
};

const DICTS: Record<Lang, Dict> = { fr, en, de };
export type TKey = keyof Dict;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string }>({
  lang: "fr", setLang: () => {}, t: (k) => fr[k],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");
  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    const l = saved && saved in DICTS ? saved : "fr"; // français par défaut ; autre langue au choix

    setLangState(l);
    document.documentElement.lang = l;
  }, []);
  const setLang = (l: Lang) => { localStorage.setItem(LANG_KEY, l); setLangState(l); document.documentElement.lang = l; };
  return <Ctx.Provider value={{ lang, setLang, t: (k) => DICTS[lang][k] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
