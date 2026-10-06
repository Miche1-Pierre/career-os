import { sql, type SQL, type AnyColumn } from "drizzle-orm";
import { escapeLike, normalizeText } from "@/lib/text";

// Character-for-character accent folding done in SQL (no extension required).
const ACCENT_PAIRS: [string, string][] = [
  ["àáâãäåā", "a"],
  ["çćč", "c"],
  ["èéêëēėę", "e"],
  ["ìíîïīį", "i"],
  ["ñń", "n"],
  ["òóôõöøō", "o"],
  ["ùúûüū", "u"],
  ["ýÿ", "y"],
  ["žźż", "z"],
  ["šś", "s"],
  ["ł", "l"],
];
export const ACCENTS_FROM = ACCENT_PAIRS.map(([chars]) => chars).join("");
export const ACCENTS_TO = ACCENT_PAIRS.map(([chars, base]) => base.repeat(chars.length)).join("");

export function foldedLower(column: AnyColumn | SQL): SQL {
  return sql`translate(lower(coalesce(${column}::text, '')), ${ACCENTS_FROM}, ${ACCENTS_TO})`;
}

/** Accent- and case-insensitive "contains" condition. */
export function normalizedContains(column: AnyColumn | SQL, query: string): SQL {
  const pattern = `%${escapeLike(normalizeText(query))}%`;
  return sql`${foldedLower(column)} like ${pattern}`;
}

/** Accent- and case-insensitive equality. */
export function normalizedEquals(column: AnyColumn | SQL, value: string): SQL {
  return sql`${foldedLower(column)} = ${normalizeText(value)}`;
}
