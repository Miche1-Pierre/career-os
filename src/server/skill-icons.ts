/**
 * Brand icons of technologies and tools (simple-icons, CC0), looked up by skill name. Server-only: the full icon set
 * stays out of the client bundle; pages pass the few icons they need.
 */
import data from "simple-icons/icons.json";
import { normalizeText } from "@/lib/text";

export interface SkillIcon {
  slug: string;
  title: string;
  hex: string;
  path: string;
}

interface IconMeta {
  title: string;
  slug: string;
  hex: string;
  aliases?: { aka?: string[]; dup?: { title: string }[]; loc?: Record<string, string> };
}

/** Common spellings that differ from the simple-icons title. */
const ALIASES: Record<string, string> = {
  java: "openjdk",
  "react native": "react",
  ghcr: "github",
  "github container registry": "github",
  oidc: "openid",
  "oauth2/oidc": "openid",
  "oauth2 / oidc": "openid",
  "openid connect": "openid",
  sonarqube: "sonarqubeserver",
  sonar: "sonarqubeserver",
  mcp: "modelcontextprotocol",
  "claude code": "claude",
  gitflow: "git",
  "git flow": "git",
  "owasp zap": "owasp",
  junit: "junit5",
  "junit 5": "junit5",
  postgres: "postgresql",
  node: "nodedotjs",
  nodejs: "nodedotjs",
  nextjs: "nextdotjs",
  "next.js / react": "nextdotjs",
  "spring": "spring",
  k8s: "kubernetes",
  "hugging face": "huggingface",
  ts: "typescript",
  js: "javascript",
};

const key = (s: string) => normalizeText(s).replace(/\s+/g, " ").trim();

let index: Map<string, IconMeta> | null = null;
let bySlug: Map<string, IconMeta> | null = null;

function load() {
  if (index && bySlug) return { index, bySlug };
  index = new Map();
  bySlug = new Map();
  for (const icon of data as IconMeta[]) {
    bySlug.set(icon.slug, icon);
    for (const name of [icon.title, icon.slug, ...(icon.aliases?.aka ?? [])]) {
      const k = key(name);
      if (k && !index.has(k)) index.set(k, icon);
    }
  }
  return { index, bySlug };
}

let paths: Record<string, { path: string }> | null = null;

async function iconPath(slug: string): Promise<string | null> {
  if (!paths) {
    const mod = (await import("simple-icons")) as unknown as Record<string, { slug?: string; path?: string }>;
    paths = {};
    for (const value of Object.values(mod)) if (value && typeof value === "object" && value.slug && value.path) paths[value.slug] = { path: value.path };
  }
  return paths[slug]?.path ?? null;
}

function findMeta(skill: string): IconMeta | null {
  const { index, bySlug } = load();
  const candidates = [key(skill), key(skill).replace(/\s*v?\d+(\.\d+)*$/, "")];
  for (const c of candidates) {
    if (!c) continue;
    const alias = ALIASES[c];
    if (alias && bySlug.get(alias)) return bySlug.get(alias)!;
    const hit = index.get(c);
    if (hit) return hit;
  }
  return null;
}

/** Icon of each skill that has one (skills without a known brand are left out). */
export async function skillIcons(skills: string[]): Promise<Record<string, SkillIcon>> {
  const out: Record<string, SkillIcon> = {};
  for (const skill of skills) {
    const meta = findMeta(skill);
    if (!meta) continue;
    const path = await iconPath(meta.slug);
    if (path) out[skill] = { slug: meta.slug, title: meta.title, hex: meta.hex, path };
  }
  return out;
}
