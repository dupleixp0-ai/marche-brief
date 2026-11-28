// E-mail de 9h15.
// - Appelé par collect.ts après la collecte (envoi si SEND_EMAIL=true).
// - « npm run email:preview » : génère tmp/email-preview.html depuis le dernier snapshot, sans envoyer.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildDigest, sendWithResend, type Snapshot } from "@marche-brief/core";

const root = new URL("../", import.meta.url);
const path = (p: string) => new URL(p, root);

export async function sendDailyEmail(snap: Snapshot, previous: Snapshot | null): Promise<void> {
  const wl = JSON.parse(readFileSync(path("config/watchlist.json"), "utf8"));
  const names = Object.fromEntries([...wl.etfs, ...wl.stocks].map((v: { ticker: string; name?: string; sector?: string }) => [v.ticker, v.name ?? v.sector ?? ""]));
  const digest = buildDigest(snap, previous, {
    etfs: wl.etfs.map((v: { ticker: string }) => v.ticker),
    stocks: wl.stocks.map((v: { ticker: string }) => v.ticker),
    names,
    siteUrl: process.env.SITE_URL || undefined,
    vixAlert: Number(process.env.VIX_ALERT || 30),
  });
  mkdirSync(path("tmp"), { recursive: true });
  writeFileSync(path("tmp/email-preview.html"), digest.html);
  console.log(`E-mail : « ${digest.subject} » · ${digest.alerts.length} alerte(s) · aperçu dans tmp/email-preview.html`);

  if (process.env.SEND_EMAIL !== "true") return;
  const key = process.env.RESEND_API_KEY, to = process.env.EMAIL_TO;
  if (!key || !to) { console.log("E-mail non envoyé : RESEND_API_KEY ou EMAIL_TO manquant."); return; }
  try {
    const id = await sendWithResend(key, {
      from: process.env.EMAIL_FROM || "MarketPulse <onboarding@resend.dev>",
      to: to.split(",").map((s) => s.trim()),
      subject: digest.subject, html: digest.html, text: digest.text,
    });
    console.log(`E-mail envoyé (id ${id}).`);
  } catch (e) {
    // L'échec d'envoi ne doit pas faire échouer la collecte : on le journalise.
    console.error(`Échec de l'envoi : ${e instanceof Error ? e.message : e}`);
    process.exitCode = 0;
  }
}

// Exécution directe : aperçu à partir du dernier snapshot.
if (process.argv[1]?.endsWith("email.ts")) {
  const f = path("data/snapshot.json");
  if (!existsSync(f)) throw new Error("Aucun snapshot : lancer npm run collect");
  await sendDailyEmail(JSON.parse(readFileSync(f, "utf8")), null);
}
