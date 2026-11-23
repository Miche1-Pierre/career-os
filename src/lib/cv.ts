/**
 * Structured CV (spec v2, P5). Pure and client-safe.
 *
 * Entries (an experience, a project, a degree…) are reusable blocks in one language. A variant (« AI Product (FR) »,
 * « Founding (EN) »…) is a full CV: header, sections in order, the entries it shows, its skills lines. The PDF is made
 * by a fixed template, without AI: same content, same PDF.
 */
import { z } from "zod";

export const CV_SECTIONS = ["EXPERIENCE", "PROJECT", "EDUCATION"] as const;
export type CvSection = (typeof CV_SECTIONS)[number];
export const CV_SECTION_LABEL: Record<CvSection, string> = { EXPERIENCE: "Expérience", PROJECT: "Projets", EDUCATION: "Formation et certifications" };

export const CV_LANGS = ["fr", "en"] as const;
export type CvLang = (typeof CV_LANGS)[number];

const line = (max = 400) => z.string().trim().max(max);

export const cvEntryInputSchema = z.object({
  section: z.enum(CV_SECTIONS),
  lang: z.enum(CV_LANGS),
  /** Same position / project / degree in another language or wording. */
  group: line(80).nullable().optional(),
  title: line(300).min(1),
  dates: line(120).nullable().optional(),
  subtitle: line(300).nullable().optional(),
  bullets: z.array(line(1200).min(1)).max(12).default([]),
});
export type CvEntryInput = z.input<typeof cvEntryInputSchema>;

export const cvHeaderSchema = z.object({
  name: line(120).min(1),
  title: line(200).default(""),
  /** Left block under the name (location, phone | email…). */
  lines: z.array(line(200)).max(4).default([]),
  /** Right block (LinkedIn, GitHub, site), shown as links. */
  links: z.array(line(200)).max(4).default([]),
});
export type CvHeader = z.infer<typeof cvHeaderSchema>;

export const cvBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), title: line(80).min(1), aside: line(200).nullable().optional(), text: line(3000).nullable().optional() }),
  z.object({ kind: z.literal("ENTRIES"), title: line(80).min(1), aside: line(200).nullable().optional(), entries: z.array(z.string().uuid()).max(30).default([]) }),
  z.object({
    kind: z.literal("SKILLS"),
    title: line(80).min(1),
    aside: line(200).nullable().optional(),
    lines: z.array(z.object({ label: line(120).min(1), text: line(1000) })).max(12).default([]),
    /** 2 = grid of label-above-text cells (like the général CVs). */
    columns: z.union([z.literal(1), z.literal(2)]).default(1),
  }),
  z.object({ kind: z.literal("BULLETS"), title: line(80).min(1), aside: line(200).nullable().optional(), bullets: z.array(line(1200).min(1)).max(15).default([]) }),
]);
export type CvBlock = z.infer<typeof cvBlockSchema>;

export const cvStyleSchema = z.object({
  /** BOLD_ITALIC: whole entry title bold italic. ROLE_BOLD: the part up to the first comma in bold, the rest regular. */
  titleStyle: z.enum(["BOLD_ITALIC", "ROLE_BOLD"]).default("BOLD_ITALIC"),
  /** First text section (profile) in italic. */
  summaryItalic: z.boolean().default(false),
});
export type CvStyle = z.infer<typeof cvStyleSchema>;

/** Splits an entry title for the ROLE_BOLD style: "Head of Engineering," + " Acme, Lyon". Pure. */
export function splitRole(title: string): [string, string] {
  const i = title.indexOf(",");
  return i < 0 ? [title, ""] : [title.slice(0, i + 1), title.slice(i + 1)];
}

export const cvVariantInputSchema = z.object({
  name: line(120).min(1),
  lang: z.enum(CV_LANGS),
  /** File name of the exported PDF (the export date is added). */
  fileName: line(160).regex(/^[\w .()-]+\.pdf$/i, "Nom de fichier PDF attendu").nullable().optional(),
  header: cvHeaderSchema,
  sections: z.array(cvBlockSchema).max(12).default([]),
  style: cvStyleSchema.prefault({}),
  template: z.enum(["classic"]).default("classic"),
});
export type CvVariantInput = z.input<typeof cvVariantInputSchema>;
export type CvVariantData = z.infer<typeof cvVariantInputSchema>;

export interface CvEntryView {
  id: string;
  section: CvSection;
  lang: CvLang;
  group: string | null;
  title: string;
  dates: string | null;
  subtitle: string | null;
  bullets: string[];
}

/** File-safe version of a CV name: "CV Camille Martin (AI)" → "CV-Camille-Martin-(AI)". Pure. */
export function fileBase(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.pdf$/i, "")
    .replace(/[^\w.()-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "CV";
}

/** File name of an export: the CV's name ("CV-Camille-Martin-Product-FR.pdf"); versions live in Documents. Pure. */
export function exportFileName(variant: { name: string; fileName?: string | null }): string {
  return `${fileBase(variant.fileName || variant.name)}.pdf`;
}

/** Entries referenced by a variant that no longer exist (shown as a warning, skipped in the PDF). Pure. */
export function missingEntries(sections: CvBlock[], known: Set<string>): string[] {
  return sections.flatMap((s) => (s.kind === "ENTRIES" ? s.entries.filter((id) => !known.has(id)) : []));
}

/** "**bold**" markers (the template renders them in bold). Pure. */
export function boldRuns(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

export const stripBold = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1");

/** Text of a variant, for search, AI adaptation and plain-text copies. Pure. */
export function variantPlainText(v: { header: CvHeader; sections: CvBlock[] }, entries: Map<string, CvEntryView>): string {
  const out = [v.header.name, v.header.title, ...v.header.lines, ...v.header.links, ""];
  for (const s of v.sections) {
    out.push(`${s.title}${s.aside ? ` (${s.aside})` : ""}`);
    if (s.kind === "TEXT" && s.text) out.push(s.text);
    if (s.kind === "SKILLS") for (const l of s.lines) out.push(`${l.label}: ${l.text}`);
    if (s.kind === "BULLETS") for (const b of s.bullets) out.push(`- ${stripBold(b)}`);
    if (s.kind === "ENTRIES")
      for (const id of s.entries) {
        const e = entries.get(id);
        if (!e) continue;
        out.push(`${e.title}${e.dates ? ` (${e.dates})` : ""}`);
        if (e.subtitle) out.push(e.subtitle);
        for (const b of e.bullets) out.push(`- ${stripBold(b)}`);
      }
    out.push("");
  }
  return out.join("\n").trim();
}
