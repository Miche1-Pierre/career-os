import { describe, expect, it } from "vitest";
import { computeNextFollowUp, describeInterval, resolveFollowUpInterval } from "@/lib/followups";
import { findDuplicateMatches, scoreDuplicate } from "@/lib/duplicates";
import { diceSimilarity, normalizeOrgName, normalizeTitle, normalizeUrl, renderTemplate, uniqueStrings } from "@/lib/text";
import { computeSkillMatch } from "@/lib/matching";
import { DEFAULT_SETTINGS } from "@/lib/settings-schema";
import { documentRoleFor } from "@/server/services/tasks";

const settings = DEFAULT_SETTINGS.followUp;
const FR = { holidays: "FR" as const };

describe("follow-up engine", () => {
  it("resolves the interval by priority: custom > post-interview > recruiter > type default", () => {
    expect(resolveFollowUpInterval({ type: "JOB" }, settings)).toMatchObject({ days: 7, reason: "type_default" });
    expect(resolveFollowUpInterval({ type: "FORMATION" }, settings)).toMatchObject({ days: 14 });
    expect(resolveFollowUpInterval({ type: "JOB", source: "RECRUITER" }, settings)).toMatchObject({ days: 5, reason: "recruiter" });
    expect(resolveFollowUpInterval({ type: "JOB", source: "RECRUITER" }, settings, { afterInterview: true })).toMatchObject({ days: 5, reason: "post_interview" });
    expect(resolveFollowUpInterval({ type: "JOB", followUpIntervalDays: 10 }, settings, { afterInterview: true })).toMatchObject({ days: 10, reason: "custom" });
  });

  it("follows the spec example: applied 29/09 + 7 days → 06/10", () => {
    const interval = resolveFollowUpInterval({ type: "JOB" }, settings);
    expect(computeNextFollowUp("2026-09-29", interval)).toBe("2026-10-06");
  });

  it("supports business days and holidays", () => {
    const interval = { days: 5, businessDays: true, reason: "custom" as const };
    expect(computeNextFollowUp("2026-12-21", interval, { calendar: FR })).toBe("2026-12-29"); // skips 25/12 + weekend
  });

  it("waits until after the announced answer date", () => {
    const interval = resolveFollowUpInterval({ type: "JOB" }, settings);
    expect(computeNextFollowUp("2026-09-29", interval, { expectedResponseAt: "2026-10-09", calendar: FR })).toBe("2026-10-12");
  });

  it("disables follow-ups with a 0-day interval", () => {
    expect(computeNextFollowUp("2026-09-29", { days: 0, businessDays: false, reason: "custom" })).toBeNull();
    expect(describeInterval({ days: 0, businessDays: false, reason: "custom" })).toMatch(/No automatic/);
  });
});

describe("duplicates", () => {
  it("normalizes URLs (tracking parameters, LinkedIn variants)", () => {
    expect(normalizeUrl("https://www.linkedin.com/jobs/view/senior-engineer-at-zefir-4000000001/?trk=abc&refId=x")).toBe("linkedin.com/jobs/view/4000000001");
    expect(normalizeUrl("https://fr.linkedin.com/jobs/view/4000000001")).toBe("linkedin.com/jobs/view/4000000001");
    expect(normalizeUrl("https://jobs.lever.co/zefir/123?utm_source=x&lever-source=y")).toBe("jobs.lever.co/zefir/123?lever-source=y");
  });

  it("normalizes organization names and titles", () => {
    expect(normalizeOrgName("Zefir SAS")).toBe("zefir");
    expect(normalizeOrgName("Roche Diagnostics GmbH")).toBe("roche diagnostics");
    expect(normalizeTitle("Senior Software Engineer (H/F) - CDI")).toBe("senior software engineer");
  });

  it("scores the same posting URL as a certain duplicate", () => {
    const m = scoreDuplicate({ title: "x", url: "https://www.welcometothejungle.com/fr/jobs/abc?utm_campaign=1" }, { id: "1", title: "Other", organizationName: "Other", url: "https://welcometothejungle.com/fr/jobs/abc" });
    expect(m?.score).toBe(1);
  });

  it("detects same organization + similar title and ignores different companies", () => {
    const candidates = [
      { id: "a", title: "Senior Software Engineer", organizationName: "Zefir", url: null },
      { id: "b", title: "Senior Software Engineer", organizationName: "Doctolib", url: null },
      { id: "c", title: "Product Designer", organizationName: "Zefir", url: null },
    ];
    const matches = findDuplicateMatches({ title: "Senior Software Engineer (H/F)", organizationName: "ZEFIR SAS" }, candidates);
    expect(matches.map((m) => m.id)).toEqual(["a"]);
    expect(matches[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it("computes string similarity", () => {
    expect(diceSimilarity("senior software engineer", "senior software engineer")).toBe(1);
    expect(diceSimilarity("senior software engineer", "software engineer senior")).toBeGreaterThan(0.7);
    expect(diceSimilarity("backend", "product manager")).toBeLessThan(0.3);
  });
});

describe("text & matching helpers", () => {
  it("renders email templates", () => {
    expect(renderTemplate("Bonjour {{contactFirstName}}, {{title}} chez {{organization}}{{missing}}", { contactFirstName: "Jean", title: "SWE", organization: "Zefir" })).toBe("Bonjour Jean, SWE chez Zefir");
  });

  it("deduplicates strings case-insensitively", () => {
    expect(uniqueStrings(["React", "react", " Node.js ", "", null])).toEqual(["React", "Node.js"]);
  });

  it("matches skills with aliases", () => {
    const m = computeSkillMatch(["TypeScript", "React.js", "Postgres", "Kubernetes"], ["typescript", "React", "PostgreSQL"]);
    expect(m.matched).toEqual(["TypeScript", "React.js", "Postgres"]);
    expect(m.missing).toEqual(["Kubernetes"]);
    expect(m.coverage).toBe(75);
  });

  it("maps required documents to document roles (FR/EN)", () => {
    expect(documentRoleFor("Lettre de motivation")).toBe("COVER_LETTER");
    expect(documentRoleFor("Relevés de notes (L3, M1)")).toBe("TRANSCRIPT");
    expect(documentRoleFor("2 lettres de recommandation")).toBe("RECOMMENDATION");
    expect(documentRoleFor("TOEIC ≥ 785")).toBe("LANGUAGE_CERT");
    expect(documentRoleFor("Resume")).toBe("CV");
    expect(documentRoleFor("Something else")).toBeNull();
  });
});
