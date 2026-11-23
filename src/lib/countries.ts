/**
 * Destination countries known by the app (spec v2 § 9, P6): French name and local currency, so a move gets the right
 * currency as soon as its country is typed. Pure and client-safe. Adding a country = one line here (plus, if useful,
 * a procedure template and discovery sources).
 */
import { countryCode } from "./procedures";

export interface CountryInfo {
  code: string;
  name: string;
  currency: string;
}

export const COUNTRIES: CountryInfo[] = [
  { code: "FR", name: "France", currency: "EUR" },
  { code: "BE", name: "Belgique", currency: "EUR" },
  { code: "LU", name: "Luxembourg", currency: "EUR" },
  { code: "CH", name: "Suisse", currency: "CHF" },
  { code: "NL", name: "Pays-Bas", currency: "EUR" },
  { code: "DE", name: "Allemagne", currency: "EUR" },
  { code: "GB", name: "Royaume-Uni", currency: "GBP" },
  { code: "IE", name: "Irlande", currency: "EUR" },
  { code: "ES", name: "Espagne", currency: "EUR" },
  { code: "PT", name: "Portugal", currency: "EUR" },
  { code: "IT", name: "Italie", currency: "EUR" },
  { code: "AT", name: "Autriche", currency: "EUR" },
  { code: "DK", name: "Danemark", currency: "DKK" },
  { code: "SE", name: "Suède", currency: "SEK" },
  { code: "NO", name: "Norvège", currency: "NOK" },
  { code: "PL", name: "Pologne", currency: "PLN" },
  { code: "CZ", name: "Tchéquie", currency: "CZK" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "US", name: "États-Unis", currency: "USD" },
  { code: "AU", name: "Australie", currency: "AUD" },
  { code: "NZ", name: "Nouvelle-Zélande", currency: "NZD" },
  { code: "SG", name: "Singapour", currency: "SGD" },
  { code: "JP", name: "Japon", currency: "JPY" },
];

/** Country of a free-text name or ISO code ("Suisse", "switzerland", "CH"), or null. */
export function countryInfo(name: string | null | undefined): CountryInfo | null {
  const code = countryCode(name);
  return code ? (COUNTRIES.find((c) => c.code === code) ?? null) : null;
}
