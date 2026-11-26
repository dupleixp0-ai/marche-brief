"use client";
import { useState } from "react";
import { useI18n, type TKey } from "../lib/i18n";

/** Petite icône « i » : explication au survol (ordinateur) ou au toucher (téléphone). */
export function InfoTip({ k }: { k: TKey }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button type="button" aria-label={t(k)} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold leading-none text-slate-500">i</button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-5 z-50 w-64 -translate-x-1/2 rounded-lg bg-slate-900 p-2 text-left text-xs font-normal leading-snug text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {t(k)}
        </span>
      )}
    </span>
  );
}
