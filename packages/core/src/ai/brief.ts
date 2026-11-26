// Brief du jour rédigé par Claude : résumé de l'actualité, sentiment par valeur, explications.
// Appelé uniquement côté job quotidien / Worker (la clé API n'est jamais dans la page).
import Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "../news/types";

/** Sonnet 5.5 en effort « low » : bon équilibre qualité / coût pour un brief quotidien. */
export const BRIEF_MODEL = "claude-sonnet-5-5";

export interface BriefBullet { text: string; links: { title: string; url: string }[] }
export interface Brief {
  generatedAt: string;
  model: string;
  newsHash: string;
  bullets: BriefBullet[];
  /** Sentiment borné −1..+1, seulement pour les valeurs avec une actualité. */
  sentiments: Record<string, { value: number; reason: string }>;
  explanations: Record<string, string>;
}

export interface BriefAsset { symbol: string; name?: string; decision: string; reasons: string[] }

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bullets", "sentiments", "explanations"],
  properties: {
    bullets: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["text", "sources"],
        properties: { text: { type: "string" }, sources: { type: "array", items: { type: "integer" } } },
      },
    },
    sentiments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["symbol", "value", "reason"],
        properties: { symbol: { type: "string" }, value: { type: "number" }, reason: { type: "string" } },
      },
    },
    explanations: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["symbol", "text"],
        properties: { symbol: { type: "string" }, text: { type: "string" } },
      },
    },
  },
} as const;

export const SYSTEM = `Tu rédiges le brief boursier quotidien d'un investisseur particulier francophone qui détient des ETF (monde, émergents, semi-conducteurs, cybersécurité, data centers, or) et suit des actions technologiques américaines. Il n'est pas un professionnel : il veut comprendre ce qui s'est passé et ce que cela peut changer pour lui.
Règles :
- Utilise uniquement les actualités et les chiffres fournis. N'invente aucun fait, chiffre ni événement. Si une actualité est vague, dis seulement ce qu'elle annonce.
- "bullets" : 5 à 8 puces en français. Chaque puce est un vrai résumé, pas un titre : 1 à 2 phrases qui disent ce qui s'est passé, puis pourquoi c'est important pour les marchés ou pour ses placements (taux, inflation, secteur concerné…). Explique les sigles et le jargon en quelques mots. Les sujets qui comptent le plus pour les marchés d'abord ; regroupe les actualités qui parlent du même sujet ; ignore les annonces administratives sans effet sur les marchés. "sources" contient les numéros [n] des actualités utilisées.
- "sentiments" : pour chaque valeur suivie qui a au moins une actualité la concernant directement, un nombre entre -1 (très négatif) et +1 (très positif) et une raison courte. N'inclus pas les valeurs sans actualité.
- "explanations" : pour chaque valeur suivie, une ou deux phrases simples qui expliquent sa recommandation à partir des raisons fournies, sans citer le score ni donner de conseil personnalisé.
- Ton neutre et factuel.`;

export function buildBriefPrompt(news: NewsItem[], assets: BriefAsset[], marketContext?: string): string {
  const n = news.map((x, i) => `[${i}] ${x.publishedAt.slice(0, 10)} · ${x.source}${x.symbols.length ? ` · ${x.symbols.join(",")}` : ""} · ${x.title}${x.summary ? `\n    ${x.summary}` : ""}`).join("\n");
  const a = assets.map((x) => `${x.symbol}${x.name ? ` (${x.name})` : ""} : ${x.decision} — ${x.reasons.join(" ; ")}`).join("\n");
  return `${marketContext ? `Contexte de marché (chiffres du jour) :\n${marketContext}\n\n` : ""}Actualités :\n${n || "(aucune)"}\n\nValeurs suivies et raisons de leur recommandation :\n${a}`;
}

/** Valide et nettoie la réponse : symboles connus, sentiment borné, liens réels. */
export function sanitizeBrief(raw: unknown, news: NewsItem[], symbols: string[], meta: Pick<Brief, "generatedAt" | "model" | "newsHash">): Brief {
  const r = raw as { bullets?: { text: string; sources: number[] }[]; sentiments?: { symbol: string; value: number; reason: string }[]; explanations?: { symbol: string; text: string }[] };
  const known = new Set(symbols);
  const bullets = (r.bullets ?? []).slice(0, 8).filter((b) => b.text?.trim()).map((b) => ({
    text: b.text.trim(),
    links: [...new Set(b.sources ?? [])].filter((i) => Number.isInteger(i) && news[i]).slice(0, 3).map((i) => ({ title: news[i].title, url: news[i].url })),
  }));
  const sentiments: Brief["sentiments"] = {};
  for (const s of r.sentiments ?? []) {
    if (known.has(s.symbol) && Number.isFinite(s.value)) sentiments[s.symbol] = { value: Math.max(-1, Math.min(1, s.value)), reason: s.reason };
  }
  const explanations: Brief["explanations"] = {};
  for (const e of r.explanations ?? []) if (known.has(e.symbol) && e.text?.trim()) explanations[e.symbol] = e.text.trim();
  return { ...meta, bullets, sentiments, explanations };
}

/** Appelle Claude (repli automatique sur un autre modèle en cas de refus). */
export async function generateBrief(
  client: Anthropic,
  news: NewsItem[],
  assets: BriefAsset[],
  newsHash: string,
  now = new Date(),
  marketContext?: string,
): Promise<Brief> {
  const response = await client.beta.messages.create({
    model: BRIEF_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: buildBriefPrompt(news, assets, marketContext) }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude a refusé de générer le brief");
  if (response.stop_reason === "max_tokens") throw new Error("brief tronqué (max_tokens)");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return sanitizeBrief(JSON.parse(text), news, assets.map((a) => a.symbol), { generatedAt: now.toISOString(), model: response.model, newsHash });
}
