/**
 * Pure, client-safe part of "Importer depuis un CV": the proposal shape returned by the server, the default review
 * choices and the merge of the accepted fields into the profile.
 */
import type { Profile } from "./schemas";
import { normalizeText } from "./text";

/** Server Actions accept 4 MB bodies (next.config.ts), multipart overhead included. */
export const CV_MAX_BYTES = 4 * 1024 * 1024 - 64 * 1024;

export const PROFILE_TEXT_FIELDS = ["fullName", "email", "phone", "location", "headline", "summary"] as const;
export const PROFILE_LIST_FIELDS = ["skills", "languages", "education", "targetRoles", "targetDomains", "preferredLocations", "dealBreakers"] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];
export type ProfileListField = (typeof PROFILE_LIST_FIELDS)[number];

export const PROFILE_FIELD_LABELS: Record<keyof Profile, string> = {
  fullName: "Nom complet",
  email: "E-mail",
  phone: "Téléphone",
  location: "Ville",
  headline: "Titre",
  summary: "Résumé",
  yearsOfExperience: "Années d’expérience",
  skills: "Compétences et technologies",
  skillGroups: "Catégories de compétences",
  languages: "Langues",
  education: "Formation",
  targetRoles: "Postes visés",
  targetDomains: "Domaines visés",
  preferredLocations: "Lieux souhaités",
  dealBreakers: "Critères rédhibitoires",
};

export interface CvProposal {
  /** Proposed values; "" / null / [] = not found in the CV. */
  proposed: Pick<Profile, ProfileTextField | ProfileListField> & { yearsOfExperience: number | null };
  /** Values that could not be found in the CV text (to double-check before accepting). */
  unverified: { text: ProfileTextField[]; yearsOfExperience: boolean; items: Partial<Record<ProfileListField, string[]>> };
  warnings: string[];
  meta: { provider: string; model: string | null; promptVersion: string; durationMs: number; characters: number; truncated: boolean; pageCount: number | null };
}

export interface CvListChoice {
  accept: boolean;
  /** merge = keep current values and add the new ones; replace = only the included proposed values. */
  mode: "merge" | "replace";
  /** Included proposed items. */
  included: string[];
}

export interface CvChoices {
  text: Record<ProfileTextField, boolean>;
  years: boolean;
  lists: Record<ProfileListField, CvListChoice>;
}

/** Same list item, ignoring case, accents and spacing ("Français (natif)" = "Francais (natif)"). */
export const sameItem = (a: string, b: string) => normalizeText(a) === normalizeText(b);

/** Trimmed, non-empty, without duplicates in the sense of sameItem (first spelling wins). */
export function dedupeItems(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = value.trim();
    const key = normalizeText(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Default review: fill empty fields, add new list items (merge), never overwrite what the user wrote, and leave out
 * anything that was not found in the CV text.
 */
export function initialCvChoices(current: Profile, proposal: CvProposal): CvChoices {
  const { proposed, unverified } = proposal;
  const text = {} as CvChoices["text"];
  for (const key of PROFILE_TEXT_FIELDS) text[key] = !!proposed[key] && !current[key].trim() && !unverified.text.includes(key);
  const lists = {} as CvChoices["lists"];
  for (const key of PROFILE_LIST_FIELDS) {
    const flagged = unverified.items[key] ?? [];
    const included = proposed[key].filter((item) => !flagged.includes(item));
    const adds = included.filter((item) => !current[key].some((c) => sameItem(c, item)));
    lists[key] = { accept: adds.length > 0, mode: "merge", included };
  }
  const years = proposed.yearsOfExperience != null && current.yearsOfExperience == null && !unverified.yearsOfExperience;
  return { text, years, lists };
}

/** Profile after applying the accepted proposals. Empty proposals never clear a field. */
export function applyCvChoices(current: Profile, proposal: CvProposal, choices: CvChoices): Profile {
  const next: Profile = { ...current };
  for (const key of PROFILE_TEXT_FIELDS) if (choices.text[key] && proposal.proposed[key]) next[key] = proposal.proposed[key];
  if (choices.years && proposal.proposed.yearsOfExperience != null) next.yearsOfExperience = proposal.proposed.yearsOfExperience;
  for (const key of PROFILE_LIST_FIELDS) {
    const c = choices.lists[key];
    if (!c.accept || !c.included.length) continue;
    next[key] = c.mode === "replace" ? dedupeItems(c.included) : dedupeItems([...current[key], ...c.included]);
  }
  return next;
}

/** Number of profile fields that differ. */
export function countProfileChanges(current: Profile, next: Profile): number {
  return (Object.keys(next) as (keyof Profile)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k])).length;
}
