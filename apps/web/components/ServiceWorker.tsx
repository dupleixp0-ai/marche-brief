"use client";
import { useEffect } from "react";

// Enregistre le service worker en production uniquement (évite les conflits avec le serveur de dev).
// Mise à jour : vérifie une nouvelle version à chaque retour dans l'application et recharge une fois
// quand elle prend le relais (sinon l'application installée garde l'ancienne page).
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onChange = () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, updateViaCache: "none" })
      .then((r) => { reg = r; r.update().catch(() => {}); }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === "visible") reg?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
