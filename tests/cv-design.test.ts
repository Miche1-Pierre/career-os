import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import {
  PAGE_H,
  PAGE_W,
  applyOps,
  contentBottom,
  cvDesignSchema,
  estimateMeasure,
  layoutFromVariant,
  layoutToFit,
  paragraphs,
  parseRuns,
  plainText,
  pushBelow,
  snapBox,
  snapTargets,
  snapValue,
  unknownNumbers,
  type CvDesign,
  type TextElement,
} from "@/lib/cv-design";
import type { CvEntryView } from "@/lib/cv";
import { renderDesignPdf } from "@/server/cv/design-pdf";

const entry = (id: string, title: string, bullets: string[]): CvEntryView => ({ id, section: "EXPERIENCE", lang: "fr", group: null, title, dates: "mai 2026 - août 2026", subtitle: null, bullets });

const flow = () => ({
  header: { name: "Pierre MICHEL", title: "AI Product Engineer", lines: ["France", "pierre@example.com"], links: ["github.com/exemple"] },
  sections: [
    { kind: "TEXT" as const, title: "PROFIL", text: "Développeur full-stack orienté produit, des fonctionnalités fiables." },
    { kind: "ENTRIES" as const, title: "EXPÉRIENCE", entries: ["e1"] },
    { kind: "SKILLS" as const, title: "COMPÉTENCES", lines: [{ label: "IA", text: "LLM, RAG" }], columns: 1 as const },
  ],
  entries: new Map([["e1", entry("e1", "Head of Engineering, Plania (TechGuys), Montréal", ["Refonte de l'architecture d'un SaaS de 13 000 utilisateurs", "**Safex** : 60 % du trafic"])]]),
  style: { titleStyle: "ROLE_BOLD" as const, summaryItalic: true },
});

const text = (id: string, x: number, y: number, h: number, t = "texte"): TextElement => ({ type: "text", id, x, y, w: 200, h, text: t, list: "none", style: { font: "gelasio", size: 9.2, bold: false, italic: false, color: "#111111", align: "left", lineHeight: 1.25, letterSpacing: 0, uppercase: false, paraSpacing: 0 } });

describe("rich text", () => {
  it("reads bold, italic and links, paragraph by paragraph", () => {
    expect(parseRuns("**Safex** : *agent* [site](https://safex.example)")).toEqual([
      { text: "Safex", bold: true, italic: false, href: null },
      { text: " : ", bold: false, italic: false, href: null },
      { text: "agent", bold: false, italic: true, href: null },
      { text: " ", bold: false, italic: false, href: null },
      { text: "site", bold: false, italic: false, href: "https://safex.example" },
    ]);
    expect(paragraphs("a\n\nb")).toHaveLength(3);
    expect(plainText("**Head**, Plania\n[GitHub](https://github.com/x)")).toBe("Head, Plania\nGitHub");
    // A lone asterisk is text, not italic.
    expect(parseRuns("5 * 3")).toEqual([{ text: "5 * 3", bold: false, italic: false, href: null }]);
  });
});

describe("layout of an existing CV", () => {
  it("lays the structured CV out top to bottom like the PDF template", () => {
    const design = layoutFromVariant(flow(), estimateMeasure);
    expect(cvDesignSchema.parse(design)).toBeTruthy();
    const els = design.pages[0].elements;
    const roles = els.map((e) => e.role);
    expect(roles).toEqual(expect.arrayContaining(["name", "contact", "title", "links", "heading", "rule", "summary", "entry-title", "dates", "bullets", "skills"]));
    const byRole = (r: string) => els.find((e) => e.role === r)!;
    // Entry title (role in bold) and its dates share a line, dates on the right.
    const title = byRole("entry-title") as TextElement;
    const dates = byRole("dates") as TextElement;
    expect(title.text).toBe("**Head of Engineering,** Plania (TechGuys), Montréal");
    expect(dates.y).toBe(title.y);
    expect(dates.x + dates.w).toBeCloseTo(PAGE_W - 44, 0);
    expect((byRole("summary") as TextElement).style.italic).toBe(true);
    expect((byRole("links") as TextElement).text).toBe("[github.com/exemple](https://github.com/exemple)");
    expect((byRole("bullets") as TextElement).list).toBe("dash");
    // Every element sits below the previous section heading.
    expect(byRole("summary").y).toBeGreaterThan(byRole("heading").y);
  });

  it("tightens a CV that runs past one page", () => {
    const long = flow();
    long.entries.set("e1", entry("e1", "Head of Engineering", Array.from({ length: 75 }, (_, i) => `Réalisation numéro ${i + 1} décrite sur une ligne entière du CV`)));
    const normal = layoutFromVariant(long, estimateMeasure, 1);
    const fitted = layoutToFit(long, estimateMeasure);
    expect(contentBottom(normal.pages[0])).toBeGreaterThan(PAGE_H - 20);
    expect(contentBottom(fitted.pages[0])).toBeLessThan(contentBottom(normal.pages[0]));
  });
});

describe("alignment guides", () => {
  const page = { id: "p", elements: [text("a", 44, 100, 20), text("b", 300, 200, 40)] };

  it("snaps a moving box to page lines and other elements", () => {
    const targets = snapTargets(page, new Set(["b"]));
    // Left edge 3 pt from the other element's left edge (44): snapped, with a vertical guide.
    const s = snapBox({ x: 47, y: 400, w: 100, h: 20 }, targets, 5);
    expect(s.dx).toBe(-3);
    expect(s.guides).toContainEqual({ axis: "x", at: 44 });
    // Centre on the page centre.
    const c = snapBox({ x: PAGE_W / 2 - 50 + 2, y: 600, w: 100, h: 10 }, targets, 5);
    expect(c.dx).toBeCloseTo(-2, 5);
    // Too far: no snap.
    expect(snapBox({ x: 120, y: 500, w: 60, h: 10 }, targets, 3)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(snapValue(301.5, targets.xs.concat([300]), 4)).toEqual({ value: 300, guide: 300 });
  });
});

describe("content below follows a growing text", () => {
  it("moves only what starts below the old bottom", () => {
    const design: CvDesign = { version: 1, pages: [{ id: "p", elements: [text("t", 44, 100, 20), text("side", 300, 105, 10), text("below", 44, 130, 10), { type: "line", id: "l", x: 44, y: 125, w: 500, h: 0.6, color: "#9a9a9a" }] }] };
    const next = pushBelow(design, "t", 120, 12);
    const y = (id: string) => next.pages[0].elements.find((e) => e.id === id)!.y;
    expect(y("t")).toBe(100);
    expect(y("side")).toBe(105);
    expect(y("below")).toBe(142);
    expect(y("l")).toBe(137);
    expect(pushBelow(design, "t", 120, 0.2)).toBe(design);
  });
});

describe("Claude's edits", () => {
  const design: CvDesign = { version: 1, pages: [{ id: "p", elements: [text("s", 44, 100, 40, "SaaS de 13 000 utilisateurs, MRR de 12 k$"), text("t", 44, 200, 12, "Titre")] }] };

  it("applies text, style, move, add and remove operations", () => {
    const r = applyOps(
      design,
      [
        { op: "text", id: "s", text: "SaaS de 13 000 utilisateurs" },
        { op: "style", id: "t", style: { bold: true, color: "#444444" } },
        { op: "move", id: "t", y: 180 },
        { op: "add", page: 0, element: { type: "line", id: "x", x: 44, y: 170, w: 500, h: 0.6, color: "#9a9a9a" } },
        { op: "remove", id: "nope" },
      ],
      "",
    );
    expect(r.applied).toBe(4);
    const t = r.design.pages[0].elements.find((e) => e.id === "t") as TextElement;
    expect(t.style.bold).toBe(true);
    expect(t.y).toBe(180);
    expect(r.design.pages[0].elements).toHaveLength(3);
  });

  it("refuses a text that brings a number found neither in the CV nor in the profile", () => {
    expect(unknownNumbers("SaaS de 13 000 utilisateurs, 40 % de croissance", "SaaS de 13 000 utilisateurs")).toEqual(["40"]);
    const r = applyOps(design, [{ op: "text", id: "s", text: "SaaS de 50 000 utilisateurs" }], "profil : 3 ans d'expérience");
    expect(r.applied).toBe(0);
    expect(r.refused[0]).toMatch(/50/);
    // A number known from the profile is fine.
    expect(applyOps(design, [{ op: "text", id: "s", text: "3 ans d'expérience" }], "3 ans d'expérience").applied).toBe(1);
  });
});

describe("PDF of a design", () => {
  it("draws every element, keeps the text readable and uses the chosen fonts", async () => {
    const design: CvDesign = {
      version: 1,
      pages: [
        {
          id: "p",
          elements: [
            { ...text("n", 44, 30, 20, "Pierre **MICHEL**"), style: { ...text("n", 0, 0, 0).style, font: "helvetica", size: 18 } },
            { ...text("b", 44, 80, 40, "Des fonctionnalités fiables\nDes workflows efficaces"), list: "dash" },
            { type: "line", id: "l", x: 44, y: 70, w: 500, h: 0.6, color: "#9a9a9a" },
            { type: "rect", id: "r", x: 400, y: 20, w: 100, h: 40, fill: "#eef2ff", stroke: null, strokeWidth: 0, radius: 6 },
          ],
        },
      ],
    };
    const pdf = await renderDesignPdf(design, { title: "Test", author: "Pierre" });
    const raw = pdf.toString("latin1");
    expect(raw.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
    expect(raw).toMatch(/Helvetica-Bold/);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text: content } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
    for (const w of ["Pierre", "MICHEL", "fiables", "workflows", "efficaces"]) expect(content).toContain(w);
  }, 60_000);
});

describe("CV editor data (database)", () => {
  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
  });

  it("saves a design, renames (= file name) and exports the design as the PDF", async () => {
    const { createBlankVariant, saveDesign, renameVariant, exportVariant, getVariant, listCvCards } = await import("@/server/services/cv");
    const v = await createBlankVariant("CV vierge", "fr", USER);
    const design: CvDesign = { version: 1, pages: [{ id: "p", elements: [text("t", 44, 40, 12, "Bonjour")] }] };
    await saveDesign(v.id, design);
    await expect(saveDesign(v.id, { version: 2 })).rejects.toThrow();
    const renamed = await renameVariant(v.id, "CV-Pierre-Michel-Stage IA", USER);
    expect(renamed.fileName).toBe("CV-Pierre-Michel-Stage-IA.pdf");
    const exported = await exportVariant(v.id, USER);
    expect(exported.fileName).toBe("CV-Pierre-Michel-Stage-IA.pdf");
    expect((await getVariant(v.id)).design).toMatchObject({ pages: [{ elements: [{ text: "Bonjour" }] }] });
    const cards = await listCvCards();
    expect(cards.find((c) => c.id === v.id)?.versions).toHaveLength(1);
  }, 60_000);
});
