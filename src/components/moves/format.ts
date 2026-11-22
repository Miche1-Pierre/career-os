import { LISTING_STATUS_META, type FitLevel, type ListingStatus } from "@/lib/relocation";

export function money(amount: number | null | undefined, currency = "EUR", locale = "fr-FR") {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "–";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

export function signedMoney(amount: number, currency = "EUR", locale = "fr-FR") {
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${money(Math.abs(amount), currency, locale)}`;
}

export const STATUS_BADGE: Record<(typeof LISTING_STATUS_META)[ListingStatus]["tone"], "default" | "info" | "highlight" | "destructive" | "success" | "outline"> = {
  neutral: "default",
  info: "info",
  highlight: "highlight",
  warning: "destructive",
  success: "success",
  muted: "outline",
};

export const FIT_ORDER: Record<FitLevel, number> = { ok: 0, unknown: 1, warn: 2, ko: 3 };

export function savingsTone(savings: number | null | undefined) {
  if (savings === null || savings === undefined) return "text-muted-foreground";
  if (savings >= 250) return "text-emerald-700 dark:text-emerald-300";
  if (savings >= 100) return "text-warning-700";
  return "text-destructive";
}

export function mapsDirections(from: string | null, to: string | null, mode: "walking" | "transit" = "walking") {
  if (!to) return null;
  const p = new URLSearchParams({ api: "1", destination: to, travelmode: mode });
  if (from) p.set("origin", from);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
