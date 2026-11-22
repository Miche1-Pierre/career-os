import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, useTempStorage } from "./helpers/db";
import * as s from "@/server/db/schema";
import { bootstrapDefaults } from "@/server/bootstrap";
import { USER } from "@/server/context";
import { createOpportunity, getOpportunity } from "@/server/services/opportunities";

describe("French defaults", () => {
  it("renames the former English defaults once, without touching customizations", async () => {
    useTempStorage();
    const { db } = await createTestDb();
    const stage = (pipeline: "JOB" | "EDUCATION", key: string) => and(eq(s.pipelineStages.pipeline, pipeline), eq(s.pipelineStages.key, key));

    // A fresh database is created in French.
    const [fresh] = await db.select().from(s.pipelineStages).where(stage("JOB", "TO_APPLY"));
    expect(fresh.label).toBe("À postuler");
    expect((await db.select().from(s.savedViews)).map((v) => v.name)).toContain("Logiciel");

    // Simulate a database bootstrapped with the English defaults, partly customized by the user.
    await db.update(s.pipelineStages).set({ label: "To apply" }).where(stage("JOB", "TO_APPLY"));
    await db.update(s.pipelineStages).set({ label: "Submitted" }).where(stage("EDUCATION", "APPLICATION_SUBMITTED"));
    await db.update(s.pipelineStages).set({ label: "Call RH" }).where(stage("JOB", "HR_INTERVIEW"));
    await db.update(s.tags).set({ name: "Software" }).where(eq(s.tags.name, "Logiciel"));
    await db.update(s.tags).set({ name: "Remote" }).where(eq(s.tags.name, "Télétravail"));
    await db.update(s.tags).set({ name: "AI" }).where(eq(s.tags.name, "IA"));
    await db.insert(s.tags).values({ name: "ia" }); // the French name already exists → "AI" is kept, not merged
    await db.update(s.savedViews).set({ name: "Software", filters: { tags: ["Software", "Full-stack"] } }).where(eq(s.savedViews.name, "Logiciel"));
    const created = await createOpportunity({ type: "JOB", title: "Backend engineer", organizationName: "Acme", tags: ["Software", "Remote"] }, USER);
    const id = created.opportunity!.id;
    await db.update(s.tasks).set({ title: "Select CV" }).where(and(eq(s.tasks.opportunityId, id), eq(s.tasks.autoRule, "doc:CV")));
    await db.insert(s.tasks).values({ opportunityId: id, title: "Submit application", origin: "USER" });
    await db.insert(s.settings).values({ key: "general", value: { timezone: "Europe/Paris", dateLocale: "en-GB" } });
    await db.update(s.settings).set({ value: { tags: true, views: true } }).where(eq(s.settings.key, "bootstrap"));

    const result = await bootstrapDefaults(db as never);
    expect(result.labelsTranslated).toBeGreaterThan(0);

    expect((await db.select().from(s.pipelineStages).where(stage("JOB", "TO_APPLY")))[0].label).toBe("À postuler");
    expect((await db.select().from(s.pipelineStages).where(stage("EDUCATION", "APPLICATION_SUBMITTED")))[0].label).toBe("Dossier déposé");
    expect((await db.select().from(s.pipelineStages).where(stage("JOB", "HR_INTERVIEW")))[0].label).toBe("Call RH");

    const tagNames = (await db.select().from(s.tags)).map((t) => t.name);
    expect(tagNames).toEqual(expect.arrayContaining(["Logiciel", "Télétravail", "AI", "ia"]));
    expect(tagNames).not.toContain("Software");

    const opp = await getOpportunity(id);
    expect(opp.tags).toEqual(["Logiciel", "Télétravail"]);
    const titles = opp.tasks.map((t) => t.title);
    expect(titles).toContain("Choisir le CV");
    expect(titles).not.toContain("Select CV");
    expect(titles).toContain("Submit application"); // written by the user

    const [view] = await db.select().from(s.savedViews).where(eq(s.savedViews.name, "Logiciel"));
    expect(view.filters.tags).toEqual(["Logiciel", "Full-stack"]);
    const [general] = await db.select().from(s.settings).where(eq(s.settings.key, "general"));
    expect((general.value as { dateLocale: string }).dateLocale).toBe("fr-FR");

    // One-shot: a label set back to English afterwards is respected.
    await db.update(s.pipelineStages).set({ label: "To apply" }).where(stage("JOB", "TO_APPLY"));
    const again = await bootstrapDefaults(db as never);
    expect(again.labelsTranslated).toBe(0);
    expect((await db.select().from(s.pipelineStages).where(stage("JOB", "TO_APPLY")))[0].label).toBe("To apply");
  });
});
