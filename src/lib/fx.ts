/**
 * Indicative currency conversion (spec v2 § 5, P6) from the euro reference rates of the European Central Bank,
 * published every working day. Rates read "1 EUR = x <currency>". Pure and client-safe: only for comparing amounts,
 * never for a real payment.
 */

export interface FxRates {
  /** Date of the ECB publication (YYYY-MM-DD). */
  date: string;
  /** 1 EUR = rates[code] units of `code` (EUR itself is implied). */
  rates: Record<string, number>;
}

/** Currencies offered in the forms (all published by the ECB). Any other ISO 4217 code still works without conversion. */
export const CURRENCIES = ["EUR", "CHF", "GBP", "USD", "CAD", "AUD", "NZD", "JPY", "SGD", "HKD", "CNY", "SEK", "DKK", "NOK", "ISK", "PLN", "CZK", "HUF", "RON"] as const;

/** Parses the ECB daily XML (eurofxref-daily.xml). Null when the document has no date or no rate. */
export function parseEcbRates(xml: string): FxRates | null {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) return null;
  const rates: Record<string, number> = {};
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g)) {
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0) rates[m[1]] = rate;
  }
  return Object.keys(rates).length ? { date, rates } : null;
}

function perEuro(code: string, fx: FxRates): number | null {
  const c = code.toUpperCase();
  if (c === "EUR") return 1;
  return fx.rates[c] ?? null;
}

/** Converts an amount between two currencies through the euro. Null when a rate is missing. */
export function convert(amount: number, from: string, to: string, fx: FxRates | null | undefined): number | null {
  if (from.toUpperCase() === to.toUpperCase()) return amount;
  if (!fx) return null;
  const a = perEuro(from, fx);
  const b = perEuro(to, fx);
  if (a === null || b === null) return null;
  return (amount / a) * b;
}

/** Whether amounts in `currency` deserve a converted hint for a user who thinks in `home`. */
export function needsConversion(currency: string | null | undefined, home: string, fx: FxRates | null | undefined): boolean {
  if (!currency || currency.toUpperCase() === home.toUpperCase()) return false;
  return convert(1, currency, home, fx) !== null;
}
