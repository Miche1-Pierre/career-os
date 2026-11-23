import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import * as s from "@/server/db/schema";
import { boldRuns, cvBlockSchema, exportFileName, splitRole, stripBold, variantPlainText, type CvEntryView } from "@/lib/cv";
import { kitMissing } from "@/lib/kit";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CvDocument, pdfPageCount, renderCvPdf } from "@/server/cv/template";
import { exportVariant, importCvSeed, listEntries, listVariants } from "@/server/services/cv";
import { getDocument } from "@/server/services/documents";
import { applyWithKit, updateKit } from "@/server/services/kit";
import { createOpportunity, getOpportunity } from "@/server/services/opportunities";
import { renderEmailTemplate } from "@/server/services/email-templates";
import { patchSettingsSection } from "@/server/services/settings";
import { bootstrapDefaults } from "@/server/bootstrap";

const entry = (id: string, title: string, bullets: string[] = []): CvEntryView => ({ id, section: "EXPERIENCE", lang: "fr", group: null, title, dates: "mai 2026 - août 2026", subtitle: null, bullets });

describe("cv logic", () => {
  it("names exports with the date, splits roles and reads bold markers", () => {
    expect(exportFileName({ name: "AI Product (FR)", fileName: "CV-Camille-Martin-AIProduct-FR.pdf" })).toBe("CV-Camille-Martin-AIProduct-FR.pdf");
    expect(exportFileName({ name: "Mon CV général" })).toBe("Mon-CV-general.pdf");
    expect(splitRole("Head of Engineering, Globex, Montréal")).toEqual(["Head of Engineering,", " Globex, Montréal"]);
    expect(splitRole("Taskforce")).toEqual(["Taskforce", ""]);
    expect(boldRuns("**Initech** (transporteur) : agent IA")).toEqual([
      { text: "Initech", bold: true },
      { text: " (transporteur) : agent IA", bold: false },
    ]);
    expect(stripBold("un **LIMS** pharmaceutique")).toBe("un LIMS pharmaceutique");
    expect(cvBlockSchema.parse({ kind: "SKILLS", title: "COMPÉTENCES", lines: [] })).toMatchObject({ columns: 1 });
  });

  it("gives the plain text of a variant", () => {
    const text = variantPlainText(
      { header: { name: "Camille MARTIN", title: "AI Product Engineer", lines: ["France"], links: [] }, sections: [{ kind: "TEXT", title: "PROFIL", text: "Développeur" }, { kind: "ENTRIES", title: "EXPÉRIENCE", entries: ["e1"] }, { kind: "BULLETS", title: "FOCUS", bullets: ["**LIMS** : stocks"] }] },
      new Map([["e1", entry("e1", "Head of Engineering, Globex", ["Refonte"])]]),
    );
    expect(text).toContain("Head of Engineering, Globex (mai 2026 - août 2026)");
    expect(text).toContain("- LIMS : stocks");
  });

  it("renders a PDF whose text an ATS can read (no fi/fl ligatures)", async () => {
    const pdf = await renderCvPdf({
      title: "Test",
      header: { name: "Camille MARTIN", title: "AI Product Engineer", lines: ["France"], links: ["github.com/exemple"] },
      sections: [{ kind: "TEXT", title: "PROFIL", text: "Des fonctionnalités fiables et des workflows efficaces." }, { kind: "ENTRIES", title: "EXPÉRIENCE", entries: ["e1"] }],
      entries: [entry("e1", "Head of Engineering, Globex", ["**Initech** : trafic multiplié"])],
      style: { titleStyle: "ROLE_BOLD", summaryItalic: true },
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
    for (const word of ["fiables", "workflows", "efficaces", "trafic", "Initech"]) expect(text).toContain(word);
    expect(pdfPageCount(pdf)).toBe(1);
  }, 60_000);

  it("tightens the layout to keep a slightly long CV on one page, and never drops content", async () => {
    const line = "Conçu et livré une fonctionnalité de bout en bout avec des tests et une mise en production suivie.";
    const doc = (bullets: number) => ({
      title: "Long",
      header: { name: "Camille MARTIN", title: "Engineer", lines: ["France"], links: [] },
      sections: [{ kind: "ENTRIES" as const, title: "EXPÉRIENCE", entries: ["e1"] }],
      entries: [entry("e1", "Head of Engineering, Globex", Array.from({ length: bullets }, (_, i) => `${line} (${i + 1})`))],
    });
    // 66 one-line bullets are just over one page at the normal density...
    const d = doc(66);
    const normal = createElement(CvDocument, { ...d, entries: new Map(d.entries.map((e) => [e.id, e])), style: { titleStyle: "BOLD_ITALIC", summaryItalic: false } });
    expect(pdfPageCount(await renderToBuffer(normal as Parameters<typeof renderToBuffer>[0]))).toBe(2);
    // ...and fit on one once tightened.
    expect(pdfPageCount(await renderCvPdf(d))).toBe(1);
    // Far too long: it stays on two pages rather than shrinking the text further or cutting it.
    const long = await renderCvPdf(doc(90));
    expect(pdfPageCount(long)).toBe(2);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(long)), { mergePages: true });
    expect(text).toContain("(90)");
  }, 60_000);

  it("lists what the kit still misses", () => {
    expect(kitMissing(null)).toEqual(["CV", "canal"]);
    expect(kitMissing({ cvVersionId: "00000000-0000-4000-8000-000000000001", channel: "SITE" })).toEqual(["lien"]);
    expect(kitMissing({ cvVersionId: "00000000-0000-4000-8000-000000000001", channel: "LINKEDIN" })).toEqual([]);
  });
});

describe("cv and application kit (database)", () => {
  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
  });

  it("imports CVs, exports frozen versions and sends an application with the kit", async () => {
    const result = await importCvSeed(
      {
        entries: [
          { key: "globex-fr", section: "EXPERIENCE", lang: "fr", group: "globex", title: "Head of Engineering, Globex, Montréal", dates: "mai 2026 - août 2026", bullets: ["Refonte de l'architecture"] },
          { key: "mns-fr", section: "EDUCATION", lang: "fr", group: "mns", title: "Bachelor Développeur Full Stack, MNS", dates: "2023 - 2026", subtitle: "titre RNCP niveau 6, bac+3", bullets: [] },
        ],
        variants: [
          {
            key: "ai-fr",
            name: "AI Product (FR)",
            lang: "fr",
            fileName: "CV-Test-AIProduct-FR.pdf",
            header: { name: "Camille MARTIN", title: "AI Product Engineer", lines: ["France"], links: [] },
            sections: [
              { kind: "TEXT", title: "PROFIL", text: "Développeur full-stack." },
              { kind: "ENTRIES", title: "EXPÉRIENCE PROFESSIONNELLE", entries: ["globex-fr"] },
              { kind: "SKILLS", title: "COMPÉTENCES", aside: "Français (natif)", lines: [{ label: "IA", text: "LLM, RAG" }], columns: 2 },
              { kind: "ENTRIES", title: "FORMATION", entries: ["mns-fr"] },
            ],
          },
        ],
      },
      USER,
    );
    expect(result).toEqual({ entries: 2, variants: 1 });
    const [variant] = await listVariants();
    const entries = await listEntries();
    expect((variant.sections[1] as { entries: string[] }).entries).toEqual([entries.find((e) => e.group === "globex")!.id]);

    const { opportunity } = await createOpportunity({ type: "JOB", title: "AI Engineer", organizationName: "Acme", status: "TO_APPLY" }, USER);
    const first = await exportVariant(variant.id, USER);
    expect(first.fileName).toBe("CV-Test-AIProduct-FR.pdf");
    const second = await exportVariant(variant.id, USER, { opportunityId: opportunity!.id });
    expect(second.documentId).toBe(first.documentId);
    const doc = await getDocument(first.documentId);
    expect(doc.versions.map((v) => v.version).sort()).toEqual([1, 2]);
    expect(doc.document.kind).toBe("CV");

    // Kit: CV version + channel, then "J'ai postulé".
    const letter = await importLetter();
    await updateKit(opportunity!.id, { cvVersionId: first.versionId, letterVersionId: letter, channel: "LINKEDIN" }, USER);
    const applied = await applyWithKit(opportunity!.id, USER);
    expect(applied.changed).toBe(true);
    const opp = await getOpportunity(opportunity!.id);
    expect(opp.stage.key).toBe("APPLIED");
    expect(opp.documents.map((d) => d.version.id)).toEqual(expect.arrayContaining([first.versionId, second.versionId, letter]));
    expect(opp.events.some((e) => e.title === "Candidature envoyée via LinkedIn")).toBe(true);
  }, 60_000);

  it("fills the new message templates and adds them to saved lists once", async () => {
    await patchSettingsSection("profile", { fullName: "Camille Martin", headline: "Développeur full-stack orienté IA" }, USER);
    const { opportunity } = await createOpportunity({ type: "JOB", title: "Product Engineer", organizationName: "Beta", status: "TO_APPLY", url: "https://beta.example/jobs/1" }, USER);
    const linkedin = await renderEmailTemplate(opportunity!.id, "linkedin-fr");
    expect(linkedin.body).toContain("Développeur full-stack orienté IA, j'aimerais échanger");
    expect(linkedin.body.length).toBeLessThan(300);
    const followUp = await renderEmailTemplate(opportunity!.id, "follow-up-fr");
    expect(followUp.subject).toBe("Suivi de ma candidature : Product Engineer");

    // A list saved before the new templates gets them (and the old long-dash subject is fixed if untouched).
    const { db } = await import("@/server/db");
    await db.insert(s.settings).values({ key: "emailTemplates", value: [{ id: "follow-up-fr", name: "Relance", language: "fr", purpose: "FOLLOW_UP", subject: "Suivi de ma candidature — {{title}}", body: "x" }] }).onConflictDoUpdate({ target: s.settings.key, set: { value: [{ id: "follow-up-fr", name: "Relance", language: "fr", purpose: "FOLLOW_UP", subject: "Suivi de ma candidature — {{title}}", body: "x" }] } });
    await db.delete(s.settings).where(eq(s.settings.key, "bootstrap"));
    await bootstrapDefaults(db as never);
    const [row] = await db.select().from(s.settings).where(eq(s.settings.key, "emailTemplates"));
    const list = row.value as { id: string; subject: string }[];
    expect(list.find((t) => t.id === "follow-up-fr")?.subject).toBe("Suivi de ma candidature : {{title}}");
    expect(list.map((t) => t.id)).toEqual(expect.arrayContaining(["application-fr", "linkedin-fr", "spontaneous-fr"]));
  });
});

async function importLetter() {
  const { createDocument, addVersionFromUpload } = await import("@/server/services/documents");
  const doc = await createDocument({ name: "Lettre Acme", kind: "COVER_LETTER" }, USER);
  const v = await addVersionFromUpload(doc.id, { buffer: Buffer.from("%PDF-1.4 lettre"), fileName: "Lettre-Acme.pdf" }, USER);
  return v.id;
}
