"use client";

import { useAppData } from "@/components/app/app-data";
import { convert, needsConversion } from "@/lib/fx";
import { formatISODate } from "@/lib/dates";
import { money, signedMoney } from "@/components/moves/format";
import { cn } from "@/lib/utils";

/**
 * Indicative conversion of an amount into the user's currency ("≈ 1 234 €"), from the ECB rates. Renders nothing
 * when the amount is already in the user's currency or when no rate is known.
 */
export function Approx({ amount, currency, signed = false, className }: { amount: number | null | undefined; currency: string; signed?: boolean; className?: string }) {
  const { currency: home, fx, dateLocale } = useAppData();
  if (amount === null || amount === undefined || !fx || !needsConversion(currency, home, fx)) return null;
  const value = convert(amount, currency, home, fx);
  if (value === null) return null;
  return (
    <span className={cn("text-xs font-normal text-muted-foreground tabular-nums", className)} title={`Conversion indicative, taux BCE du ${formatISODate(fx.date, "medium", dateLocale)}`}>
      ≈ {signed ? signedMoney(value, home) : money(value, home)}
    </span>
  );
}

/** "1 CHF ≈ 1,07 € · taux BCE du 21 nov. 2026", or null when no conversion applies. */
export function useRateLabel(currency: string | null | undefined): string | null {
  const { currency: home, fx, dateLocale } = useAppData();
  if (!currency || !fx || !needsConversion(currency, home, fx)) return null;
  const one = convert(1, currency, home, fx)!;
  const digits = one >= 10 ? 2 : one >= 0.1 ? 3 : 5;
  let rate: string;
  try {
    rate = new Intl.NumberFormat(dateLocale, { style: "currency", currency: home, maximumFractionDigits: digits }).format(one);
  } catch {
    rate = `${one.toFixed(digits)} ${home}`;
  }
  return `1 ${currency.toUpperCase()} ≈ ${rate} · taux BCE du ${formatISODate(fx.date, "medium", dateLocale)}`;
}
