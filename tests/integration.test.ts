import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER, CLAUDE } from "@/server/context";
import * as s from "@/server/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { changeStatus, createOpportunity, getOpportunity, updateOpportunity, findDuplicates } from "@/server/services/opportunities";
import { markFollowUpDone } from "@/server/services/followups";
import { createInterview, updateInterview } from "@/server/services/interviews";
import { listAudit } from "@/server/services/audit";
import { addVersionFromPath, attachDocument, createDocument, deleteVersion, getDocument, resolveVersionFile, scanLibrary } from "@/server/services/documents";
import { exportAll, importAll } from "@/server/services/data-transfer";
import { evaluatePeriodicRules } from "@/server/services/rules";
import { listNotifications } from "@/server/services/notifications";
import { applyActions, createCapture, getInboxItem, submitAnalysis, convertToOpportunity, storedResult } from "@/server/services/inbox";
import { getToday } from "@/server/services/today";
import { commandSnapshot } from "@/server/services/analysis";
import { handleMcpPayload } from "@/server/mcp/server";
import { dispatch } from "@/server/api/router";
import { draftFromCapture } from "@/lib/capture-mapping";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
const today = todayISO("Europe/Paris");

beforeAll(async () => {
  useTempStorage();
  ({ db } = await createTestDb());
});

describe("opportunity lifecycle", () => {
  let id: string;

  it("creates an opportunity with its organization, checklist and timeline", async () => {
    const r = await createOpportunity(
      {
        type: "JOB",
        title: "Senior Software Engineer",
        organizationName: "Zefir",
        requiredDocuments: ["CV", "Lettre de motivation", "Portfolio GitHub"],
        tags: ["startup", "HealthTech"],
        provenance: { title: { source: "EXTRACTED", confidence: "HIGH", evidence: "Senior Software Engineer" }, salaryMin: { source: "EXTRACTED", confidence: "HIGH", evidence: "70k" } },
      },
      USER,
    );
    expect(r.created).toBe(true);
    id = r.opportunity!.id;
    const o = await getOpportunity(id);
    expect(o.organization?.name).toBe("Zefir");
    expect(o.stage.key).toBe("TO_APPLY");
    expect(o.tags).toEqual(["Startup", "HealthTech"]); // canonical casing of existing tags
    expect(o.tasks.map((t) => t.title)).toContain("Select CV");
    expect(o.tasks.some((t) => t.autoRule === "doc:PORTFOLIO")).toBe(true); // required document not in the template
    expect(o.provenance["details.salaryMin"]).toBeDefined(); // key normalized
    expect(o.events.map((e) => e.type)).toContain("CREATED");
  });

  it("refuses a strong duplicate unless forced", async () => {
    const dups = await findDuplicates({ title: "Senior Software Engineer (H/F)", organizationName: "ZEFIR SAS" });
    expect(dups[0]?.id).toBe(id);
    const r = await createOpportunity({ type: "JOB", title: "Senior Software Engineer (H/F)", organizationName: "Zefir" }, USER);
    expect(r.created).toBe(false);
    expect(r.duplicates.length).toBeGreaterThan(0);
    const orgs = await db.select().from(s.organizations);
    expect(orgs.filter((o) => o.name === "Zefir")).toHaveLength(1);
  });

  it("marks the application as submitted and schedules the first follow-up (+7 days)", async () => {
    const r = await changeStatus(id, { status: "APPLIED" }, USER);
    expect(r.changed).toBe(true);
    expect(r.opportunity.appliedAt).toBe(today);
    expect(r.opportunity.nextFollowUpAt).toBe(addDays(today, 7));
    const o = await getOpportunity(id);
    expect(o.tasks.find((t) => t.autoRule === "status:APPLIED")?.done).toBe(true);
    expect(o.events.some((e) => e.type === "APPLIED")).toBe(true);
  });

  it("logs a follow-up, moves to “Followed up” and schedules the next one", async () => {
    const row = await markFollowUpDone(id, {}, USER);
    expect(row.followUpCount).toBe(1);
    expect(row.nextFollowUpAt).toBe(addDays(today, 7));
    const o = await getOpportunity(id);
    expect(o.stage.key).toBe("FOLLOW_UP");
    expect(o.tasks.find((t) => t.autoRule === "followup")?.done).toBe(true);
  });

  it("an interview advances the stage, creates a preparation task and clears pending follow-ups", async () => {
    const at = new Date(`${addDays(today, 3)}T12:00:00Z`).toISOString();
    const interview = await createInterview({ opportunityId: id, kind: "TECHNICAL", scheduledAt: at, durationMinutes: 60 }, USER);
    const o = await getOpportunity(id);
    expect(o.stage.key).toBe("TECHNICAL_INTERVIEW");
    expect(o.firstResponseAt).toBe(today);
    expect(o.nextFollowUpAt).toBeNull();
    const prep = o.tasks.find((t) => t.kind === "PREPARATION" && t.interviewId === interview.id);
    expect(prep?.dueDate).toBe(addDays(today, 2));
    // Rescheduling moves the preparation task.
    await updateInterview(interview.id, { scheduledAt: new Date(`${addDays(today, 6)}T12:00:00Z`).toISOString() }, USER);
    const again = await getOpportunity(id);
    expect(again.tasks.find((t) => t.interviewId === interview.id && t.kind === "PREPARATION")?.dueDate).toBe(addDays(today, 5));
  });

  it("user edits override AI provenance and are audited", async () => {
    await updateOpportunity(id, { title: "Staff Software Engineer" }, USER);
    const o = await getOpportunity(id);
    expect(o.provenance.title.source).toBe("USER_ENTERED");
    const audit = await listAudit("opportunity", id);
    expect(audit.some((a) => a.action === "STATUS_CHANGE" && a.changes.some((c) => c.to === "TECHNICAL_INTERVIEW"))).toBe(true);
    expect(audit.some((a) => a.changes.some((c) => c.field === "title" && c.to === "Staff Software Engineer"))).toBe(true);
  });

  it("a rejection closes the application and stops follow-ups", async () => {
    const r = await changeStatus(id, { status: "REJECTED" }, USER);
    expect(r.opportunity.closedAt).toBe(today);
    expect(r.opportunity.nextFollowUpAt).toBeNull();
    const t = await getToday();
    expect(t.waiting.some((w) => w.opportunity?.id === id)).toBe(false);
  });
});

describe("documents & exact versions", () => {
  it("snapshots every version so what was sent survives file changes", async () => {
    const lib = process.env.DOCUMENTS_ROOT!;
    fs.mkdirSync(path.join(lib, "CV"), { recursive: true });
    const file = path.join(lib, "CV", "CV-HealthTech.pdf");
    fs.writeFileSync(file, "version one");
    const scan = await scanLibrary();
    expect(scan.newFiles.map((f) => f.relativePath)).toContain("CV/CV-HealthTech.pdf");
    expect(scan.newFiles[0].suggestedKind).toBe("CV");

    const doc = await createDocument({ name: "CV HealthTech", kind: "CV" }, USER);
    const v1 = await addVersionFromPath(doc.id, { path: "C:\\Candidature\\documents\\CV\\CV-HealthTech.pdf" }, USER); // host path mapped
    expect(v1.storage).toBe("LIBRARY");
    expect(v1.relativePath).toBe("CV/CV-HealthTech.pdf");
    await expect(addVersionFromPath(doc.id, { path: "CV/CV-HealthTech.pdf" }, USER)).rejects.toThrow(/identical/);

    const opp = await createOpportunity({ type: "JOB", title: "Backend Engineer", organizationName: "Alan" }, USER);
    await attachDocument({ opportunityId: opp.opportunity!.id, documentVersionId: v1.id, role: "CV" }, USER);
    const o = await getOpportunity(opp.opportunity!.id);
    expect(o.tasks.find((t) => t.autoRule === "doc:CV")?.done).toBe(true);

    // The user edits the CV in place.
    fs.writeFileSync(file, "version two — changed");
    const rescan = await scanLibrary();
    expect(rescan.modified.map((m) => m.documentId)).toContain(doc.id);
    const v2 = await addVersionFromPath(doc.id, { path: "CV/CV-HealthTech.pdf", label: "rewrite" }, USER);
    expect(v2.version).toBe(2);
    const sent = await resolveVersionFile(v1.id, "snapshot");
    expect(fs.readFileSync(sent.path, "utf8")).toBe("version one");
    const details = await getDocument(doc.id);
    expect(details.versions.find((v) => v.id === v1.id)?.usageCount).toBe(1);
    await expect(deleteVersion(v1.id, USER)).rejects.toThrow(/used in 1 application/);
  });

  it("keeps external paths as references only", async () => {
    const doc = await createDocument({ name: "Old CV", kind: "CV" }, USER);
    const v = await addVersionFromPath(doc.id, { path: "D:\\Archive\\cv-2019.pdf" }, USER);
    expect(v.storage).toBe("EXTERNAL");
    expect(v.displayPath).toBe("D:\\Archive\\cv-2019.pdf");
  });
});

describe("inbox → review → opportunity", () => {
  it("captures text, rejects duplicate captures and verifies submitted analyses", async () => {
    const text = "Owkin recrute un Machine Learning Engineer à Paris. CDI. Salaire 65-75k€. Candidatures avant le 30/11/2026.";
    const first = await createCapture({ text }, USER, { analyze: false });
    expect(first.duplicate).toBe(false);
    const again = await createCapture({ text }, USER, { analyze: false });
    expect(again.duplicate).toBe(true);
    expect(again.item.id).toBe(first.item.id);

    const item = await submitAnalysis(
      first.item.id,
      {
        kind: "JOB_POSTING",
        kindConfidence: "HIGH",
        title: "Owkin — ML Engineer",
        opportunity: { type: "JOB", title: "Machine Learning Engineer", organizationName: "Owkin", locationCity: "Lyon", contractType: "CDI", salaryMin: 65000, salaryMax: 75000, deadline: "30/11/2026" },
        fieldSources: [
          { field: "organizationName", source: "EXTRACTED", confidence: "HIGH", evidence: "Owkin recrute" },
          { field: "salaryMin", source: "EXTRACTED", confidence: "HIGH", evidence: "Salaire 65-75k€" },
          { field: "locationCity", source: "EXTRACTED", confidence: "HIGH", evidence: "basé à Lyon" },
        ],
      },
      CLAUDE,
    );
    expect(item.status).toBe("READY");
    const result = storedResult(item)!;
    expect(result.opportunity?.deadline).toBe("2026-11-30");
    expect(result.fieldSources.find((f) => f.field === "locationCity")).toMatchObject({ source: "INFERRED", verified: false });

    const draft = draftFromCapture(result, item, { by: "CLAUDE" })!;
    const created = await convertToOpportunity(item.id, draft.input, USER, { force: true });
    expect(created.created).toBe(true);
    const converted = await getInboxItem(item.id);
    expect(converted.status).toBe("CONVERTED");
    expect(converted.convertedId).toBe(created.opportunity!.id);
    const opp = await getOpportunity(created.opportunity!.id);
    expect(opp.capture?.id).toBe(item.id);
    expect(opp.events[0].type).toBe("IMPORTED");
  });

  it("applies the actions proposed for an interview invitation email", async () => {
    const r = await createOpportunity({ type: "JOB", title: "Software Engineer", organizationName: "Roche", status: "APPLIED" }, USER);
    const oppId = r.opportunity!.id;
    const outcomes = await applyActions(
      [
        { type: "UPSERT_CONTACT", opportunityId: oppId, ref: { fullName: "Marc Weber", email: "marc@roche.example", role: "Talent Acquisition" } },
        { type: "LOG_EVENT", opportunityId: oppId, eventType: "EMAIL", title: "Interview invitation", body: "…", direction: "INBOUND", contactRef: { email: "marc@roche.example" } },
        { type: "SET_STATUS", opportunityId: oppId, status: "MANAGER_INTERVIEW" },
        { type: "ADD_INTERVIEW", opportunityId: oppId, kind: "MANAGER", date: addDays(today, 7), time: "10:30", meetingUrl: "https://teams.example/x" },
        { type: "ADD_TASK", opportunityId: oppId, title: "Confirm attendance", dueDate: today },
      ],
      USER,
    );
    expect(outcomes.every((o) => o.ok)).toBe(true);
    const o = await getOpportunity(oppId);
    expect(o.stage.key).toBe("MANAGER_INTERVIEW");
    expect(o.contacts.map((c) => c.fullName)).toEqual(["Marc Weber"]);
    expect(o.interviews[0].meetingUrl).toBe("https://teams.example/x");
    expect(o.firstResponseAt).toBe(today);
    const contacts = await db.select().from(s.contacts).where(eq(s.contacts.fullName, "Marc Weber"));
    expect(contacts).toHaveLength(1); // matched by email, not duplicated
  });
});

describe("rules engine", () => {
  it("emits deadline and missing-document notifications once", async () => {
    await createOpportunity({ type: "FORMATION", title: "Master Bioinformatique", organizationName: "Université Paris Cité", deadline: addDays(today, 2), requiredDocuments: ["CV", "Lettre de motivation"] }, USER);
    const first = await evaluatePeriodicRules();
    expect(first.deadlines).toBeGreaterThanOrEqual(1);
    expect(first.missingDocuments).toBeGreaterThanOrEqual(1);
    const second = await evaluatePeriodicRules();
    expect(second.deadlines).toBe(0);
    const notifications = await listNotifications();
    expect(notifications.some((n) => n.kind === "deadline_urgent")).toBe(true);
  });
});

describe("export / import", () => {
  it("round-trips all data through the versioned JSON format", async () => {
    const file = await exportAll();
    expect(file.schemaVersion).toBe(1);
    expect(file.counts.opportunities).toBeGreaterThan(0);
    const serialized = JSON.parse(JSON.stringify(file));

    const { db: other } = await createTestDb();
    const counts = await importAll(serialized, "replace", USER);
    expect(counts.opportunities).toBe(file.counts.opportunities);
    expect(counts.documentVersions).toBe(file.counts.documentVersions);
    const again = await exportAll();
    const { auditLogs, ...rest } = again.counts;
    const { auditLogs: auditBefore, ...restBefore } = file.counts;
    expect(rest).toEqual(restBefore);
    expect(auditLogs).toBe(auditBefore + 1); // the import itself is audited
    // Merge is idempotent.
    const merged = await importAll(serialized, "merge", USER);
    expect(merged.opportunities).toBe(0);
    expect((await other.select().from(s.opportunities)).length).toBe(file.counts.opportunities);
  });

  it("rejects foreign or future files", async () => {
    await expect(importAll({ hello: "world" }, "merge", USER)).rejects.toThrow(/Not a Career OS export/);
    await expect(importAll({ app: "career-os", schemaVersion: 99, data: {} }, "merge", USER)).rejects.toThrow(/newer/);
  });
});

describe("MCP server & REST API", () => {
  it("speaks MCP: initialize, tools/list, tools/call", async () => {
    const init = (await handleMcpPayload({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("career-os");
    expect(await handleMcpPayload({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const list = (await handleMcpPayload({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as { result: { tools: { name: string; inputSchema: { type: string } }[] } };
    expect(list.result.tools.length).toBeGreaterThan(25);
    expect(list.result.tools.every((t) => t.inputSchema.type === "object")).toBe(true);

    const call = (await handleMcpPayload({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "create_opportunity", arguments: { type: "VIE", title: "VIE Data Engineer", organizationName: "Sanofi", locationCity: "Singapore" } },
    })) as { result: { isError: boolean; structuredContent: { created: boolean; id: string } } };
    expect(call.result.isError).toBe(false);
    const created = await getOpportunity(call.result.structuredContent.id);
    expect(created.events[0].actor).toBe("CLAUDE");

    const bad = (await handleMcpPayload({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "set_status", arguments: { id: "not-a-uuid" } } })) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    const unknown = (await handleMcpPayload({ jsonrpc: "2.0", id: 5, method: "nope" })) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
  });

  it("serves the REST API with validation errors and 404s", async () => {
    const ok = await dispatch(new Request("http://localhost/api/v1/today"), ["today"]);
    expect(ok.status).toBe(200);
    const invalid = await dispatch(new Request("http://localhost/api/v1/opportunities", { method: "POST", body: JSON.stringify({ type: "JOB" }), headers: { "content-type": "application/json" } }), ["opportunities"]);
    expect(invalid.status).toBe(400);
    const missing = await dispatch(new Request("http://localhost/api/v1/nothing"), ["nothing"]);
    expect(missing.status).toBe(404);
    const wrongMethod = await dispatch(new Request("http://localhost/api/v1/today", { method: "DELETE" }), ["today"]);
    expect(wrongMethod.status).toBe(405);
  });
});

describe("command snapshot", () => {
  it("builds the snapshot with an upcoming interview (no Date-binding crash)", async () => {
    const opp = await createOpportunity({ type: "JOB", title: "Snapshot Engineer", organizationName: "Snapshot Co" }, USER);
    const oppId = opp.opportunity!.id;
    await createInterview({ opportunityId: oppId, kind: "HR", scheduledAt: `${addDays(today, 3)}T09:00:00Z` }, USER);
    // Regression: the upcoming-interviews query used to interpolate a JS Date into a raw sql`` template,
    // which postgres.js refused to bind ("Received an instance of Date"). It must not throw.
    const snapshot = await commandSnapshot();
    expect(snapshot.today).toBeTruthy();
    expect(Array.isArray(snapshot.opportunities)).toBe(true);
    expect(snapshot.upcomingInterviews.some((i) => i.opportunityId === oppId)).toBe(true);
  });
});
