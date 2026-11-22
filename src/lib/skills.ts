/**
 * Skill categories of the profile. Pure and client-safe.
 *
 * `profile.skills` stays the flat list every consumer reads (offer matching, AI analyses, MCP). `profile.skillGroups`
 * only stores how the user arranges them. Skills that no group mentions (added by the MCP tools or a CV import) land
 * in the category guessed from their name, or in "Autres".
 */
import { normalizeText } from "./text";

export interface SkillGroup {
  name: string;
  skills: string[];
}

export const OTHER_GROUP = "Autres";

/** Default categories, in display order, with the words that send a skill there. */
export const SKILL_CATEGORIES: { name: string; icon: SkillCategoryIcon; keywords: string[] }[] = [
  {
    name: "IA & systèmes d'IA",
    icon: "ai",
    keywords: ["llm", "agent", "rag", "mcp", "embedding", "ia", "ai", "ml", "dl", "machine learning", "deep learning", "nlp", "langchain", "openai", "claude", "anthropic", "prompt", "vector", "pytorch", "tensorflow", "hugging face", "mistral", "gemini"],
  },
  {
    name: "Ingénierie logicielle",
    icon: "code",
    keywords: [
      "java", "spring", "python", "node", "typescript", "javascript", "react", "next", "angular", "vue", "svelte", "kotlin", "swift", "go", "rust", "c#", "net", "php", "symfony", "laravel", "django", "flask", "fastapi", "express", "nestjs", "tailwind", "html", "css", "sql", "graphql", "api", "rest",
      "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "sqlite", "kafka", "spark", "pandas", "numpy",
      "ddd", "domain driven", "clean architecture", "hexagonal", "multi tenant", "microservice",
    ],
  },
  {
    name: "Product engineering",
    icon: "product",
    keywords: ["architecture", "produit", "product", "feature", "cadrage", "workflow", "conception", "production", "saas", "roadmap", "mvp"],
  },
  {
    name: "Sécurité & infrastructure",
    icon: "infra",
    keywords: ["oauth", "oauth2", "oidc", "keycloak", "rbac", "owasp", "docker", "kubernetes", "k8s", "github actions", "gitlab", "ghcr", "nginx", "ci", "cd", "aws", "azure", "gcp", "oracle cloud", "terraform", "linux", "sécurité", "security", "devops"],
  },
  {
    name: "Qualité & outils",
    icon: "tools",
    keywords: ["tdd", "test", "junit", "jest", "vitest", "playwright", "cypress", "sonar", "sonarqube", "git", "gitflow", "cursor", "claude code", "vs code", "jira", "figma", "postman", "notion"],
  },
  {
    name: "Réglementaire",
    icon: "regulatory",
    keywords: ["cfr", "gamp", "rgpd", "gdpr", "iso", "hds", "hipaa", "gxp", "conformité", "compliance", "audit"],
  },
];

export type SkillCategoryIcon = "ai" | "code" | "product" | "infra" | "tools" | "regulatory" | "other";

const key = (s: string) => normalizeText(s).trim();

function words(s: string): string[] {
  return key(s)
    .split(/[^a-z0-9#+]+/)
    .filter(Boolean);
}

/** True when `needle` appears in `tokens` as consecutive whole words (a trailing plural "s" is tolerated). */
function containsWords(tokens: string[], needle: string[]): boolean {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= tokens.length; i++) {
    if (needle.every((w, j) => tokens[i + j] === w || tokens[i + j] === `${w}s`)) return true;
  }
  return false;
}

/**
 * Category guessed from a skill's name, or null. Whole words only ("ia" must not match "Keycloak"); the longest
 * keyword wins ("Claude Code" is a tool, "Claude" alone is AI).
 */
export function guessSkillCategory(skill: string): string | null {
  const tokens = words(skill);
  let best: { name: string; length: number } | null = null;
  for (const category of SKILL_CATEGORIES) {
    for (const k of category.keywords) {
      const needle = words(k);
      const length = needle.join(" ").length;
      if (containsWords(tokens, needle) && (!best || length > best.length)) best = { name: category.name, length };
    }
  }
  return best?.name ?? null;
}

export function categoryIcon(name: string): SkillCategoryIcon {
  return SKILL_CATEGORIES.find((c) => c.name === name)?.icon ?? "other";
}

/**
 * Groups to display: the user's groups restricted to the skills still in `skills`, then every other skill in its
 * guessed category (an existing group with that name, else a new one), then "Autres". Empty groups are dropped
 * unless `keepEmpty` (editor: a category just created).
 */
export function groupSkills(skills: string[], groups: SkillGroup[] = [], options: { keepEmpty?: boolean } = {}): SkillGroup[] {
  const present = new Map(skills.map((s) => [key(s), s]));
  const placed = new Set<string>();
  const result: SkillGroup[] = [];
  for (const g of groups) {
    const items: string[] = [];
    for (const s of g.skills) {
      const k = key(s);
      if (present.has(k) && !placed.has(k)) {
        items.push(present.get(k)!);
        placed.add(k);
      }
    }
    result.push({ name: g.name, skills: items });
  }
  for (const s of skills) {
    const k = key(s);
    if (placed.has(k)) continue;
    placed.add(k);
    const name = guessSkillCategory(s) ?? OTHER_GROUP;
    let group = result.find((g) => key(g.name) === key(name));
    if (!group) {
      group = { name, skills: [] };
      result.push(group);
    }
    group.skills.push(s);
  }
  return options.keepEmpty ? result : result.filter((g) => g.skills.length > 0);
}

/** Flat skill list of a layout (first occurrence wins). */
export function flattenSkillGroups(groups: SkillGroup[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    for (const s of g.skills) {
      const k = key(s);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(s.trim());
    }
  }
  return out;
}
