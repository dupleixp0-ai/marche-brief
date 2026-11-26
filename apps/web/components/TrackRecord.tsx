"use client";
import { useEffect, useState } from "react";
import type { TrackRecord as TR, Decision } from "@marche-brief/core";
import { useI18n } from "../lib/i18n";
import { fmtDateTime, fmtRatio } from "../lib/format";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Résultat réel des recommandations archivées (pas un backtest). */
export function TrackRecord() {
  const { t } = useI18n();
  const [tr, setTr] = useState<TR | null>(null);
  useEffect(() => { fetch(`${BASE}/data/track-record.json`).then((r) => (r.ok ? r.json() : null)).then(setTr).catch(() => {}); }, []);
  if (!tr) return null;
  const row = (d: Decision) => {
    const s = tr.byDecision[d];
    return (
      <tr key={d} className="border-b border-slate-200 dark:border-slate-800">
        <td className="py-1">{t(d)}</td>
        <td className="text-right">{s.n}</td>
        <td className="text-right">{s.hitRate == null ? "—" : fmtRatio(s.hitRate)}</td>
        <td className="text-right">{s.avgReturn == null ? "—" : fmtRatio(s.avgReturn)}</td>
        <td className="text-right">{s.beatSpy == null ? "—" : fmtRatio(s.beatSpy)}</td>
      </tr>
    );
  };
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-semibold">{t("trackRecord")}</h3>
      {tr.evaluated === 0 ? <p className="mt-1 text-xs text-slate-500">{t("trackNone")}</p> : (
        <>
          <table className="mt-2 w-full text-xs tabular-nums">
            <thead className="text-slate-500"><tr><th className="text-left">Décision</th><th className="text-right">Nb</th><th className="text-right">Justes</th><th className="text-right">Rendement moyen</th><th className="text-right">Mieux que SPY</th></tr></thead>
            <tbody>{(["Acheter", "Attendre", "Vendre"] as const).map(row)}</tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-500">
            Recommandations depuis le {tr.since}, jugées {tr.horizon} séances plus tard (Acheter juste si le cours a monté, Vendre juste s'il a baissé) · {fmtDateTime(tr.generatedAt)}
          </p>
        </>
      )}
    </div>
  );
}
