/**
 * Deterministic skill overlap between an opportunity and the user's profile (no AI, instant, explainable).
 */
import { normalizeText } from "./text";

const ALIASES: Record<string, string> = {
  js: "javascript",
  "java script": "javascript",
  ts: "typescript",
  "node": "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  reactjs: "react",
  "react.js": "react",
  "react js": "react",
  "vue.js": "vue",
  vuejs: "vue",
  "next": "next.js",
  nextjs: "next.js",
  postgres: "postgresql",
  psql: "postgresql",
  k8s: "kubernetes",
  "google cloud": "gcp",
  "google cloud platform": "gcp",
  "amazon web services": "aws",
  "ms azure": "azure",
  "c sharp": "c#",
  csharp: "c#",
  golang: "go",
  "spring boot": "spring",
  springboot: "spring",
  ml: "machine learning",
  "apprentissage automatique": "machine learning",
  dl: "deep learning",
  ia: "ai",
  "intelligence artificielle": "ai",
  "artificial intelligence": "ai",
  llm: "llms",
  "large language models": "llms",
  "ci cd": "ci/cd",
  cicd: "ci/cd",
  "product owner": "product ownership",
  po: "product ownership",
  "gestion de produit": "product management",
  "bio informatique": "bioinformatics",
  bioinformatique: "bioinformatics",
  "rest api": "rest",
  "restful": "rest",
  "saas b2b": "saas",
  anglais: "english",
  francais: "french",
};

export function canonicalSkill(value: string): string {
  const n = normalizeText(value)
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[n] ?? n;
}

export interface SkillMatch {
  matched: string[];
  missing: string[];
  coverage: number | null;
}

export function computeSkillMatch(required: string[], profileSkills: string[]): SkillMatch {
  const profile = new Set(profileSkills.map(canonicalSkill));
  const profileList = [...profile];
  const seen = new Set<string>();
  const matched: string[] = [];
  const missing: string[] = [];
  for (const raw of required) {
    const c = canonicalSkill(raw);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const hit = profile.has(c) || profileList.some((p) => (p.length > 3 && c.includes(p)) || (c.length > 3 && p.includes(c)));
    (hit ? matched : missing).push(raw);
  }
  const total = matched.length + missing.length;
  return { matched, missing, coverage: total ? Math.round((matched.length / total) * 100) : null };
}
