"use client";
import { useEffect, useRef, useState } from "react";

/** Tirer vers le bas en haut de page pour actualiser (téléphone). Renvoie la distance tirée (0–100). */
export function usePullToRefresh(onRefresh: () => void, threshold = 80): number {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    let current = 0;
    const down = (e: TouchEvent) => { start.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      current = Math.max(0, Math.min(120, e.touches[0].clientY - start.current));
      setPull(current);
    };
    const up = () => {
      if (start.current != null && current >= threshold) cb.current();
      start.current = null; current = 0; setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, [threshold]);
  return pull;
}
