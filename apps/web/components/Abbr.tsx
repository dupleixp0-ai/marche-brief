"use client";
import { GLOSSARY, termsIn } from "../lib/glossary";

/**
 * Affiche un nom en soulignant les sigles (nom complet au survol / au toucher).
 * `legend` : liste les sigles présents avec leur nom complet.
 */
export function Abbr({ text, legend = false }: { text: string; legend?: boolean }) {
  const terms = termsIn(text);
  if (legend) {
    if (!terms.length) return null;
    return (
      <dl className="mt-2 grid gap-x-3 gap-y-1 text-[11px] sm:grid-cols-[auto_1fr]">
        {terms.map((t) => (
          <div key={t.term} className="contents">
            <dt className="font-semibold">{t.term}</dt>
            <dd className="text-slate-600 dark:text-slate-300">{t.meaning}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (!terms.length) return <>{text}</>;
  const keys = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length).map((k) => k.replace(/[&]/g, "\\&"));
  const parts = text.split(new RegExp(`(?<![A-Za-z])(${keys.join("|")})(?![A-Za-z])`));
  return (
    <>
      {parts.map((p, i) =>
        GLOSSARY[p] ? <abbr key={i} title={GLOSSARY[p]} className="cursor-help underline decoration-dotted underline-offset-2">{p}</abbr> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
