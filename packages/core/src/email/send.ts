// Envoi via l'API Resend (clé et adresse dans les secrets, jamais dans le dépôt).
export interface EmailMessage { from: string; to: string[]; subject: string; html: string; text: string }

export async function sendWithResend(apiKey: string, msg: EmailMessage): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend HTTP ${res.status} : ${body.message ?? "erreur inconnue"}`);
  return body.id ?? "";
}
