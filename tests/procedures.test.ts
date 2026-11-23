import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import { appliesTo, countryCode, procedureTemplateSchema, proceduresFromResearch, proceduresFromTemplate, statusFromSteps, templatesFor, type ProcedureTemplate } from "@/lib/procedures";
import { PROCEDURE_TEMPLATES } from "@/lib/procedure-templates";
import { createMove } from "@/server/services/moves";
import { addProcedures, addProceduresFromTemplates, listProcedures, updateProcedure, updateStep } from "@/server/services/procedures";
import { getToday } from "@/server/services/today";
import { exportAll, parseExport } from "@/server/services/data-transfer";
import { addDays, todayISO } from "@/lib/dates";

const TEMPLATE: ProcedureTemplate = procedureTemplateSchema.parse({
  key: "FR-XX",
  from: "FR",
  to: "XX",
  title: "France → Testland",
  checkedAt: "2026-11-23",
  procedures: [
    { key: "register", title: "S'inscrire à la mairie", category: "RESIDENCE", when: 8, officialUrl: "https://example.gov/register", steps: [{ title: "Prendre rendez-vous" }, { title: "Recevoir la carte", requiredDocuments: ["Passeport"] }] },
    { key: "bank", title: "Ouvrir un compte", category: "BANK", steps: [] },
  ],
});
const GENERIC: ProcedureTemplate = procedureTemplateSchema.parse({ key: "FR-GENERIC-TEST", from: "FR", to: "*", title: "Quitter la France", checkedAt: "2026-11-23", procedures: [{ key: "mail", title: "Faire suivre son courrier", category: "OTHER", when: -15 }] });

describe("procedure logic", () => {
  it("dates a template from the arrival date and keeps its keys", () => {
    const list = proceduresFromTemplate(TEMPLATE, { arrivalDate: "2027-01-04", country: "Testland" });
    expect(list[0]).toMatchObject({ templateKey: "FR-XX", key: "register", dueDate: "2027-01-12", country: "Testland", source: "TEMPLATE", checkedAt: "2026-11-23" });
    expect(list[0].steps[1].requiredDocuments).toEqual(["Passeport"]);
    expect(list[1].dueDate).toBeNull(); // no timing given
    expect(proceduresFromTemplate(GENERIC, { arrivalDate: "2027-01-04", country: "Testland" })[0]).toMatchObject({ dueDate: "2026-12-20", country: "FR" });
    expect(proceduresFromTemplate(TEMPLATE, { arrivalDate: null, country: null })[0].dueDate).toBeNull();
  });

  it("picks the generic departure template and the destination one", () => {
    expect(templatesFor([TEMPLATE, GENERIC], "FR", "XX").map((t) => t.key)).toEqual(["FR-XX", "FR-GENERIC-TEST"]);
    expect(templatesFor([TEMPLATE, GENERIC], "FR", "JP").map((t) => t.key)).toEqual(["FR-GENERIC-TEST"]);
  });

  it("filters by destination and brings past due dates to today", () => {
    expect(appliesTo({ skipFor: ["EUROPE"] }, "BE")).toBe(false);
    expect(appliesTo({ skipFor: ["EUROPE"] }, "CA")).toBe(true);
    expect(appliesTo({ onlyFor: ["EUROPE"] }, "US")).toBe(false);
    expect(appliesTo({ onlyFor: ["EUROPE"] }, null)).toBe(true);
    const tpl = procedureTemplateSchema.parse({ ...GENERIC, procedures: [{ key: "idp", title: "Permis international", category: "TRANSPORT", when: -30, skipFor: ["EUROPE"] }, { key: "late", title: "Préavis du logement", category: "RESIDENCE", when: -90 }] });
    const list = proceduresFromTemplate(tpl, { arrivalDate: "2027-01-04", country: "Belgique" }, "TEMPLATE", { destination: "BE", today: "2026-11-23" });
    expect(list.map((p) => [p.key, p.dueDate])).toEqual([["late", "2026-11-23"]]); // 2026-10-06 is past
    // Destination template first, generic after.
    expect(templatesFor([GENERIC, TEMPLATE], "FR", "XX").map((t) => t.key)).toEqual(["FR-XX", "FR-GENERIC-TEST"]);
  });

  it("derives the status from the steps", () => {
    expect(statusFromSteps("TODO", [{ done: true }, { done: false }])).toBe("IN_PROGRESS");
    expect(statusFromSteps("IN_PROGRESS", [{ done: true }, { done: true }])).toBe("DONE");
    expect(statusFromSteps("DONE", [{ done: false }])).toBe("TODO");
    expect(statusFromSteps("WAITING", [{ done: true }, { done: false }])).toBe("WAITING");
    expect(statusFromSteps("NOT_NEEDED", [{ done: true }])).toBe("NOT_NEEDED");
    expect(statusFromSteps("TODO", [])).toBe("TODO");
  });

  it("reads country names", () => {
    expect(countryCode("Belgique")).toBe("BE");
    expect(countryCode("États-Unis")).toBe("US");
    expect(countryCode("ca")).toBe("CA");
    expect(countryCode("Narnia")).toBeNull();
  });

  it("keeps only https links from a research", () => {
    const [p] = proceduresFromResearch(
      {
        country: "Japon",
        caveats: [],
        procedures: [
          {
            key: "visa",
            title: "Demander le visa",
            category: "VISA",
            summary: "…",
            appliesIf: null,
            when: -60,
            officialUrl: "http://insecure.example",
            sources: [
              { label: "MOFA", url: "https://www.mofa.go.jp/" },
              { label: "Blog", url: "javascript:alert(1)" },
            ],
            steps: [{ title: "Remplir le formulaire", detail: null, officialUrl: "https://www.fr.emb-japan.go.jp/", requiredDocuments: [] }],
          },
        ],
      },
      { arrivalDate: "2027-04-01", country: "Japon" },
      "2026-11-23",
    );
    expect(p).toMatchObject({ source: "AI", officialUrl: null, dueDate: "2027-01-31", checkedAt: "2026-11-23" });
    expect(p.sources).toEqual([{ label: "MOFA", url: "https://www.mofa.go.jp/" }]);
    expect(p.steps[0].officialUrl).toBe("https://www.fr.emb-japan.go.jp/");
  });

  it("ships valid templates with official https links", () => {
    for (const t of PROCEDURE_TEMPLATES) {
      expect(t.procedures.length).toBeGreaterThan(0);
      for (const p of t.procedures) {
        if (p.officialUrl) expect(p.officialUrl).toMatch(/^https:\/\//);
        expect(p.title).not.toMatch(/—/);
      }
    }
  });
});

describe("procedures (database)", () => {
  let moveId: string;
  const today = todayISO("Europe/Paris");

  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
    moveId = (await createMove({ title: "Stage · Bruxelles", city: "Bruxelles", country: "Belgique", arrivalDate: addDays(today, 30) }, USER)).id;
  });

  it("adds procedures, skips duplicates and follows the steps", async () => {
    const first = await addProcedures(moveId, [{ title: "Ouvrir un compte bancaire", category: "BANK", dueDate: addDays(today, 3), steps: [{ title: "Choisir la banque" }, { title: "Prendre rendez-vous" }] }], USER);
    expect(first.added).toBe(1);
    expect((await addProcedures(moveId, [{ title: "ouvrir un compte bancaire", category: "BANK" }], USER)).added).toBe(0);
    let [p] = await listProcedures(moveId);
    expect(p.steps.map((s) => s.title)).toEqual(["Choisir la banque", "Prendre rendez-vous"]);
    await updateStep(p.steps[0].id, { done: true });
    [p] = await listProcedures(moveId);
    expect(p.status).toBe("IN_PROGRESS");
    await updateStep(p.steps[1].id, { done: true });
    [p] = await listProcedures(moveId);
    expect(p.status).toBe("DONE");
  });

  it("marks researched procedures as to check until verified", async () => {
    const { ids } = await addProcedures(moveId, [{ title: "Demander la carte E", category: "RESIDENCE", officialUrl: "https://www.ibz.be/", sources: [{ label: "IBZ", url: "https://www.ibz.be/" }] }], USER, "AI");
    let p = (await listProcedures(moveId)).find((x) => x.id === ids[0])!;
    expect(p.toCheck).toBe(true);
    expect(p.sources).toEqual([{ label: "IBZ", url: "https://www.ibz.be/" }]);
    await updateProcedure(p.id, { verified: true }, USER);
    p = (await listProcedures(moveId)).find((x) => x.id === ids[0])!;
    expect(p.toCheck).toBe(false);
  });

  it("applies the templates that fit the destination once", async () => {
    const fitting = PROCEDURE_TEMPLATES.filter((t) => t.from === "FR" && (t.to === "*" || t.to === "BE"));
    const first = await addProceduresFromTemplates(moveId, null, USER);
    expect(first.templates.sort()).toEqual(fitting.map((t) => t.key).sort());
    const again = await addProceduresFromTemplates(moveId, null, USER);
    expect(again.added).toBe(0);
  });

  it("shows due procedures on Today and exports them", async () => {
    await addProcedures(moveId, [{ title: "Résilier la box internet", category: "OTHER", dueDate: addDays(today, 2) }], USER);
    const data = await getToday({ horizonDays: 7 });
    const item = [...data.overdue, ...data.dueToday, ...data.upcoming].find((i) => i.kind === "PROCEDURE" && i.title === "Résilier la box internet");
    expect(item).toMatchObject({ href: `/moves/${moveId}?tab=procedures`, subtitle: "Stage · Bruxelles" });

    const file = await exportAll();
    expect(file.schemaVersion).toBe(3);
    expect(file.counts.procedures).toBeGreaterThan(0);
    expect(file.counts.procedureSteps).toBeGreaterThan(0);
    // A v2 export (before procedures) still imports.
    const v2 = parseExport({ app: "career-os", schemaVersion: 2, exportedAt: "2026-11-01T00:00:00Z", counts: {}, data: { moves: [] } });
    expect(v2.schemaVersion).toBe(3);
    expect(v2.data.procedures).toEqual([]);
  });
});
