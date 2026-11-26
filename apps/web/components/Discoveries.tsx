"use client";
import { useEffect, useMemo, useState } from "react";
import type { Discovery, Discoveries as D, SourceResult } from "@marche-brief/core";
import { DecisionBadge, StatusBadge } from "./Badges";
import { Sparkline } from "./Sparkline";
import { fmtDateTime, fmtRatio } from "../lib/format";
import { useCurrency } from "../lib/currency";
import { Abbr } from "./Abbr";

const FOLLOW_KEY = "marche-brief:suivies";
const FLAG: Record<string, string> = { US: "🇺🇸", DE: "🇩🇪", FR: "🇫🇷", NL: "🇳🇱", CH: "🇨🇭", GB: "🇬🇧", DK: "🇩🇰", ES: "🇪🇸", IT: "🇮🇹", FI: "🇫🇮", SE: "🇸🇪", NO: "🇳🇴" };

export function useFollowed() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => { setList(JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? "[]")); }, []);
  const toggle = (t: string) => {
    const next = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
    setList(next);
  };
  return { list, toggle };
}

const pctCls = (x: number | null) => (x == null ? "" : x >= 0 ? "text-green-600" : "text-red-600");
const signed = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${fmtRatio(x)}`);

function Card({ d, followed, onFollow, onOpen }: { d: Discovery; followed: boolean; onFollow: () => void; onOpen: () => void }) {
  const cur = useCurrency();
  const conv = cur.bars(d.history?.length ? d.history : [{ date: d.lastDate, close: d.lastClose }], d.currency);
  const spark = d.history?.length ? conv.bars.slice(-63).map((b) => b.close) : d.spark;
  return (
    <article onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold"><Abbr text={d.name} /> <span className="text-xs font-normal text-slate-500">{d.ticker}</span></p>
          <p className="text-[11px] text-slate-500">
            {FLAG[d.country] ?? d.country} {d.exchange} · {d.sector} · {d.currency}
          </p>
          <p className="text-[10px] text-slate-400">
            {d.marketOpen == null ? "" : d.marketOpen ? "🟢 Place ouverte" : "⚪ Place fermée"} · cours du {d.lastDate}
          </p>
        </div>
        <div className="text-right">
          <DecisionBadge decision={d.decision} score={d.score} />
          <p className="mt-1 text-sm tabular-nums">{cur.money(conv.bars.at(-1)?.close, conv.currency)}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Sparkline values={spark} width={120} height={34} />
        <div className="text-right text-[11px] tabular-nums">
          <p>3 mois : <span className={pctCls(d.perf3m)}>{signed(d.perf3m)}</span> {d.currency !== "EUR" && <>· en € <span className={pctCls(d.perf3mEUR)}>{signed(d.perf3mEUR)}</span></>}</p>
          <p className="text-slate-500">vs région {signed(d.relRegion)} · vs monde {signed(d.relWorld)}</p>
        </div>
      </div>
      <h4 className="mt-2 text-xs font-semibold text-green-700 dark:text-green-500">Pourquoi cette valeur est prometteuse</h4>
      <ul className="list-disc pl-4 text-xs">{d.why.map((x) => <li key={x}>{x}</li>)}</ul>
      <h4 className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-500">Risques à connaître</h4>
      <ul className="list-disc pl-4 text-xs">{d.risks.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">
          {d.buyable ? "Probablement achetable (Trade Republic, à vérifier)" : d.buyable === false ? "Version UCITS à chercher chez ton courtier" : "Disponibilité inconnue"}
        </span>
        <span className="text-[10px] text-blue-600">Graphiques →</span>
        <button onClick={(e) => { e.stopPropagation(); onFollow(); }}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${followed ? "bg-slate-200 dark:bg-slate-700" : "bg-blue-600 text-white"}`}>
          {followed ? "✓ Suivie" : "+ Suivre"}
        </button>
      </div>
    </article>
  );
}

export function DiscoveriesSection({ res, onOpen }: { res: SourceResult<D> | null | undefined; onOpen: (d: Discovery) => void }) {
  const [region, setRegion] = useState("Tous");
  const [type, setType] = useState<"stocks" | "etfs">("stocks");
  const [buyableOnly, setBuyableOnly] = useState(false);
  const { list, toggle } = useFollowed();
  const data = res?.data;

  const shown = useMemo(() => {
    if (!data) return [];
    let l = data[type];
    if (region !== "Tous") l = [...l].filter((d) => d.region === region).sort((a, b) => b.score - a.score);
    if (buyableOnly) l = l.filter((d) => d.buyable);
    return l.slice(0, 5);
  }, [data, type, region, buyableOnly]);

  if (!data) return <p className="text-sm text-slate-500">Pas encore de découvertes (calculées par le job quotidien).</p>;
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-xs ${active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={chip(type === "stocks")} onClick={() => setType("stocks")}>Actions</button>
        <button className={chip(type === "etfs")} onClick={() => setType("etfs")}>ETF</button>
        <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
        {["Tous", ...data.regions].map((r) => <button key={r} className={chip(region === r)} onClick={() => setRegion(r)}>{r}</button>)}
        <label className="ml-auto flex items-center gap-1 text-xs">
          <input type="checkbox" checked={buyableOnly} onChange={(e) => setBuyableOnly(e.target.checked)} /> Achetables seulement
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.length ? shown.map((d) => <Card key={d.ticker} d={d} followed={list.includes(d.ticker)} onFollow={() => toggle(d.ticker)} onOpen={() => onOpen(d)} />)
          : <p className="text-sm text-slate-500">Aucune valeur ne remplit les critères avec ces filtres.</p>}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        {data.scanned} valeurs analysées (Amérique, Europe), {data.excluded.length} exclues pour données incomplètes ou illiquides ·
        max. 2 par pays et par secteur · {res!.source} · {fmtDateTime(res!.fetchedAt)} <StatusBadge status={res!.status} />
      </p>
      {list.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          Valeurs suivies depuis les Découvertes (sur cet appareil) : {list.join(", ")}. Pour un suivi quotidien complet, les ajouter à <code>config/watchlist.json</code>.
        </p>
      )}
    </div>
  );
}
