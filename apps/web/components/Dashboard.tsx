"use client";
import { useEffect, useMemo, useState } from "react";
import { marketSummary, smaSeries, type Snapshot } from "@marche-brief/core";
import type { DashboardData, WatchItem } from "../lib/types";
import { AssetCard } from "./AssetCard";
import { InfoTip } from "./InfoTip";
import { MarketClock } from "./MarketClock";
import { TrackRecord } from "./TrackRecord";
import { useI18n, type Lang } from "../lib/i18n";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { DiscoveriesSection } from "./Discoveries";
import { DetailSheet } from "./DetailSheet";
import { FearGreedGauge } from "./FearGreedGauge";
import { PriceChart } from "./PriceChart";
import { StatusBadge, StatusDot } from "./Badges";
import { fmtDateTime, fmtNum, fmtRatio } from "../lib/format";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
const CODE_KEY = "marche-brief:code";

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold lg:text-lg">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function BriefCard({ snap }: { snap: Snapshot | null }) {
  const brief = snap?.brief;
  const news = snap?.news?.data ?? [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {brief?.data ? (
        <>
          <ul className="space-y-2">
            {brief.data.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                <span>
                  {b.text}{" "}
                  {b.links.map((l, j) => (
                    <a key={j} href={l.url} target="_blank" rel="noopener noreferrer" title={l.title}
                      className="ml-0.5 text-xs text-blue-600 hover:underline">[{j + 1}]</a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">Résumé par Claude ({brief.data.model}) · {fmtDateTime(brief.fetchedAt)} <StatusBadge status={brief.status} /></p>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Résumé indisponible{brief?.error ? ` (${brief.error})` : ""}. Dernières actualités :
          </p>
          <ul className="mt-2 space-y-1">
            {news.slice(0, 6).map((n) => (
              <li key={n.url}><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{n.title}</a> <span className="text-[10px] text-slate-500">· {n.source}{n.publishedAt ? ` · ${fmtDateTime(n.publishedAt)}` : ""}</span></li>
            ))}
          </ul>
        </>
      )}
      {snap?.news && <p className="mt-1 text-[10px] text-slate-500">Actualités : {snap.news.source} · {fmtDateTime(snap.news.fetchedAt)} <StatusBadge status={snap.news.status} /></p>}
    </div>
  );
}

function Skeleton({ h = 64 }: { h?: number }) {
  return <div className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" style={{ height: h }} />;
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { t, lang, setLang } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Chargement du dernier snapshot publié (fichier séparé : page légère, mis en cache hors ligne).
  useEffect(() => {
    fetch(`${BASE}/data/snapshot.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSnap)
      .catch((e) => setError(`Données indisponibles (${e instanceof Error ? e.message : e}).`))
      .finally(() => setLoading(false));
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ item: WatchItem; isEtf: boolean } | null>(null);
  const [sort, setSort] = useState<"score" | "nom">("score");
  const bt = data.backtest;

  // Actualiser : appelle le Worker (collecte à la demande) s'il est configuré,
  // sinon relit le dernier snapshot publié. En cas d'erreur, l'ancien contenu reste affiché.
  async function refresh() {
    setLoading(true); setError(null);
    try {
      if (WORKER) {
        let code = localStorage.getItem(CODE_KEY);
        if (!code) {
          code = window.prompt("Code d'accès personnel (mémorisé sur cet appareil) :")?.trim() || null;
          if (!code) throw new Error("code d'accès requis");
          localStorage.setItem(CODE_KEY, code);
        }
        const res = await fetch(`${WORKER}/refresh`, { method: "POST", headers: { "X-Access-Code": code } });
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

  const market = useMemo(() => {
    if (!snap) return null;
    const vixBars = snap.market.vix.data?.bars ?? [], spxBars = snap.market.spx.data?.bars ?? [];
    const vixC = vixBars.map((b) => b.close), spxC = spxBars.map((b) => b.close);
    const pts = (bars: typeof vixBars, vals: (number | null)[], n: number) =>
      bars.map((b, i) => ({ time: b.date, value: vals[i] })).slice(-n).filter((p): p is { time: string; value: number } => p.value != null);
    return {
      summary: marketSummary({ vixCloses: vixC, spxCloses: spxC, fearGreed: snap.market.fearGreed.data?.value ?? null }),
      vixLines: [
        { label: "VIX", color: "#dc2626", data: pts(vixBars, vixC, 252) },
        { label: "MM50", color: "#64748b", data: pts(vixBars, smaSeries(vixC, 50), 252), width: 1 as const },
      ],
      spxLines: [
        { label: "S&P 500", color: "#2563eb", data: pts(spxBars, spxC, 252) },
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

  const sources = snap ? [snap.market.vix, snap.market.spx, snap.market.fearGreed, ...(snap.news ? [snap.news] : []), ...(snap.brief ? [snap.brief] : []), ...Object.values(snap.prices)] : [];
  const okCount = sources.filter((s) => s.status === "ok").length;
  const fg = snap?.market.fearGreed;

  const card = (item: WatchItem, isEtf: boolean) => (
    <AssetCard key={item.ticker} ticker={item.ticker} name={item.name ?? item.sector} isEtf={isEtf}
      r={snap?.prices[item.ticker]} s={snap?.scores?.[item.ticker]} onOpen={() => setOpen({ item, isEtf })} />
  );

  return (
    <main className="mx-auto max-w-md px-4 pb-8 md:max-w-3xl lg:max-w-6xl lg:px-8">
      {/* 1. Bandeau d'état */}
      <header className="sticky top-0 z-40 -mx-4 border-b border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8 dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight lg:text-2xl">Marché-Brief</h1>
            <p className="text-[11px] text-slate-500">
              {snap ? `${t("updated")} ${fmtDateTime(snap.generatedAt)}` : t("noData")} · {t("sourcesOk")} {okCount}/{sources.length}
            </p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? "…" : t("refresh")}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <MarketClock />
          <select aria-label="Langue" value={lang} onChange={(e) => setLang(e.target.value as Lang)}
            className="rounded bg-transparent text-[11px] text-slate-500">
            <option value="fr">FR</option><option value="en">EN</option><option value="de">DE</option>
          </select>
        </div>
        {snap?.marketNote && <p className="mt-1 text-xs text-amber-600">{snap.marketNote}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
      <div className="lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
      {pull > 0 && (
        <div className="flex justify-center py-2 text-xs text-slate-500" style={{ height: pull / 2 }}>
          {pull >= 80 ? t("pullToRefresh") : "↓"}
        </div>
      )}
      {/* 2. Marché */}
      <Section title={t("market")}>
        {loading || !market || !snap ? <Skeleton h={260} /> : (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {fg?.data ? <FearGreedGauge value={fg.data.value} label={fg.data.label} /> : <p className="text-sm">Fear &amp; Greed indisponible</p>}
            {fg && <p className="text-center text-[10px] text-slate-500">Fear &amp; Greed<InfoTip k="tipFg" /> · {fg.source}{fg.data?.homemade ? " (indice maison)" : ""} · {fmtDateTime(fg.fetchedAt)} <StatusBadge status={fg.status} /></p>}
            <p className="mt-3 text-sm">{market.summary.sentence}</p>
            <div className="mt-3 flex justify-between text-xs">
              <span>VIX<InfoTip k="tipVix" /> <b>{market.summary.vix != null ? fmtNum(market.summary.vix) : "—"}</b> (MM50 {market.summary.vixMa50 != null ? fmtNum(market.summary.vixMa50) : "—"})</span>
              <span>du {snap.market.vix.data?.bars.at(-1)?.date} <StatusDot status={snap.market.vix.status} /></span>
            </div>
            <PriceChart lines={market.vixLines} height={120} />
            <div className="mt-3 flex justify-between text-xs">
              <span>S&amp;P 500 <b>{market.summary.spx != null ? fmtNum(market.summary.spx, 0) : "—"}</b> (MM125<InfoTip k="tipMa" /> {market.summary.spxMa125 != null ? fmtNum(market.summary.spxMa125, 0) : "—"})</span>
              <span>du {snap.market.spx.data?.bars.at(-1)?.date} <StatusDot status={snap.market.spx.status} /></span>
            </div>
            <PriceChart lines={market.spxLines} height={120} />
          </div>
        )}
      </Section>

      {/* 3. Brief du jour */}
      <Section title={t("brief")}>
        {loading ? <Skeleton h={160} /> : <BriefCard snap={snap} />}
        <h3 className="mt-3 text-sm font-semibold">{t("upcoming")}</h3>
        {data.events.length ? (
          <ul className="mt-1 space-y-1 text-sm">{data.events.map((e) => <li key={e.date + e.title}><span className="text-slate-500">{e.date}</span> · {e.title}</li>)}</ul>
        ) : <p className="text-xs text-slate-500">{t("noEvents")}</p>}
      </Section>

      </div>
      <div className="lg:col-span-7">
      {/* 4. Mes ETF */}
      <Section title={t("myEtfs")}>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{loading ? <Skeleton /> : data.watchlist.etfs.map((e) => card(e, true))}</div>
      </Section>

      {/* 5. Actions suivies */}
      <Section title={t("stocks")} right={
        <div className="flex gap-1 text-xs">
          {(["score", "nom"] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)}
              className={`rounded-full px-2 py-0.5 ${sort === k ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800"}`}>
              {k === "score" ? t("byScore") : t("byName")}
            </button>
          ))}
        </div>
      }>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{loading ? <Skeleton /> : stocks.map((s) => card(s, false))}</div>
      </Section>

      </div>
      </div>

      {/* 6. Découvertes */}
      <Section title={t("discoveries")}>
        {loading ? <Skeleton h={200} /> : <DiscoveriesSection res={snap?.discoveries} />}
      </Section>

      {/* 7. Fiabilité */}
      <Section title={t("reliability")} right={<InfoTip k="tipBacktest" />}>
        {bt ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="font-medium">{bt.verdict}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[["Meilleur rendement", bt.beatsCagr], ["Meilleur Sharpe", bt.beatsSharpe], ["Baisse limitée", bt.beatsDrawdown]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                  <p className="text-lg font-bold">{v}/{bt.assets}</p>
                  <p className="text-[10px] text-slate-500">{l}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs">Écart de rendement annuel moyen vs achat-conservation : <b>{fmtRatio(bt.avgCagrDiff)}</b></p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-blue-600">Détail par valeur</summary>
              <table className="mt-2 w-full text-xs tabular-nums">
                <thead className="text-slate-500"><tr><th className="text-left">Valeur</th><th className="text-right">Score/an</th><th className="text-right">Conserver/an</th><th className="text-right">Pire baisse</th></tr></thead>
                <tbody>
                  {bt.results.map((r) => (
                    <tr key={r.symbol} className="border-b border-slate-200 dark:border-slate-800">
                      <td className="py-1">{r.symbol}</td>
                      <td className={`text-right ${r.strategy.cagr > r.buyHold.cagr ? "text-green-600" : ""}`}>{fmtRatio(r.strategy.cagr)}</td>
                      <td className="text-right">{fmtRatio(r.buyHold.cagr)}</td>
                      <td className="text-right">{fmtRatio(r.strategy.maxDrawdown)} / {fmtRatio(r.buyHold.maxDrawdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="mt-2 text-[10px] text-slate-500">
              Période {bt.results[0]?.from} → {bt.results[0]?.to} · frais 0,1 % · actualité exclue · vente seulement sous la MM200 · calculé le {fmtDateTime(bt.generatedAt)}
            </p>
          </div>
        ) : <p className="text-sm">Pas de backtest.</p>}
        <TrackRecord />
      </Section>

      {open && (
        <DetailSheet ticker={open.item.ticker} name={open.item.name ?? open.item.sector} isEtf={open.isEtf}
          r={snap?.prices[open.item.ticker]} s={snap?.scores?.[open.item.ticker]} onClose={() => setOpen(null)}
          explanation={snap?.brief?.data?.explanations[open.item.ticker]}
          sentiment={snap?.brief?.data?.sentiments[open.item.ticker]}
          news={(snap?.news?.data ?? []).filter((n) => n.symbols.includes(open.item.ticker)).slice(0, 5)} />
      )}
    </main>
  );
}
