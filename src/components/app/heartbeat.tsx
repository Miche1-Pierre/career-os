"use client";

import { useEffect } from "react";

/**
 * Tells the server a Career OS page is open (every minute, and when the tab comes back to the front). The Microsoft
 * Store install has no window of its own: it stops once no page has checked in for a while (scripts/start-local.mjs).
 */
export function Heartbeat() {
  useEffect(() => {
    const beat = () => void fetch("/api/health?beat=1", { cache: "no-store" }).catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    beat();
    const timer = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
