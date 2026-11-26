"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { dailyChangePct, dailyPoint, marketOutlook, type PointBullet, type Tone, marketSummary, ratesFrom, smaSeries, DISPLAY_CURRENCIES, type Discovery, type DisplayCurrency, type IntradaySeries, type Snapshot } from "@marche-brief/core";
import type { DashboardData, WatchItem } from "../lib/types";
import { AssetCard } from "./AssetCard";
import { InfoTip } from "./InfoTip";
import { MarketClock } from "./MarketClock";
import { TrackRecord } from "./TrackRecord";
import { useI18n, type Lang, type TKey } from "../lib/i18n";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { DiscoveriesSection } from "./Discoveries";
import { PortfolioView } from "./Portfolio";
import { DetailSheet, type DetailTarget } from "./DetailSheet";
import { FearGreedGauge } from "./FearGreedGauge";
import { PriceChart } from "./PriceChart";
import { DecisionBadge, StatusBadge, StatusDot } from "./Badges";
import { Abbr } from "./Abbr";
import { MarketSheet, OutlookBlock, BiasBadge, type MarketKind } from "./MarketSheet";
import { CurrencyProvider, useCurrency } from "../lib/currency";
import { GLOSSARY } from "../lib/glossary";
import { fmtDateTime, fmtNum, fmtPct, fmtRatio } from "../lib/format";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
const CODE_KEY = "marche-brief:code";

export const APP_NAME = "MarketPulse";

// ---------- Navigation ----------
const VIEWS = ["overview", "portfolio", "market", "etfs", "stocks", "discoveries", "news", "reliability"] as const;
type View = (typeof VIEWS)[number];
const ICON: Record<View, string> = {
  overview: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  portfolio: "M6 10V7a6 6 0 0112 0v3M5 10h14v11H5zM12 14v3",
  market: "M3 17l6-6 4 4 8-8M14 7h7v7",
  etfs: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 0v10l7 5",
  stocks: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  discoveries: "M12 2l2.9 6.6L22 9.3l-5.4 4.8 1.6 7.1L12 17.6 5.8 21.2l1.6-7.1L2 9.3l7.1-.7z",
  news: "M4 4h13v16H6a2 2 0 01-2-2V4zm13 4h3v10a2 2 0 01-2 2M8 8h5M8 12h5M8 16h3",
  reliability: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4zm-3 10l2 2 4-4",
};
const LABEL_KEY: Record<View, TKey> = {
  overview: "overview", portfolio: "portfolio", market: "market", etfs: "myEtfs", stocks: "stocks", discoveries: "discoveries", news: "news", reliability: "reliability",
};

// Libellés courts de la barre d'onglets du téléphone.
const SHORT: Record<Lang, Record<View, string>> = {
  fr: { overview: "Accueil", portfolio: "Perso", market: "Marché", etfs: "ETF", stocks: "Actions", discoveries: "Découvrir", news: "Actus", reliability: "Fiabilité" },
  en: { overview: "Home", portfolio: "Mine", market: "Market", etfs: "ETFs", stocks: "Stocks", discoveries: "Discover", news: "News", reliability: "Reliability" },
  de: { overview: "Start", portfolio: "Depot", market: "Markt", etfs: "ETFs", stocks: "Aktien", discoveries: "Entdecken", news: "News", reliability: "Qualität" },
};

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

// ---------- Éléments communs ----------
const panel = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function Panel({ title, right, children, className = "", onClick }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <section onClick={onClick} className={`${panel} ${className} ${onClick ? "cursor-pointer transition hover:border-blue-400" : ""}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone, tip, onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "warn"; tip?: TKey; onClick?: () => void }) {
  const toneCls = tone === "up" ? "text-green-600" : tone === "down" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick?.()} className={`${panel} cursor-pointer text-left transition hover:border-blue-400`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}{tip && <InfoTip k={tip} />}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Skeleton({ h = 64 }: { h?: number }) {
  return <div className="animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" style={{ height: h }} />;
}

const TONE_DOT: Record<Tone, string> = { up: "bg-green-500", down: "bg-red-500", warn: "bg-amber-500", neutral: "bg-slate-400" };

/** « Le point du jour » (chiffres) + résumé des actualités par Claude (si disponible) + liens des sources. */
function BriefList({ snap, point, max, full = false }: { snap: Snapshot | null; point: PointBullet[]; max?: number; full?: boolean }) {
  const brief = snap?.brief;
  const news = snap?.news?.data ?? [];
  return (
    <div className="space-y-4">
      <div>
        {full && <h3 className="mb-2 text-sm font-semibold">Le point du jour</h3>}
        <ul className="space-y-2.5 text-sm">
          {point.slice(0, max).map((b) => (
            <li key={b.topic} className="flex gap-2.5">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[b.tone]}`} />
              <span className="min-w-0 flex-1 break-words"><b className="font-semibold">{b.topic} · </b>{b.text}</span>
            </li>
          ))}
        </ul>
        {snap && <p className="mt-2 text-[10px] text-slate-500">Calculé à partir des cours et indicateurs du {fmtDateTime(snap.generatedAt)} (sans IA).</p>}
      </div>

      {full && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Les actualités résumées</h3>
          {brief?.data?.bullets.length ? (
            <>
              <ul className="space-y-3 text-sm">
                {brief.data.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                    <span className="min-w-0 flex-1 break-words">{b.text}
                      {b.links.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {b.links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noopener noreferrer" title={l.title} className="block max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-blue-600 hover:underline dark:bg-slate-800">{l.title}</a>)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-500">Résumé rédigé par Claude ({brief.data.model}) à partir des sources ci-dessus · {fmtDateTime(brief.fetchedAt)} <StatusBadge status={brief.status} /></p>
            </>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Le résumé des actualités par Claude s'activera dès que les clés <b>ANTHROPIC_API_KEY</b> (rédaction) et <b>FINNHUB_API_KEY</b> (actualités des marchés et des sociétés) seront ajoutées dans GitHub Secrets.
              {brief?.error && <span className="mt-1 block text-[10px] opacity-80">État : {brief.error}</span>}
            </p>
          )}
        </div>
      )}

      {full && news.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-blue-600">Sources : {news.length} dernières actualités ({snap?.news?.source})</summary>
          <ul className="mt-2 space-y-1.5 break-words text-sm">
            {news.slice(0, 30).map((n) => (
              <li key={n.url}><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{n.title}</a> <span className="text-[10px] text-slate-500">· {n.source}{n.publishedAt ? ` · ${fmtDateTime(n.publishedAt)}` : ""}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---------- Tableau compact (vue d'ensemble) ----------
function MiniTable({ items, snap, isEtf, onOpen }: { items: WatchItem[]; snap: Snapshot; isEtf: boolean; onOpen: (i: WatchItem) => void }) {
  const cur = useCurrency();
  return (
    <table className="w-full text-sm">
      <tbody>
        {items.map((it) => {
          const r = snap.prices[it.ticker];
          const c = cur.bars(r?.data?.bars ?? [], r?.data?.currency);
          const ch = dailyChangePct(c.bars);
          const s = snap.scores[it.ticker];
          return (
            <tr key={it.ticker} onClick={() => onOpen(it)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
              <td className="py-2 pr-2">
                <p className="font-medium leading-tight">{isEtf ? <Abbr text={it.name ?? it.ticker} /> : it.ticker}</p>
                <p className="text-[10px] text-slate-500">{isEtf ? it.ticker : it.sector}</p>
              </td>
              <td className="whitespace-nowrap py-2 text-right tabular-nums">{cur.money(c.bars.at(-1)?.close, c.currency)}</td>
              <td className={`whitespace-nowrap py-2 pl-2 text-right text-xs tabular-nums ${ch == null ? "" : ch >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPct(ch)}</td>
              <td className="py-2 pl-2 text-right">{s ? <DecisionBadge decision={s.decision} score={s.score} /> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- Tableau de bord ----------
export function Dashboard({ data }: { data: DashboardData }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const rates = useMemo(() => ratesFrom(snap?.fx), [snap]);
  return (
    <CurrencyProvider rates={rates}>
      <Inner data={data} snap={snap} setSnap={setSnap} />
    </CurrencyProvider>
  );
}

function Inner({ data, snap, setSnap }: { data: DashboardData; snap: Snapshot | null; setSnap: (s: Snapshot) => void }) {
  const { t, lang, setLang } = useI18n();
  const cur = useCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<View>("overview");
  const [open, setOpen] = useState<DetailTarget | null>(null);
  const [marketOpen, setMarketOpen] = useState<MarketKind | null>(null);
  const [sort, setSort] = useState<"score" | "nom">("score");
  const bt = data.backtest;

  // Vue courante dans l'URL (#market…) : bouton retour et favoris fonctionnent.
  useEffect(() => {
    const read = () => { const h = location.hash.slice(1) as View; setViewState(VIEWS.includes(h) ? h : "overview"); setOpen(null); setMarketOpen(null); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const setView = (v: View) => { location.hash = v; setViewState(v); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    fetch(`${BASE}/data/snapshot.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSnap)
      .catch((e) => setError(`Données indisponibles (${e instanceof Error ? e.message : e}).`))
      .finally(() => setLoading(false));
  }, [setSnap]);

  const accessCode = () => {
    let code = localStorage.getItem(CODE_KEY);
    if (!code) {
      code = window.prompt("Code d'accès personnel (mémorisé sur cet appareil) :")?.trim() || null;
      if (!code) throw new Error("code d'accès requis");
      localStorage.setItem(CODE_KEY, code);
    }
    return code;
  };

  // Actualiser : Worker (collecte à la demande) s'il est configuré, sinon relecture du snapshot publié.
  async function refresh() {
    setLoading(true); setError(null);
    try {
      if (WORKER) {
        const res = await fetch(`${WORKER}/refresh`, { method: "POST", headers: { "X-Access-Code": accessCode() } });
        if (res.status === 401) localStorage.removeItem(CODE_KEY);
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
        setSnap(await res.json());
      } else {
        const res = await fetch(`${BASE}/data/snapshot.json?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSnap(await res.json());
      }
    } catch (e) {
      setError(`Échec de l'actualisation (${e instanceof Error ? e.message : e}). Ancien contenu conservé.`);
    } finally {
      setLoading(false);
    }
  }
  const pull = usePullToRefresh(() => { if (!loading) refresh(); });

  const loadIntraday = useCallback(async (symbol: string): Promise<IntradaySeries> => {
    const res = await fetch(`${WORKER}/intraday?symbol=${encodeURIComponent(symbol)}`, { headers: { "X-Access-Code": accessCode() } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = (await res.json()) as { data: IntradaySeries | null };
    if (!r.data) throw new Error("vide");
    return r.data;
  }, []);

  const market = useMemo(() => {
    if (!snap) return null;
    const vixBars = snap.market.vix.data?.bars ?? [], spxBars = snap.market.spx.data?.bars ?? [];
    const vixC = vixBars.map((b) => b.close), spxC = spxBars.map((b) => b.close);
    const pts = (bars: typeof vixBars, vals: (number | null)[], n: number) =>
      bars.map((b, i) => ({ time: b.date, value: vals[i] })).slice(-n).filter((p): p is { time: string; value: number } => p.value != null);
    return {
      outlook: marketOutlook({ spxCloses: spxC, vixCloses: vixC, fearGreed: snap.market.fearGreed.data?.value ?? null }),
      summary: marketSummary({ vixCloses: vixC, spxCloses: spxC, fearGreed: snap.market.fearGreed.data?.value ?? null }),
      spxDay: dailyChangePct(spxBars),
      vixLines: [
        { label: "VIX", color: "#dc2626", data: pts(vixBars, vixC, 252), area: true },
        { label: "MM50", color: "#64748b", data: pts(vixBars, smaSeries(vixC, 50), 252), width: 1 as const },
      ],
      spxLines: [
        { label: "S&P 500 (points)", color: "#2563eb", data: pts(spxBars, spxC, 252), area: true },
        { label: "MM125", color: "#64748b", data: pts(spxBars, smaSeries(spxC, 125), 252), width: 1 as const },
      ],
    };
  }, [snap]);

  const stocks = useMemo(() => {
    const list = [...data.watchlist.stocks];
    return sort === "score"
      ? list.sort((a, b) => (snap?.scores?.[b.ticker]?.score ?? -1) - (snap?.scores?.[a.ticker]?.score ?? -1))
      : list.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [data.watchlist.stocks, snap, sort]);

  const sources = snap ? [snap.market.vix, snap.market.spx, snap.market.fearGreed, ...(snap.news ? [snap.news] : []), ...(snap.brief ? [snap.brief] : []), ...Object.values(snap.fx ?? {}), ...Object.values(snap.prices)] : [];
  const okCount = sources.filter((s) => s.status === "ok").length;
  const fg = snap?.market.fearGreed;
  // « Le point du jour » : phrases calculées à partir des chiffres (règles dans packages/core).
  const point = useMemo<PointBullet[]>(() => {
    if (!snap || !market) return [];
    const top = (l?: Discovery[]) => l?.length ? [...l].sort((a, b) => b.score - a.score)[0] : undefined;
    const ds = top(snap.discoveries?.data?.stocks), de = top(snap.discoveries?.data?.etfs);
    return dailyPoint({
      spx: snap.market.spx.data?.bars ?? [], vix: snap.market.vix.data?.bars ?? [], fearGreed: snap.market.fearGreed.data,
      outlook: market.outlook, marketNote: null, // déjà affichée dans l'en-tête
      etfs: data.watchlist.etfs.map((e) => ({ ticker: e.ticker, name: e.name ?? e.ticker, bars: snap.prices[e.ticker]?.data?.bars ?? [], decision: snap.scores[e.ticker]?.decision })),
      stocks: data.watchlist.stocks.map((x) => ({ ticker: x.ticker, bars: snap.prices[x.ticker]?.data?.bars ?? [], decision: snap.scores[x.ticker]?.decision })),
      discoveries: { stock: ds && { name: ds.name, country: ds.country, score: ds.score }, etf: de && { name: de.name, score: de.score } },
    });
  }, [snap, market, data.watchlist]);

  const signals = useMemo(() => {
    const c = { Acheter: 0, Attendre: 0, Vendre: 0 };
    for (const s of Object.values(snap?.scores ?? {})) c[s.decision]++;
    return c;
  }, [snap]);

  // ---------- Ouverture des fiches ----------
  const openWatch = (item: WatchItem, isEtf: boolean) => {
    if (!snap) return;
    const r = snap.prices[item.ticker];
    setOpen({
      ticker: item.ticker, name: isEtf ? item.name ?? item.ticker : `${item.ticker}`, subtitle: isEtf ? item.exchange : item.sector, isEtf,
      bars: r?.data?.bars ?? [], currency: r?.data?.currency, meta: r ? { source: r.source, fetchedAt: r.fetchedAt, status: r.status } : undefined,
      score: snap.scores[item.ticker], intraday: snap.intraday?.[item.ticker]?.data ?? null, info: isEtf ? item : undefined,
      explanation: snap.brief?.data?.explanations[item.ticker], sentiment: snap.brief?.data?.sentiments[item.ticker],
      news: (snap.news?.data ?? []).filter((n) => n.symbols.includes(item.ticker)).slice(0, 5),
    });
  };
  // Ouvre la fiche d'une valeur à partir de son symbole (onglet Personnel).
  const openTicker = (ticker: string) => {
    const e = data.watchlist.etfs.find((x) => x.ticker === ticker);
    if (e) return openWatch(e, true);
    const st = data.watchlist.stocks.find((x) => x.ticker === ticker);
    if (st) return openWatch(st, false);
    const d = [...(snap?.discoveries?.data?.stocks ?? []), ...(snap?.discoveries?.data?.etfs ?? [])].find((x) => x.ticker === ticker);
    if (d) openDiscovery(d);
  };
  const openDiscovery = (d: Discovery) => {
    setOpen({
      ticker: d.ticker, name: d.name, subtitle: `${d.country} · ${d.exchange} · ${d.sector} · cotation ${d.currency}`, isEtf: d.type === "etf",
      bars: d.history?.length ? d.history : [], currency: d.currency,
      meta: snap?.discoveries ? { source: snap.discoveries.source, fetchedAt: snap.discoveries.fetchedAt, status: snap.discoveries.status } : undefined,
      score: { score: d.score, decision: d.decision, factors: d.factors, asOf: d.lastDate },
      intraday: snap?.intraday?.[d.ticker]?.data ?? null,
      extra: (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-green-50 p-3 dark:bg-green-950/30">
            <h3 className="text-sm font-semibold text-green-700 dark:text-green-500">Pourquoi cette valeur est prometteuse</h3>
            <ul className="mt-1 list-disc pl-4 text-sm">{d.why.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-500">Risques à connaître</h3>
            <ul className="mt-1 list-disc pl-4 text-sm">{d.risks.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <Abbr text={d.name} legend />
        </div>
      ),
    });
  };

  // ---------- Vues ----------
  const marketPanel = (big: boolean) => market && snap && (
    <div className={big ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
      <Panel className={big ? "lg:col-span-2" : ""} title="Impression générale" right={<span className="text-[10px] text-slate-500">règles simples, pas une prédiction</span>}>
        <OutlookBlock o={market.outlook} />
      </Panel>
      <Panel onClick={() => setMarketOpen("fg")} title={<>Fear &amp; Greed<InfoTip k="tipFg" /></>} right={<span className="text-[10px] text-blue-600">Détails →</span>}>
        {fg?.data ? <FearGreedGauge value={fg.data.value} label={fg.data.label} /> : <p className="text-sm">Indisponible</p>}
        {fg && <p className="text-center text-[10px] text-slate-500">{fg.source}{fg.data?.homemade ? " (indice maison)" : ""} · {fmtDateTime(fg.fetchedAt)} <StatusBadge status={fg.status} /></p>}
        <p className="mt-3 text-sm">{market.summary.sentence}</p>
      </Panel>
      <Panel onClick={() => setMarketOpen("vix")} title={<>VIX — volatilité<InfoTip k="tipVix" /></>} right={<span className="text-[10px] text-slate-500">du {snap.market.vix.data?.bars.at(-1)?.date} <StatusDot status={snap.market.vix.status} /> · <span className="text-[10px] text-blue-600">Détails →</span></span>}>
        <p className="text-xs">Dernier <b>{market.summary.vix != null ? fmtNum(market.summary.vix) : "—"}</b> · MM50 {market.summary.vixMa50 != null ? fmtNum(market.summary.vixMa50) : "—"}</p>
        <PriceChart lines={market.vixLines} height={big ? 220 : 140} />
      </Panel>
      <Panel onClick={() => setMarketOpen("spx")} className={big ? "lg:col-span-2" : ""} title={<>S&amp;P 500<InfoTip k="tipMa" /></>} right={<span className="text-[10px] text-slate-500">du {snap.market.spx.data?.bars.at(-1)?.date} <StatusDot status={snap.market.spx.status} /> · <span className="text-[10px] text-blue-600">Détails →</span></span>}>
        <p className="text-xs">Dernier <b>{market.summary.spx != null ? fmtNum(market.summary.spx, 0) : "—"}</b> pts · MM125 {market.summary.spxMa125 != null ? fmtNum(market.summary.spxMa125, 0) : "—"} · indice en points (pas une devise)</p>
        <PriceChart lines={market.spxLines} height={big ? 280 : 140} />
      </Panel>
    </div>
  );

  const topDisc = [...(snap?.discoveries?.data?.stocks ?? []).slice(0, 3), ...(snap?.discoveries?.data?.etfs ?? []).slice(0, 2)];

  const views: Record<View, ReactNode> = {
    overview: snap && market && (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Fear & Greed" tip="tipFg" value={fg?.data ? fg.data.value : "—"} sub={fg?.data?.label} tone={fg?.data ? (fg.data.value < 25 ? "down" : fg.data.value > 75 ? "warn" : undefined) : undefined} onClick={() => setMarketOpen("fg")} />
          <Kpi label="VIX" tip="tipVix" value={market.summary.vix != null ? fmtNum(market.summary.vix, 1) : "—"} sub={`MM50 ${market.summary.vixMa50 != null ? fmtNum(market.summary.vixMa50, 1) : "—"}`} tone={(market.summary.vix ?? 0) > 30 ? "down" : (market.summary.vix ?? 99) < 15 ? "up" : undefined} onClick={() => setMarketOpen("vix")} />
          <Kpi label="S&P 500" value={market.summary.spx != null ? fmtNum(market.summary.spx, 0) : "—"} sub={<span className={(market.spxDay ?? 0) >= 0 ? "text-green-600" : "text-red-600"}>{fmtPct(market.spxDay)} · {market.summary.spx != null && market.summary.spxMa125 != null ? (market.summary.spx > market.summary.spxMa125 ? "au-dessus de la MM125" : "sous la MM125") : ""}</span>} onClick={() => setMarketOpen("spx")} />
          <Kpi label="Signaux du jour" value={<span><span className="text-green-600">{signals.Acheter}</span> · <span className="text-slate-500">{signals.Attendre}</span> · <span className="text-red-600">{signals.Vendre}</span></span>} sub="Acheter · Attendre · Vendre" onClick={() => setView("stocks")} />
        </div>
        <div className={`${panel} cursor-pointer text-sm transition hover:border-blue-400`} onClick={() => setView("market")}>
          <div className="mb-1.5 flex items-center gap-2"><span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Impression générale</span><BiasBadge bias={market.outlook.bias} /><span className="ml-auto text-[10px] text-blue-600">Détails →</span></div>
          {market.summary.sentence}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={t("myEtfs")} right={<button onClick={() => setView("etfs")} className="text-xs text-blue-600">Tout voir →</button>}>
            <MiniTable items={data.watchlist.etfs} snap={snap} isEtf onOpen={(i) => openWatch(i, true)} />
          </Panel>
          <Panel title={t("brief")} right={<button onClick={() => setView("news")} className="text-xs text-blue-600">Tout lire →</button>}>
            <BriefList snap={snap} point={point} max={4} />
          </Panel>
          <Panel title={`${t("stocks")} — top score`} right={<button onClick={() => setView("stocks")} className="text-xs text-blue-600">Tout voir →</button>}>
            <MiniTable items={stocks.slice(0, 5)} snap={snap} isEtf={false} onOpen={(i) => openWatch(i, false)} />
          </Panel>
          <Panel title={t("discoveries")} right={<button onClick={() => setView("discoveries")} className="text-xs text-blue-600">Tout voir →</button>}>
            {topDisc.length ? (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {topDisc.map((d) => (
                  <li key={d.ticker} onClick={() => openDiscovery(d)} className="flex cursor-pointer items-center justify-between gap-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="min-w-0"><span className="block truncate font-medium"><Abbr text={d.name} /></span><span className="text-[10px] text-slate-500">{d.ticker} · {d.country} · {d.type === "etf" ? "ETF" : "Action"}</span></span>
                    <DecisionBadge decision={d.decision} score={d.score} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Pas encore de découvertes.</p>}
          </Panel>
        </div>
      </div>
    ),
    portfolio: <PortfolioView snap={snap} watchlist={data.watchlist} onOpen={openTicker} />,
    market: marketPanel(true),
    etfs: snap && (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.watchlist.etfs.map((e) => (
            <AssetCard key={e.ticker} ticker={e.ticker} name={e.name} sub={e.issuer} isEtf r={snap.prices[e.ticker]} s={snap.scores[e.ticker]} onOpen={() => openWatch(e, true)} />
          ))}
        </div>
        <Panel title="Lexique des noms d'ETF">
          <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
            {["ETF", "ETC", "UCITS", "MSCI", "Core", "EM", "IMI", "Nasdaq", "REIT", "USD", "Acc"].map((k) => (
              <div key={k} className="contents"><dt className="font-semibold">{k}</dt><dd className="text-slate-600 dark:text-slate-300">{GLOSSARY[k]}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] text-slate-500">« USD (Acc) » : fonds géré en dollars et capitalisant. Tu l'achètes en euros sur Xetra : le cours affiché est en € (risque de change inclus dans le prix).</p>
        </Panel>
      </div>
    ),
    stocks: snap && (
      <div>
        <div className="mb-3 flex justify-end gap-1 text-xs">
          {(["score", "nom"] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)}
              className={`rounded-full px-3 py-1 ${sort === k ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white dark:bg-slate-800"}`}>
              {k === "score" ? t("byScore") : t("byName")}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stocks.map((s) => <AssetCard key={s.ticker} ticker={s.ticker} name={s.sector} isEtf={false} r={snap.prices[s.ticker]} s={snap.scores[s.ticker]} onOpen={() => openWatch(s, false)} />)}
        </div>
      </div>
    ),
    discoveries: <DiscoveriesSection res={snap?.discoveries} onOpen={openDiscovery} />,
    news: (
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t("brief")} className="lg:col-span-2">
          <BriefList snap={snap} point={point} full />
          {snap?.news && <p className="mt-1 text-[10px] text-slate-500">Actualités : {snap.news.source} · {fmtDateTime(snap.news.fetchedAt)} <StatusBadge status={snap.news.status} /></p>}
        </Panel>
        <Panel title={t("upcoming")}>
          {data.events.length ? (
            <ul className="space-y-1 text-sm">{data.events.map((e) => <li key={e.date + e.title}><span className="text-slate-500">{e.date}</span> · {e.title}</li>)}</ul>
          ) : <p className="text-xs text-slate-500">{t("noEvents")}</p>}
        </Panel>
      </div>
    ),
    reliability: (
      <div className="space-y-4">
        <Panel title={<>Backtest<InfoTip k="tipBacktest" /></>}>
          {bt ? (
            <div className="text-sm">
              <p className="font-medium">{bt.verdict}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[["Meilleur rendement", bt.beatsCagr], ["Meilleur Sharpe", bt.beatsSharpe], ["Baisse limitée", bt.beatsDrawdown]].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-2xl font-bold">{v}/{bt.assets}</p>
                    <p className="text-[11px] text-slate-500">{l}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs">Écart de rendement annuel moyen vs achat-conservation : <b>{fmtRatio(bt.avgCagrDiff)}</b></p>
              <table className="mt-3 w-full text-xs tabular-nums">
                <thead className="text-slate-500"><tr><th className="text-left">Valeur</th><th className="text-right">Score/an</th><th className="text-right">Conserver/an</th><th className="text-right">Pire baisse</th></tr></thead>
                <tbody>
                  {bt.results.map((r) => (
                    <tr key={r.symbol} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1">{r.symbol}</td>
                      <td className={`text-right ${r.strategy.cagr > r.buyHold.cagr ? "text-green-600" : ""}`}>{fmtRatio(r.strategy.cagr)}</td>
                      <td className="text-right">{fmtRatio(r.buyHold.cagr)}</td>
                      <td className="text-right">{fmtRatio(r.strategy.maxDrawdown)} / {fmtRatio(r.buyHold.maxDrawdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-500">
                Période {bt.results[0]?.from} → {bt.results[0]?.to} · frais 0,1 % · actualité exclue · vente seulement sous la MM200 · calculé le {fmtDateTime(bt.generatedAt)}
              </p>
            </div>
          ) : <p className="text-sm">Pas de backtest.</p>}
        </Panel>
        <Panel title={t("trackRecord")}><TrackRecord /></Panel>
      </div>
    ),
  };

  const navBtn = (v: View, compact: boolean) => (
    <button key={v} onClick={() => setView(v)} aria-current={view === v ? "page" : undefined}
      className={compact
        ? `flex min-w-[2.9rem] flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] ${view === v ? "text-blue-600" : "text-slate-500"}`
        : `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${view === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
      <Icon d={ICON[v]} className={compact ? "h-5 w-5" : "h-5 w-5 shrink-0"} />
      <span className={compact ? "truncate" : ""}>{compact ? SHORT[lang][v] : t(LABEL_KEY[v])}</span>
    </button>
  );

  return (
    <div className="lg:pl-64">
      {/* Menu latéral (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white p-4 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Icon d={ICON.market} /></span>
          <span className="text-lg font-bold">{APP_NAME}</span>
        </div>
        <nav className="space-y-1">{VIEWS.map((v) => navBtn(v, false))}</nav>
      </aside>

      {/* Bandeau d'état */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] lg:pt-3 backdrop-blur lg:px-8 dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight lg:text-2xl">{t(LABEL_KEY[view])}</h1>
            <p className="text-[11px] text-slate-500">
              {snap ? `${t("updated")} ${fmtDateTime(snap.generatedAt)}` : t("noData")} · {t("sourcesOk")} {okCount}/{sources.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-2 hidden rounded-full border border-slate-200 px-3 py-1.5 lg:block dark:border-slate-700"><MarketClock /></div>
            <select aria-label="Devise" value={cur.currency} onChange={(e) => cur.setCurrency(e.target.value as DisplayCurrency)}
              className="rounded-full border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
              {DISPLAY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Langue" value={lang} onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-full border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="fr">FR</option><option value="en">EN</option><option value="de">DE</option>
            </select>
            <button onClick={refresh} disabled={loading}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {loading ? "…" : t("refresh")}
            </button>
          </div>
        </div>
        <div className="mt-1 lg:hidden"><MarketClock /></div>
        {snap?.marketNote && <p className="mt-1 text-xs text-amber-600">{snap.marketNote}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </header>

      <main className="mx-auto min-w-0 max-w-7xl overflow-x-hidden px-4 pb-24 pt-4 lg:px-8 lg:pb-8">
        {pull > 0 && (
          <div className="flex justify-center py-2 text-xs text-slate-500" style={{ height: pull / 2 }}>{pull >= 80 ? t("pullToRefresh") : "↓"}</div>
        )}
        {loading && !snap ? <div className="grid gap-3 lg:grid-cols-2"><Skeleton h={120} /><Skeleton h={120} /><Skeleton h={260} /><Skeleton h={260} /></div> : views[view]}
      </main>

      {/* Barre d'onglets (téléphone) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {VIEWS.map((v) => navBtn(v, true))}
      </nav>

      {marketOpen && snap && market && <MarketSheet kind={marketOpen} snap={snap} outlook={market.outlook} onClose={() => setMarketOpen(null)} loadIntraday={WORKER ? loadIntraday : undefined} />}
      {open && <DetailSheet target={open} onClose={() => setOpen(null)} loadIntraday={WORKER ? loadIntraday : undefined} />}
    </div>
  );
}
