"use client";
// Onglet « Personnel » : positions chiffrées localement (voir lib/vault.ts), calculs dans packages/core.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { evaluatePortfolio, validateHolding, DE_TAX_RATE, READING_RULES, type Holding, type HoldingMarket, type Reading, type Snapshot } from "@marche-brief/core";
import type { Watchlist } from "../lib/types";
import { useCurrency } from "../lib/currency";
import { fmtDateTime, fmtNum, fmtPct, fmtQuote } from "../lib/format";
import { DecisionBadge } from "./Badges";
import { Abbr } from "./Abbr";
import { changePassword, createVault, deleteVault, exportVault, importVault, openVault, saveVault, vaultExists, type Session, type VaultData } from "../lib/vault";

const panel = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-950";
const btn = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";
const btnMain = `${btn} bg-blue-600 text-white`;
const btnSoft = `${btn} bg-slate-100 dark:bg-slate-800`;
const AUTO_LOCK_MS = 5 * 60_000;
const GOLD = /gold|or physique/i;

// Coffre déverrouillé gardé en mémoire seulement (perdu au rechargement), pour pouvoir changer d'onglet.
let memo: { session: Session; data: VaultData } | null = null;
let hiddenAt = 0;

/** Symboles détenus (coffre déverrouillé seulement) : « Actualiser » récupère aussi leurs cours. */
export const heldTickers = (): string[] => memo?.data.holdings.map((h) => h.ticker) ?? [];

const READ_CLS: Record<Reading, string> = {
  Renforcer: "bg-green-600 text-white", Conserver: "bg-slate-500 text-white", Alléger: "bg-amber-500 text-white",
};

export function PortfolioView({ snap, watchlist, onOpen }: { snap: Snapshot | null; watchlist: Watchlist; onOpen: (ticker: string) => void }) {
  const [state, setState] = useState<{ session: Session; data: VaultData } | null>(memo);
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => setExists(vaultExists()), []);

  // Verrouillage automatique après 5 minutes en arrière-plan.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) { memo = null; setState(null); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const unlocked = (s: { session: Session; data: VaultData }) => { memo = s; setState(s); setExists(true); };
  const lock = () => { memo = null; setState(null); };

  if (exists === null) return null;
  if (!state) return <LockScreen exists={exists} onUnlocked={unlocked} onDeleted={() => setExists(false)} />;
  return <Unlocked snap={snap} watchlist={watchlist} onOpen={onOpen} state={state} onChange={unlocked} onLock={lock} />;
}

// ---------- Verrou ----------
function LockScreen({ exists, onUnlocked, onDeleted }: { exists: boolean; onUnlocked: (s: { session: Session; data: VaultData }) => void; onDeleted: () => void }) {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (!exists) {
      if (pw.length < 8) return setErr("8 caractères minimum.");
      if (pw !== pw2) return setErr("Les deux mots de passe ne correspondent pas.");
    }
    setBusy(true);
    try { onUnlocked(exists ? await openVault(pw) : await createVault(pw)); }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  }
  async function importFile(f: File) {
    if (!pw) return setErr("Saisis d'abord le mot de passe de la sauvegarde.");
    setBusy(true); setErr(null);
    try { onUnlocked(await importVault(await f.text(), pw)); }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className={`${panel} space-y-3`}>
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">🔒</span>
          <h2 className="text-base font-semibold">{exists ? "Déverrouiller mon portefeuille" : "Créer mon portefeuille privé"}</h2>
        </div>
        <p className="text-xs text-slate-500">
          Tes positions sont chiffrées et restent <b>uniquement sur cet appareil</b> : elles ne sont jamais envoyées ni publiées.
          {!exists && " Un mot de passe oublié ne peut pas être récupéré : pense à exporter une sauvegarde."}
        </p>
        <input type="password" autoComplete={exists ? "current-password" : "new-password"} placeholder="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
        {!exists && <input type="password" autoComplete="new-password" placeholder="Confirmer le mot de passe" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || !pw} className={`${btnMain} w-full`}>{busy ? "…" : exists ? "Déverrouiller" : "Créer"}</button>
        <div className="flex flex-wrap justify-between gap-2 pt-1 text-xs">
          <button type="button" onClick={() => file.current?.click()} className="text-blue-600">Importer une sauvegarde…</button>
          {exists && (
            <button type="button" className="text-red-600" onClick={() => {
              if (confirm("Effacer définitivement le portefeuille de cet appareil ? Sans sauvegarde, il sera perdu.")) { deleteVault(); onDeleted(); }
            }}>Mot de passe oublié : effacer</button>
          )}
        </div>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
      </form>
    </div>
  );
}

// ---------- Portefeuille ----------
interface Option { ticker: string; label: string; group: string }

function Unlocked({ snap, watchlist, onOpen, state, onChange, onLock }: {
  snap: Snapshot | null; watchlist: Watchlist; onOpen: (ticker: string) => void;
  state: { session: Session; data: VaultData }; onChange: (s: { session: Session; data: VaultData }) => void; onLock: () => void;
}) {
  const cur = useCurrency();
  const [edit, setEdit] = useState<{ ticker: string; isNew: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data } = state;

  // Marché de chaque valeur disponible dans le snapshot (liste suivie + découvertes).
  const { market, options } = useMemo(() => {
    const market: Record<string, HoldingMarket> = {};
    const options: Option[] = [];
    if (snap) {
      for (const e of watchlist.etfs) {
        const r = snap.prices[e.ticker]?.data;
        if (r) market[e.ticker] = { bars: r.bars, currency: r.currency, isEtf: true, taxClass: GOLD.test(`${e.name} ${e.fullName}`) ? "other" : "equityFund", decision: snap.scores[e.ticker]?.decision, score: snap.scores[e.ticker]?.score };
        options.push({ ticker: e.ticker, label: `${e.name ?? e.ticker} (${e.ticker})`, group: "Mes ETF" });
      }
      for (const s of watchlist.stocks) {
        const r = snap.prices[s.ticker]?.data;
        if (r) market[s.ticker] = { bars: r.bars, currency: r.currency, taxClass: "stock", decision: snap.scores[s.ticker]?.decision, score: snap.scores[s.ticker]?.score };
        options.push({ ticker: s.ticker, label: `${s.ticker} · ${s.sector ?? ""}`, group: "Actions suivies" });
      }
      for (const d of [...(snap.discoveries?.data?.stocks ?? []), ...(snap.discoveries?.data?.etfs ?? [])]) {
        if (market[d.ticker]) continue;
        // Cours actualisé s'il a été récupéré par « Actualiser », sinon l'historique des découvertes.
        const fresh = snap.prices[d.ticker]?.data;
        market[d.ticker] = { bars: fresh?.bars ?? d.history, currency: fresh?.currency ?? d.currency, isEtf: d.type === "etf", taxClass: d.type === "etf" ? (GOLD.test(d.name) ? "other" : "equityFund") : "stock", decision: snap.scores[d.ticker]?.decision ?? d.decision, score: snap.scores[d.ticker]?.score ?? d.score };
        options.push({ ticker: d.ticker, label: `${d.name} (${d.ticker})`, group: "Découvertes du jour" });
      }
    }
    return { market, options };
  }, [snap, watchlist]);
  // Heure exacte du cours : snapshot (liste suivie, valeurs actualisées) ou découvertes.
  const quoteOf = (t: string, date: string) => {
    const p = snap?.prices[t]?.data;
    if (p?.quoteTime) return fmtQuote(date, p.quoteTime, p.venue);
    const d = [...(snap?.discoveries?.data?.stocks ?? []), ...(snap?.discoveries?.data?.etfs ?? [])].find((x) => x.ticker === t);
    return fmtQuote(date, d?.lastTime, d?.exchange);
  };
  const labelOf = (t: string) => options.find((o) => o.ticker === t)?.label.replace(/ \([^)]*\)$/, "") ?? t;

  const pf = useMemo(() => evaluatePortfolio(data.holdings, market, cur.rates, { currency: cur.currency, allowance: data.allowance }), [data, market, cur.rates, cur.currency]);
  const money = (x: number | null | undefined, d = 2) => cur.money(x, cur.currency, d);
  const tone = (x: number | null | undefined) => (x == null ? "" : x >= 0 ? "text-green-600" : "text-red-600");
  const signed = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${money(x)}`);

  async function persist(next: VaultData, note?: string) {
    await saveVault(state.session, next);
    onChange({ session: state.session, data: next });
    if (note) { setMsg(note); setTimeout(() => setMsg(null), 2500); }
  }
  const upsert = (h: Holding) => persist({ ...data, holdings: [...data.holdings.filter((x) => x.ticker !== h.ticker), h].sort((a, b) => a.ticker.localeCompare(b.ticker)) }, "Enregistré (chiffré sur cet appareil).");
  const remove = (t: string) => persist({ ...data, holdings: data.holdings.filter((x) => x.ticker !== t) }, "Ligne supprimée.");

  function exportFile() {
    const raw = exportVault();
    if (!raw) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    a.download = `marketpulse-portefeuille-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function newPassword() {
    const p1 = prompt("Nouveau mot de passe (8 caractères minimum) :");
    if (!p1) return;
    if (p1.length < 8) return alert("8 caractères minimum.");
    if (prompt("Confirme le nouveau mot de passe :") !== p1) return alert("Les mots de passe ne correspondent pas.");
    onChange({ session: await changePassword(data, p1), data });
    setMsg("Mot de passe changé. Pense à refaire une sauvegarde.");
  }

  const asOf = pf.rows.map((r) => r.asOf).filter(Boolean).sort()[0];

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valeur actuelle" value={money(pf.value)} sub={`Investi ${money(pf.cost)}`} />
        <Stat label="Gain / perte" value={<span className={tone(pf.pnl)}>{signed(pf.pnl)}</span>} sub={<span className={tone(pf.pnl)}>{fmtPct(pf.pnlPct == null ? null : pf.pnlPct * 100)}</span>} />
        <Stat label="Dernière séance" value={<span className={tone(pf.dayPnl)}>{signed(pf.dayPnl)}</span>} sub={asOf ? `cours du ${asOf.slice(8, 10)}/${asOf.slice(5, 7)} au plus tôt (heure par ligne)` : "—"} />
        <Stat label="Après impôt (estim.)" value={<span className={tone(pf.tax.netPnl)}>{signed(pf.tax.netPnl)}</span>} sub={`Impôt estimé ${money(pf.tax.tax)}`} />
      </div>

      {/* Positions */}
      <section className={panel}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Mes positions ({data.holdings.length})</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEdit({ ticker: "", isNew: true })} className={btnMain}>+ Ajouter</button>
            <button onClick={onLock} className={btnSoft}>🔒 Verrouiller</button>
          </div>
        </div>
        {msg && <p className="mb-2 text-xs text-green-600">{msg}</p>}
        {!data.holdings.length && <p className="text-sm text-slate-500">Aucune position. Ajoute tes ETF et actions avec le nombre de parts et ton cours moyen d'achat (en €, comme affiché chez ton courtier).</p>}
        <ul className="space-y-3">
          {[...pf.rows].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map((r) => (
            <li key={r.ticker} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => onOpen(r.ticker)} className="min-w-0 text-left">
                  <p className="font-semibold leading-tight"><Abbr text={labelOf(r.ticker)} /></p>
                  <p className="text-[11px] text-slate-500">{r.ticker} · {fmtNum(r.shares, r.shares % 1 ? 4 : 0)} parts · moyen {cur.money(r.avgPrice, "EUR")}{r.asOf ? ` · cours du ${quoteOf(r.ticker, r.asOf)}` : ""}</p>
                </button>
                <div className="shrink-0 text-right">
                  <p className="whitespace-nowrap font-semibold tabular-nums">{money(r.value)}</p>
                  <p className={`whitespace-nowrap text-xs tabular-nums ${tone(r.pnl)}`}>{signed(r.pnl)} · {fmtPct(r.pnlPct == null ? null : r.pnlPct * 100, 1)}</p>
                </div>
              </div>
              {r.value == null ? (
                <p className="mt-2 text-xs text-amber-600">Pas de cours pour cette valeur dans les données du jour (elle doit être dans la liste suivie ou les découvertes).</p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {r.reading && <span className={`rounded-full px-2 py-0.5 font-semibold ${READ_CLS[r.reading]}`}>{r.reading}</span>}
                    {r.decision && <DecisionBadge decision={r.decision} score={r.score} />}
                    <span className="text-slate-500">Poids {r.weight != null ? fmtPct(r.weight * 100, 1, false) : "—"} · cours {money(r.price)} · séance <span className={tone(r.dayPnl)}>{signed(r.dayPnl)}</span></span>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
              <div className="mt-2 flex gap-3 text-xs">
                <button onClick={() => setEdit({ ticker: r.ticker, isNew: false })} className="text-blue-600">Modifier</button>
                <button onClick={() => confirm(`Supprimer ${r.ticker} de ton portefeuille ?`) && remove(r.ticker)} className="text-red-600">Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
        {pf.missing.length > 0 && <p className="mt-2 text-[11px] text-amber-600">Exclues des totaux (pas de cours) : {pf.missing.join(", ")}.</p>}
        <p className="mt-3 text-[10px] text-slate-500">
          Lecture : « Alléger » si le score est à Vendre ou si une ligne pèse plus de {READING_RULES.maxWeight * 100} % ; « Renforcer » si le score est à Acheter et la ligne pèse moins de {READING_RULES.reinforceMaxWeight * 100} % ; sinon « Conserver ». C'est une lecture des indicateurs, pas un ordre : l'application ne passe aucun ordre.
          {snap && ` Données du ${fmtDateTime(snap.generatedAt)}.`}
        </p>
      </section>

      {/* Impôt et sauvegarde */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${panel} text-sm`}>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Impôt estimé (Allemagne)</h2>
          <label className="flex items-center justify-between gap-3 text-xs">
            <span>Abattement restant cette année (Sparerpauschbetrag)</span>
            <input type="number" inputMode="decimal" min={0} step={1} defaultValue={data.allowance}
              onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== data.allowance) persist({ ...data, allowance: v }, "Abattement enregistré."); }}
              className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-base dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Gain imposable {money(pf.tax.taxableGain)} → impôt {money(pf.tax.tax)} au taux de {fmtNum(DE_TAX_RATE * 100, 3)} % si tout était vendu aujourd'hui.
          </p>
          <p className="mt-1 text-[10px] text-slate-500">Estimation simplifiée : 30 % des gains d'un ETF actions sont exonérés (Teilfreistellung), pas l'or ; impôt d'église et règles de compensation des pertes non pris en compte.</p>
        </section>
        <section className={`${panel} text-sm`}>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Sécurité et sauvegarde</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">Chiffré (AES-256) avec ton mot de passe, stocké sur cet appareil uniquement. Verrouillage automatique après 5 min en arrière-plan.{data.updatedAt ? ` Dernière modification : ${fmtDateTime(data.updatedAt)}.` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={exportFile} className={btnSoft}>Exporter (chiffré)</button>
            <button onClick={newPassword} className={btnSoft}>Changer le mot de passe</button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">Le fichier exporté reste chiffré : garde-le dans iCloud Drive ou Fichiers, et importe-le sur un autre appareil depuis l'écran de verrouillage.</p>
        </section>
      </div>

      {edit && (
        <EditSheet
          initial={edit.isNew ? null : data.holdings.find((h) => h.ticker === edit.ticker) ?? null}
          options={options.filter((o) => !edit.isNew || !data.holdings.some((h) => h.ticker === o.ticker))}
          priceOf={(t) => { const b = market[t]?.bars.at(-1); return b ? { close: b.close, currency: market[t]?.currency ?? "" } : null; }}
          onClose={() => setEdit(null)}
          onSave={async (h) => { await upsert(h); setEdit(null); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={panel}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-nowrap text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ---------- Saisie ----------
function EditSheet({ initial, options, priceOf, onClose, onSave }: {
  initial: Holding | null; options: Option[]; priceOf: (t: string) => { close: number; currency: string } | null;
  onClose: () => void; onSave: (h: Holding) => Promise<void>;
}) {
  const [ticker, setTicker] = useState(initial?.ticker ?? options[0]?.ticker ?? "");
  const [shares, setShares] = useState(initial ? String(initial.shares).replace(".", ",") : "");
  const [avg, setAvg] = useState(initial ? String(initial.avgPrice).replace(".", ",") : "");
  const [err, setErr] = useState<string | null>(null);
  const groups = [...new Set(options.map((o) => o.group))];
  const p = ticker ? priceOf(ticker) : null;
  const parse = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const h: Holding = { ticker, shares: parse(shares), avgPrice: parse(avg), avgCurrency: "EUR" };
    const v = validateHolding(h);
    if (v) return setErr(v);
    await onSave(h);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:rounded-2xl dark:bg-slate-900">
        <h3 className="text-base font-semibold">{initial ? `Modifier ${initial.ticker}` : "Ajouter une position"}</h3>
        {initial ? null : (
          <label className="block text-xs">Valeur
            <select value={ticker} onChange={(e) => setTicker(e.target.value)} className={`${input} mt-1`}>
              {groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.ticker} value={o.ticker}>{o.label}</option>)}</optgroup>)}
            </select>
          </label>
        )}
        <label className="block text-xs">Nombre de parts
          <input inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="ex. 12,5" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs">Cours moyen d'achat (€)
          <input inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="ex. 98,40" className={`${input} mt-1`} />
        </label>
        {p && <p className="text-[11px] text-slate-500">Dernier cours : {fmtNum(p.close)} {p.currency}{p.currency !== "EUR" ? " (converti en € pour le calcul)" : ""}.</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSoft}>Annuler</button>
          <button className={btnMain}>Enregistrer</button>
        </div>
      </form>
    </div>
  );
}
