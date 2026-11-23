/**
 * Free-form CV layouts (the Canva-like editor). A design is a stack of A4 pages holding absolutely positioned
 * elements in PDF points (1 pt = 1/72 in): text boxes (auto height), lines and rectangles. The same design is drawn
 * in the browser (HTML, 1 CSS px = 1 pt, then scaled) and in the PDF (@react-pdf, real text an ATS can read).
 * Pure and client-safe: layout of existing CVs, alignment guides and Claude's edit operations live here, tested.
 */
import { z } from "zod";
import { splitRole, type CvBlock, type CvEntryView, type CvHeader, type CvStyle } from "./cv";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

export const FONTS = ["gelasio", "helvetica", "times"] as const;
export type FontKey = (typeof FONTS)[number];
export const FONT_LABEL: Record<FontKey, string> = { gelasio: "Gelasio (serif)", helvetica: "Helvetica", times: "Times" };
/** Browser families with the same metrics as the PDF fonts (Arial ≈ Helvetica, Times New Roman ≈ Times). */
export const FONT_CSS: Record<FontKey, string> = {
  gelasio: "Gelasio, Georgia, serif",
  helvetica: "Helvetica, Arial, sans-serif",
  times: '"Times New Roman", Times, serif',
};

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur #rrggbb");
const coord = z.number().min(-2000).max(4000);

export const textStyleSchema = z.object({
  font: z.enum(FONTS).default("gelasio"),
  size: z.number().min(4).max(96).default(9.2),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  color: color.default("#111111"),
  align: z.enum(["left", "center", "right", "justify"]).default("left"),
  lineHeight: z.number().min(0.8).max(3).default(1.25),
  letterSpacing: z.number().min(-2).max(20).default(0),
  uppercase: z.boolean().default(false),
  /** Space after each paragraph (pt). */
  paraSpacing: z.number().min(0).max(40).default(0),
});
export type TextStyle = z.infer<typeof textStyleSchema>;

const base = {
  id: z.string().min(1).max(40),
  x: coord,
  y: coord,
  w: z.number().min(2).max(2000),
  locked: z.boolean().optional(),
  /** What the element is for (« name », « heading », « entry-title »…), a hint for Claude. */
  role: z.string().max(40).optional(),
};

export const textElementSchema = z.object({
  ...base,
  type: z.literal("text"),
  /** Paragraphs separated by line breaks; **bold**, *italic*, [label](https://…). */
  text: z.string().max(8000),
  style: textStyleSchema.prefault({}),
  list: z.enum(["none", "dash", "bullet"]).default("none"),
  /** Height measured in the editor (text boxes grow with their content). */
  h: z.number().min(0).max(4000).optional(),
});
export const lineElementSchema = z.object({ ...base, type: z.literal("line"), h: z.number().min(0.2).max(20).default(0.6), color: color.default("#9a9a9a") });
export const rectElementSchema = z.object({
  ...base,
  type: z.literal("rect"),
  h: z.number().min(1).max(4000),
  fill: color.nullable().default("#eef2ff"),
  stroke: color.nullable().default(null),
  strokeWidth: z.number().min(0).max(20).default(0),
  radius: z.number().min(0).max(200).default(0),
});
export const designElementSchema = z.discriminatedUnion("type", [textElementSchema, lineElementSchema, rectElementSchema]);
export type TextElement = z.infer<typeof textElementSchema>;
export type LineElement = z.infer<typeof lineElementSchema>;
export type RectElement = z.infer<typeof rectElementSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;

export const designPageSchema = z.object({ id: z.string().min(1).max(40), elements: z.array(designElementSchema).max(400) });
export const cvDesignSchema = z.object({ version: z.literal(1), pages: z.array(designPageSchema).min(1).max(6) });
export type CvDesign = z.infer<typeof cvDesignSchema>;
export type DesignPage = z.infer<typeof designPageSchema>;

let counter = 0;
/** Short unique id for new elements. */
export function newId(prefix = "e") {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Height used for layout maths: text boxes use their measured height, the others their own. */
export function heightOf(el: DesignElement): number {
  if (el.type === "text") return el.h ?? el.style.size * el.style.lineHeight;
  return el.h;
}

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  href: string | null;
}

const TOKEN = /\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g;

/** One paragraph of markup as runs. Pure. */
export function parseRuns(line: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index! > last) runs.push({ text: line.slice(last, m.index), bold: false, italic: false, href: null });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true, italic: false, href: null });
    else if (m[2] !== undefined) runs.push({ text: m[2], bold: false, italic: true, href: null });
    else runs.push({ text: m[3], bold: false, italic: false, href: m[4] });
    last = m.index! + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false, italic: false, href: null });
  return runs.length ? runs : [{ text: "", bold: false, italic: false, href: null }];
}

/** Paragraphs of a text element. Pure. */
export function paragraphs(text: string): Run[][] {
  return text.split("\n").map(parseRuns);
}

/** Text without markup (what an ATS reads, what Claude compares). Pure. */
export function plainText(text: string): string {
  return paragraphs(text)
    .map((p) => p.map((r) => r.text).join(""))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Layout of an existing (structured) CV: reproduces the classic template
// ---------------------------------------------------------------------------

export interface FlowInput {
  header: CvHeader;
  sections: CvBlock[];
  entries: Map<string, CvEntryView>;
  style: CvStyle;
}

/** Measures the height of a text box (the browser in the app, an estimate in tests). */
export type Measure = (el: TextElement) => number;

function href(link: string) {
  return /^https?:\/\//i.test(link) ? link : /@/.test(link) ? `mailto:${link}` : `https://${link}`;
}

/**
 * Lays a structured CV out as free elements, top to bottom like the classic PDF template (margins, rules, entry
 * titles with right-aligned dates, dash bullets). `k` tightens fonts (×k) and spacing (×k²) to fit one page.
 */
export function layoutFromVariant(input: FlowInput, measure: Measure, k = 1): CvDesign {
  const f = (n: number) => Math.round(n * k * 100) / 100;
  const sp = (n: number) => Math.round(n * k * k * 100) / 100;
  const L = 44;
  const W = PAGE_W - 2 * L;
  const INK = "#111111";
  const MUTED = "#444444";
  const els: DesignElement[] = [];
  const text = (partial: Omit<TextElement, "type" | "id" | "style" | "list" | "h"> & { style?: Partial<TextStyle>; list?: TextElement["list"] }): TextElement => {
    const el: TextElement = {
      type: "text",
      id: newId("t"),
      list: partial.list ?? "none",
      ...partial,
      style: textStyleSchema.parse({ size: f(9.2), color: INK, ...partial.style }),
    };
    el.h = Math.round(measure(el) * 100) / 100;
    els.push(el);
    return el;
  };
  const bottom = (el: DesignElement) => el.y + heightOf(el);

  // Header: name and contact lines on the left, title and links on the right.
  let y = sp(28);
  const name = text({ role: "name", x: L, y, w: W * 0.45, text: input.header.name, style: { size: f(16.5), bold: true, lineHeight: 1.1 } });
  let left = bottom(name);
  if (input.header.lines.length) left = bottom(text({ role: "contact", x: L, y: left, w: W * 0.5, text: input.header.lines.join("\n"), style: { size: f(8.8), color: MUTED } }));
  const rightW = W * 0.68;
  let right = y;
  if (input.header.title) right = bottom(text({ role: "title", x: L + W - rightW, y, w: rightW, text: input.header.title, style: { size: f(10.5), bold: true, italic: true, align: "right" } }));
  if (input.header.links.length)
    right = bottom(text({ role: "links", x: L + W - rightW, y: right, w: rightW, text: input.header.links.map((l) => `[${l}](${href(l)})`).join("\n"), style: { size: f(8.8), color: "#1a4fd6", align: "right" } }));
  y = Math.max(left, right) + sp(4);

  const firstText = input.sections.findIndex((b) => b.kind === "TEXT" && !!b.text);
  input.sections.forEach((block, i) => {
    y += sp(6);
    const head = text({ role: "heading", x: L, y, w: W * 0.6, text: `| ${block.title}`, style: { size: f(11), bold: true } });
    if (block.aside) text({ role: "aside", x: L + W * 0.4, y: y + Math.max(0, heightOf(head) - f(9) * 1.25), w: W * 0.6, text: block.aside, style: { size: f(9), italic: true, color: MUTED, align: "right" } });
    y = bottom(head) + sp(1.5);
    els.push({ type: "line", id: newId("l"), role: "rule", x: L, y, w: W, h: 0.6, color: "#9a9a9a" });
    y += 0.6 + sp(3.5);

    if (block.kind === "TEXT" && block.text) {
      y = bottom(text({ role: "summary", x: L, y, w: W, text: block.text, style: { align: "justify", italic: i === firstText && input.style.summaryItalic } }));
    } else if (block.kind === "BULLETS" && block.bullets.length) {
      y = bottom(text({ role: "bullets", x: L + 4, y, w: W - 4, text: block.bullets.join("\n"), list: "dash", style: { align: "justify" } }));
    } else if (block.kind === "SKILLS" && block.lines.length) {
      if (block.columns === 2) {
        const cw = W * 0.485;
        for (let r = 0; r < block.lines.length; r += 2) {
          const cells = block.lines.slice(r, r + 2).map((l, c) => text({ role: "skill", x: L + c * (W - cw), y, w: cw, text: `**${l.label}**\n${l.text}` }));
          y = Math.max(...cells.map(bottom)) + sp(3);
        }
      } else {
        y = bottom(text({ role: "skills", x: L, y, w: W, text: block.lines.map((l) => `**${l.label}:** ${l.text}`).join("\n"), style: { align: "justify", paraSpacing: sp(1) } }));
      }
    } else if (block.kind === "ENTRIES") {
      for (const id of block.entries) {
        const e = input.entries.get(id);
        if (!e) continue;
        const datesW = e.dates ? Math.min(150, Math.max(70, e.dates.length * f(9.2) * 0.5)) : 0;
        const [role, rest] = splitRole(e.title);
        const title =
          input.style.titleStyle === "ROLE_BOLD"
            ? text({ role: "entry-title", x: L, y, w: W - datesW - 10, text: `**${role}**${rest}` })
            : text({ role: "entry-title", x: L, y, w: W - datesW - 10, text: e.title, style: { bold: true, italic: true } });
        let rowBottom = bottom(title);
        if (e.dates) rowBottom = Math.max(rowBottom, bottom(text({ role: "dates", x: L + W - datesW, y, w: datesW, text: e.dates, style: { color: MUTED, align: "right" } })));
        y = rowBottom;
        if (e.subtitle) y = bottom(text({ role: "subtitle", x: L, y, w: W, text: e.subtitle, style: { size: f(8.8), italic: true, color: MUTED } }));
        if (e.bullets.length) y = bottom(text({ role: "bullets", x: L + 4, y, w: W - 4, text: e.bullets.join("\n"), list: "dash", style: { align: "justify" } }));
        y += sp(3.5);
      }
    }
  });
  return { version: 1, pages: [{ id: newId("p"), elements: els }] };
}

/** Lowest point of a page's content. */
export function contentBottom(page: DesignPage): number {
  return page.elements.reduce((m, el) => Math.max(m, el.y + heightOf(el)), 0);
}

/** Lays a structured CV out on one page when possible (same densities as the PDF template). */
export function layoutToFit(input: FlowInput, measure: Measure): CvDesign {
  let design = layoutFromVariant(input, measure, 1);
  for (const k of [0.97, 0.94, 0.91]) {
    if (contentBottom(design.pages[0]) <= PAGE_H - 20) break;
    design = layoutFromVariant(input, measure, k);
  }
  return design;
}

/** Rough text height without a browser (tests, server fallbacks): average glyph width ≈ 0.5 em. */
export const estimateMeasure: Measure = (el) => {
  const charsPerLine = Math.max(1, Math.floor(el.w / (el.style.size * 0.5)));
  const lines = plainText(el.text)
    .split("\n")
    .reduce((n, p) => n + Math.max(1, Math.ceil(p.length / charsPerLine)), 0);
  const paras = el.text.split("\n").length;
  return lines * el.style.size * el.style.lineHeight + paras * el.style.paraSpacing;
};

// ---------------------------------------------------------------------------
// Alignment guides (snapping while moving or resizing)
// ---------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Guide {
  axis: "x" | "y";
  at: number;
}

/** Lines an element can snap to: page edges, centre and margins, and the edges and centres of the other elements. */
export function snapTargets(page: DesignPage, exclude: Set<string>, margin = 36) {
  const xs = [0, margin, PAGE_W / 2, PAGE_W - margin, PAGE_W];
  const ys = [0, margin, PAGE_H / 2, PAGE_H - margin, PAGE_H];
  for (const el of page.elements) {
    if (exclude.has(el.id)) continue;
    const h = heightOf(el);
    xs.push(el.x, el.x + el.w / 2, el.x + el.w);
    ys.push(el.y, el.y + h / 2, el.y + h);
  }
  return { xs, ys };
}

/**
 * Snaps a moving box to the nearest targets (left / centre / right, top / middle / bottom) within `threshold`
 * points. Returns the correction and the guides to draw. Pure.
 */
export function snapBox(box: Box, targets: { xs: number[]; ys: number[] }, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const best = (points: number[], lines: number[]) => {
    let hit: { delta: number; at: number } | null = null;
    for (const p of points)
      for (const t of lines) {
        const d = t - p;
        if (Math.abs(d) <= threshold && (!hit || Math.abs(d) < Math.abs(hit.delta))) hit = { delta: d, at: t };
      }
    return hit;
  };
  const sx = best([box.x, box.x + box.w / 2, box.x + box.w], targets.xs);
  const sy = best([box.y, box.y + box.h / 2, box.y + box.h], targets.ys);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.at });
  if (sy) guides.push({ axis: "y", at: sy.at });
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides };
}

/** Snaps one edge (resizing): the value moves to the closest target within `threshold`. Pure. */
export function snapValue(value: number, lines: number[], threshold: number): { value: number; guide: number | null } {
  let hit: number | null = null;
  for (const t of lines) if (Math.abs(t - value) <= threshold && (hit === null || Math.abs(t - value) < Math.abs(hit - value))) hit = t;
  return { value: hit ?? value, guide: hit };
}

// ---------------------------------------------------------------------------
// Editing helpers
// ---------------------------------------------------------------------------

export function findElement(design: CvDesign, id: string): { page: number; index: number; el: DesignElement } | null {
  for (let p = 0; p < design.pages.length; p++) {
    const index = design.pages[p].elements.findIndex((e) => e.id === id);
    if (index >= 0) return { page: p, index, el: design.pages[p].elements[index] };
  }
  return null;
}

export function updateElements(design: CvDesign, ids: Set<string> | string[], fn: (el: DesignElement) => DesignElement): CvDesign {
  const set = ids instanceof Set ? ids : new Set(ids);
  return { ...design, pages: design.pages.map((pg) => ({ ...pg, elements: pg.elements.map((el) => (set.has(el.id) ? fn(el) : el)) })) };
}

/**
 * When a text box grows (or shrinks) by `delta`, the content below it on the page follows, like a document. Only
 * elements starting at or below the old bottom move. Pure.
 */
export function pushBelow(design: CvDesign, id: string, oldBottom: number, delta: number): CvDesign {
  if (Math.abs(delta) < 0.5) return design;
  const at = findElement(design, id);
  if (!at) return design;
  return {
    ...design,
    pages: design.pages.map((pg, p) => (p !== at.page ? pg : { ...pg, elements: pg.elements.map((el) => (el.id !== id && el.y >= oldBottom - 0.5 ? { ...el, y: Math.round((el.y + delta) * 100) / 100 } : el)) })),
  };
}

// ---------------------------------------------------------------------------
// Claude's edits: a list of operations, checked before being applied
// ---------------------------------------------------------------------------

export const designOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("text"), id: z.string(), text: z.string().max(8000) }),
  z.object({ op: z.literal("style"), id: z.string(), style: textStyleSchema.partial() }),
  z.object({ op: z.literal("move"), id: z.string(), x: z.number().optional(), y: z.number().optional(), w: z.number().optional() }),
  z.object({ op: z.literal("add"), page: z.number().int().min(0).max(5), element: designElementSchema }),
  z.object({ op: z.literal("remove"), id: z.string() }),
]);
export type DesignOp = z.infer<typeof designOpSchema>;

const NUMBER = /\d+(?:[.,]\d+)?/g;

/** Numbers of a new text that appear nowhere in the known material (a sign of an invented figure). Pure. */
export function unknownNumbers(text: string, known: string): string[] {
  const knownSet = new Set((known.match(NUMBER) ?? []).map((n) => n.replace(",", ".")));
  return [...new Set((plainText(text).match(NUMBER) ?? []).filter((n) => !knownSet.has(n.replace(",", "."))))];
}

/** All the text of a design (to check Claude's edits against). */
export function designText(design: CvDesign): string {
  return design.pages.flatMap((p) => p.elements.flatMap((e) => (e.type === "text" ? [plainText(e.text)] : []))).join("\n");
}

/**
 * Applies Claude's operations. A text that brings a number found neither in the CV nor in the profile is refused
 * (« never invent data »); unknown ids are skipped. Pure.
 */
export function applyOps(design: CvDesign, ops: DesignOp[], knownText: string): { design: CvDesign; applied: number; refused: string[] } {
  let next = design;
  let applied = 0;
  const refused: string[] = [];
  const known = `${designText(design)}\n${knownText}`;
  for (const op of ops) {
    if (op.op === "add") {
      const parsed = designElementSchema.safeParse({ ...op.element, id: newId(op.element.type[0]) });
      if (!parsed.success) continue;
      if (parsed.data.type === "text") {
        const bad = unknownNumbers(parsed.data.text, known);
        if (bad.length) {
          refused.push(`ajout refusé : chiffres absents de ton CV (${bad.join(", ")})`);
          continue;
        }
      }
      const page = Math.min(op.page, next.pages.length - 1);
      next = { ...next, pages: next.pages.map((pg, i) => (i === page ? { ...pg, elements: [...pg.elements, parsed.data] } : pg)) };
      applied++;
      continue;
    }
    const at = findElement(next, op.id);
    if (!at) continue;
    if (op.op === "remove") {
      next = { ...next, pages: next.pages.map((pg, i) => (i === at.page ? { ...pg, elements: pg.elements.filter((e) => e.id !== op.id) } : pg)) };
      applied++;
    } else if (op.op === "text") {
      if (at.el.type !== "text") continue;
      const bad = unknownNumbers(op.text, known);
      if (bad.length) {
        refused.push(`« ${plainText(at.el.text).slice(0, 40)}… » : chiffres absents de ton CV (${bad.join(", ")})`);
        continue;
      }
      next = updateElements(next, [op.id], (el) => ({ ...el, text: op.text }) as DesignElement);
      applied++;
    } else if (op.op === "style") {
      if (at.el.type !== "text") continue;
      next = updateElements(next, [op.id], (el) => (el.type === "text" ? { ...el, style: textStyleSchema.parse({ ...el.style, ...op.style }) } : el));
      applied++;
    } else if (op.op === "move") {
      next = updateElements(next, [op.id], (el) => ({ ...el, x: op.x ?? el.x, y: op.y ?? el.y, w: op.w ?? el.w }));
      applied++;
    }
  }
  return { design: next, applied, refused };
}

/** Compact view of a design for Claude (ids, roles, positions, text). */
export function designForPrompt(design: CvDesign) {
  return design.pages.map((pg, p) => ({
    page: p,
    elements: pg.elements.map((e) =>
      e.type === "text"
        ? { id: e.id, type: e.type, role: e.role ?? null, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(heightOf(e)), list: e.list, style: { font: e.style.font, size: e.style.size, bold: e.style.bold, italic: e.style.italic, align: e.style.align, color: e.style.color }, text: e.text }
        : { id: e.id, type: e.type, role: e.role ?? null, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) },
    ),
  }));
}

