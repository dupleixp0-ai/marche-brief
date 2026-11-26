// Coffre local chiffré pour le portefeuille personnel.
// - Les positions ne quittent jamais l'appareil : rien n'est envoyé, rien n'est dans le dépôt.
// - Chiffrement AES-GCM 256 bits, clé dérivée du mot de passe (PBKDF2-SHA-256, 310 000 itérations).
// - Sans le mot de passe, le contenu est illisible ; un mot de passe oublié ne se récupère pas.
import type { Holding } from "@marche-brief/core";

const KEY = "marketpulse:coffre";
const ITERATIONS = 310_000;

export interface VaultData {
  holdings: Holding[];
  /** Abattement restant pour l'année (Sparerpauschbetrag), en €. */
  allowance: number;
  updatedAt: string;
}
interface Sealed { v: 1; app: "MarketPulse"; kdf: "PBKDF2-SHA256"; iterations: number; salt: string; iv: string; data: string }
export interface Session { key: CryptoKey; salt: Uint8Array }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function isSealed(x: unknown): x is Sealed {
  const s = x as Sealed;
  return !!s && s.v === 1 && typeof s.salt === "string" && typeof s.iv === "string" && typeof s.data === "string" && typeof s.iterations === "number";
}

async function seal(session: Session, data: VaultData): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, session.key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, app: "MarketPulse", kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: b64(session.salt), iv: b64(iv), data: b64(new Uint8Array(ct)) };
}

async function unseal(sealed: Sealed, password: string): Promise<{ session: Session; data: VaultData }> {
  const salt = unb64(sealed.salt);
  const key = await derive(password, salt, sealed.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) as BufferSource }, key, unb64(sealed.data) as BufferSource);
  } catch {
    throw new Error("Mot de passe incorrect.");
  }
  const data = JSON.parse(new TextDecoder().decode(plain)) as VaultData;
  // Ré-dérive avec le nombre d'itérations courant pour les prochains enregistrements.
  const session = sealed.iterations === ITERATIONS ? { key, salt } : { key: await derive(password, salt), salt };
  return { session, data: { holdings: data.holdings ?? [], allowance: data.allowance ?? 1000, updatedAt: data.updatedAt ?? "" } };
}

export const vaultExists = () => typeof localStorage !== "undefined" && !!localStorage.getItem(KEY);

export async function createVault(password: string): Promise<{ session: Session; data: VaultData }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const session = { key: await derive(password, salt), salt };
  const data: VaultData = { holdings: [], allowance: 1000, updatedAt: new Date().toISOString() };
  await saveVault(session, data);
  return { session, data };
}

export async function openVault(password: string) {
  const raw = localStorage.getItem(KEY);
  if (!raw) throw new Error("Aucun coffre sur cet appareil.");
  const sealed = JSON.parse(raw);
  if (!isSealed(sealed)) throw new Error("Coffre illisible.");
  return unseal(sealed, password);
}

export async function saveVault(session: Session, data: VaultData) {
  localStorage.setItem(KEY, JSON.stringify(await seal(session, { ...data, updatedAt: new Date().toISOString() })));
}

/** Change le mot de passe (nouveau sel, nouvelle clé). */
export async function changePassword(data: VaultData, newPassword: string): Promise<Session> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const session = { key: await derive(newPassword, salt), salt };
  await saveVault(session, data);
  return session;
}

/** Contenu chiffré à sauvegarder dans un fichier (lisible seulement avec le mot de passe). */
export const exportVault = () => localStorage.getItem(KEY);

/** Importe un fichier de sauvegarde : vérifie le mot de passe avant de remplacer le coffre local. */
export async function importVault(text: string, password: string) {
  let sealed: unknown;
  try { sealed = JSON.parse(text); } catch { throw new Error("Fichier de sauvegarde invalide."); }
  if (!isSealed(sealed)) throw new Error("Fichier de sauvegarde invalide.");
  const res = await unseal(sealed, password);
  await saveVault(res.session, res.data);
  return res;
}

export const deleteVault = () => localStorage.removeItem(KEY);
