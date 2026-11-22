import { diceSimilarity, normalizeOrgName, normalizeTitle, normalizeUrl } from "./text";

export interface DuplicateCandidateInput {
  id: string;
  title: string;
  organizationName: string | null;
  url: string | null;
  links?: { url: string }[] | null;
}

export interface DuplicateQuery {
  title?: string | null;
  organizationName?: string | null;
  url?: string | null;
}

export interface DuplicateMatch {
  id: string;
  score: number;
  reason: string;
}

/** Threshold above which creation is blocked until the user confirms. */
export const STRONG_DUPLICATE = 0.85;
export const POSSIBLE_DUPLICATE = 0.6;

/**
 * Deterministic duplicate score between a new opportunity and an existing one.
 * - same canonical URL → 1
 * - same organization + similar title → 0.5 + 0.5 × title similarity
 * - unknown organization + near-identical title → up to 0.7
 */
export function scoreDuplicate(query: DuplicateQuery, candidate: DuplicateCandidateInput): DuplicateMatch | null {
  const qUrl = normalizeUrl(query.url);
  if (qUrl) {
    const urls = [candidate.url, ...(candidate.links ?? []).map((l) => l.url)].map(normalizeUrl).filter(Boolean);
    if (urls.includes(qUrl)) return { id: candidate.id, score: 1, reason: "Same posting URL" };
  }
  const qTitle = normalizeTitle(query.title);
  const cTitle = normalizeTitle(candidate.title);
  if (!qTitle || !cTitle) return null;
  const titleSim = diceSimilarity(qTitle, cTitle);
  const qOrg = normalizeOrgName(query.organizationName);
  const cOrg = normalizeOrgName(candidate.organizationName);
  if (qOrg && cOrg) {
    const orgSim = qOrg === cOrg ? 1 : diceSimilarity(qOrg, cOrg);
    if (orgSim < 0.85) return null;
    const score = 0.5 + 0.5 * titleSim;
    if (score < 0.6) return null;
    return {
      id: candidate.id,
      score: Math.round(score * 100) / 100,
      reason: titleSim >= 0.95 ? "Same organization and title" : "Same organization, similar title",
    };
  }
  if (titleSim >= 0.92) return { id: candidate.id, score: Math.round(titleSim * 70) / 100, reason: "Same title" };
  return null;
}

export function findDuplicateMatches(query: DuplicateQuery, candidates: DuplicateCandidateInput[], limit = 5): DuplicateMatch[] {
  return candidates
    .map((c) => scoreDuplicate(query, c))
    .filter((m): m is DuplicateMatch => !!m && m.score >= POSSIBLE_DUPLICATE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
