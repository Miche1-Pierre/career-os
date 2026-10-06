import { describe, expect, it } from "vitest";
import { captureAnalysisLenientSchema, captureAnalysisStrictSchema, type CaptureAnalysis } from "@/lib/capture-schema";
import { draftFromCapture, detectSource } from "@/lib/capture-mapping";
import { toStructuredOutputSchema } from "@/server/ai/json-schema";
import { evidenceFound, normalizeForMatch, verifyCaptureAnalysis } from "@/server/ai/verify";
import { extractJsonLdHints } from "@/server/capture/jsonld";
import { extractHtml } from "@/server/capture/html";
import { looksLikeEmail, parseEmail } from "@/server/capture/files";
import { opportunityAnalysisSchema } from "@/lib/schemas";

const POSTING = `Zefir — Senior Software Engineer (H/F)
Paris · CDI · Hybride
Missions : concevoir la plateforme, encadrer l'équipe.
Profil : 5+ ans d'expérience, TypeScript, React.
Salaire : 70–87 k€ brut annuel.
Candidatures avant le 15 octobre.`;

function baseAnalysis(overrides: Partial<NonNullable<CaptureAnalysis["opportunity"]>> = {}, fieldSources: CaptureAnalysis["fieldSources"] = []): CaptureAnalysis {
  const empty = captureAnalysisLenientSchema.parse({ kind: "JOB_POSTING", opportunity: { type: "JOB" } }) as CaptureAnalysis;
  return {
    ...empty,
    kind: "JOB_POSTING",
    kindConfidence: "HIGH",
    title: "Zefir — Senior Software Engineer",
    opportunity: { ...empty.opportunity!, type: "JOB", ...overrides },
    fieldSources,
  };
}

describe("structured output schemas", () => {
  it("produce strict JSON Schemas without unsupported keywords", () => {
    const schema = toStructuredOutputSchema(captureAnalysisStrictSchema);
    const text = JSON.stringify(schema);
    expect(text).not.toMatch(/"(minLength|maxLength|minimum|maximum|pattern|\$schema)"/);
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    // nullable strings are expressed with anyOf
    expect(text).toContain('"anyOf"');
    const analysis = toStructuredOutputSchema(opportunityAnalysisSchema);
    expect(JSON.stringify(analysis)).not.toContain("minimum");
  });

  it("parse tolerant model output (missing keys, wrong casing, numbers as strings)", () => {
    const parsed = captureAnalysisLenientSchema.parse({
      kind: "JOB_POSTING",
      kindConfidence: "high",
      opportunity: { type: "JOB", title: "Dev", salaryMin: "70 000", remotePolicy: "hybrid", responsibilities: "not a list" },
      fieldSources: [{ field: "title", source: "EXTRACTED", confidence: "HIGH", evidence: "Dev" }],
    });
    expect(parsed.opportunity?.salaryMin).toBe(70000);
    expect(parsed.opportunity?.remotePolicy).toBe("HYBRID");
    expect(parsed.opportunity?.responsibilities).toEqual([]);
    expect(parsed.kindConfidence).toBe("MEDIUM"); // lowercase → invalid enum → default
    expect(parsed.opportunity?.deadline).toBeNull();
    expect(parsed.contacts).toEqual([]);
  });
});

describe("anti-hallucination verification", () => {
  it("normalizes text for matching", () => {
    expect(normalizeForMatch("Salaire : 70–87 k€ !")).toBe("salaire 70 87 k€");
    expect(evidenceFound("70–87 k€ brut annuel", normalizeForMatch(POSTING))).toBe(true);
  });

  it("verifies real quotes and downgrades invented ones to INFERRED", () => {
    const analysis = baseAnalysis({ organizationName: "Zefir", salaryMin: 70000, salaryMax: 87000, locationCity: "Lyon" }, [
      { field: "organizationName", source: "EXTRACTED", confidence: "HIGH", evidence: "Zefir — Senior Software Engineer" },
      { field: "salaryMin", source: "EXTRACTED", confidence: "HIGH", evidence: "70–87 k€ brut annuel" },
      { field: "locationCity", source: "EXTRACTED", confidence: "HIGH", evidence: "Basé à Lyon" },
    ]);
    const result = verifyCaptureAnalysis(analysis, { sourceText: POSTING, timeZone: "Europe/Paris" });
    const byField = Object.fromEntries(result.fieldSources.map((f) => [f.field, f]));
    expect(byField.organizationName).toMatchObject({ source: "EXTRACTED", verified: true });
    expect(byField.salaryMin).toMatchObject({ source: "EXTRACTED", verified: true });
    expect(byField.locationCity).toMatchObject({ source: "INFERRED", verified: false });
    expect(result.warnings.join(" ")).toMatch(/could not be verified/);
  });

  it("never keeps a quote that does not exist, even when the value is right", () => {
    const analysis = baseAnalysis({ contractType: "CDI" }, [{ field: "contractType", source: "EXTRACTED", confidence: "HIGH", evidence: "contrat à durée indéterminée" }]);
    const result = verifyCaptureAnalysis(analysis, { sourceText: POSTING, timeZone: "Europe/Paris" });
    expect(result.fieldSources.find((f) => f.field === "contractType")).toMatchObject({ source: "EXTRACTED", verified: true, evidence: null });
  });

  it("classifies fields filled without provenance conservatively", () => {
    const analysis = baseAnalysis({ title: "Senior Software Engineer", seniority: "Staff" });
    const result = verifyCaptureAnalysis(analysis, { sourceText: POSTING, timeZone: "Europe/Paris" });
    const byField = Object.fromEntries(result.fieldSources.map((f) => [f.field, f]));
    expect(byField.title).toMatchObject({ source: "EXTRACTED", verified: true });
    expect(byField.seniority).toMatchObject({ source: "INFERRED", confidence: "LOW", verified: false });
  });

  it("normalizes dates and drops invalid ones", () => {
    const analysis = baseAnalysis({ deadline: "15/10/2026", applicationOpensAt: "le 3 mars", deadlineTime: "25:99" });
    const result = verifyCaptureAnalysis(analysis, { sourceText: POSTING, timeZone: "Europe/Paris" });
    expect(result.opportunity?.deadline).toBe("2026-10-15");
    expect(result.opportunity?.applicationOpensAt).toBeNull();
    expect(result.opportunity?.deadlineTime).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Unrecognized date/);
  });

  it("only accepts candidate ids and known status keys for emails", () => {
    const analysis = captureAnalysisLenientSchema.parse({
      kind: "EMAIL",
      communication: { channel: "EMAIL", intent: "INTERVIEW_INVITATION", matchedOpportunityId: "made-up-id", suggestedStatus: "DREAM_JOB", interview: { kind: "HR", date: "06/10/2026", time: "10h30" } },
    }) as CaptureAnalysis;
    const result = verifyCaptureAnalysis(analysis, { sourceText: "x", timeZone: "Europe/Paris", candidateIds: ["real-id"], stageKeys: ["HR_INTERVIEW"] });
    expect(result.communication?.matchedOpportunityId).toBeNull();
    expect(result.communication?.suggestedStatus).toBeNull();
    expect(result.communication?.interview?.date).toBe("2026-10-06");
    expect(result.communication?.interview?.time).toBe("10:30");
  });

  it("fills gaps from JSON-LD structured data and marks validThrough as inferred", () => {
    const hints = extractJsonLdHints([
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Data Engineer",
        hiringOrganization: { "@type": "Organization", name: "Owkin" },
        jobLocation: { "@type": "Place", address: { addressLocality: "Paris", addressCountry: "FR" } },
        baseSalary: { "@type": "MonetaryAmount", currency: "EUR", value: { minValue: 60000, maxValue: 70000, unitText: "YEAR" } },
        validThrough: "2026-11-30T23:59:00+01:00",
        description: "<p>Build <b>pipelines</b></p>",
      },
    ]);
    expect(hints).toMatchObject({ title: "Data Engineer", organizationName: "Owkin", city: "Paris", salaryMin: 60000, validThrough: "2026-11-30" });
    const result = verifyCaptureAnalysis(baseAnalysis(), { sourceText: "Build pipelines", timeZone: "Europe/Paris", hints });
    expect(result.opportunity?.organizationName).toBe("Owkin");
    expect(result.opportunity?.deadline).toBe("2026-11-30");
    const deadline = result.fieldSources.find((f) => f.field === "deadline");
    expect(deadline).toMatchObject({ source: "INFERRED", verified: true });
  });
});

describe("capture → opportunity draft", () => {
  it("maps the analysis into an OpportunityInput with provenance keys", () => {
    const analysis = baseAnalysis(
      { title: "Senior Software Engineer", organizationName: "Zefir", contractType: "CDI", salaryMin: 70000, requiredDocuments: ["CV", "CV", "Lettre de motivation"], applicationUrl: "https://jobs.zefir.example/apply" },
      [
        { field: "salaryMin", source: "EXTRACTED", confidence: "HIGH", evidence: "70–87 k€" },
        { field: "organizationName", source: "EXTRACTED", confidence: "HIGH", evidence: "Zefir" },
      ],
    );
    const verified = verifyCaptureAnalysis(analysis, { sourceText: POSTING, timeZone: "Europe/Paris" });
    const draft = draftFromCapture(verified, { id: "11111111-1111-1111-1111-111111111111", sourceUrl: "https://www.linkedin.com/jobs/view/4000000009", rawText: POSTING })!;
    expect(draft.input).toMatchObject({ type: "JOB", title: "Senior Software Engineer", organizationName: "Zefir", source: "LINKEDIN", url: "https://www.linkedin.com/jobs/view/4000000009" });
    expect(draft.input.details).toMatchObject({ contractType: "CDI", salaryMin: 70000 });
    expect(draft.input.requiredDocuments).toEqual(["CV", "Lettre de motivation"]);
    expect(draft.input.links).toEqual([{ kind: "APPLICATION", url: "https://jobs.zefir.example/apply", label: null }]);
    expect(draft.provenance["details.salaryMin"]).toMatchObject({ source: "EXTRACTED", captureId: "11111111-1111-1111-1111-111111111111" });
    expect(draft.provenance.organizationId).toBeDefined();
    expect(draft.input.description).toBe(POSTING);
  });

  it("detects sources from URLs", () => {
    expect(detectSource("https://www.welcometothejungle.com/fr/companies/x/jobs/y")).toBe("WELCOME_TO_THE_JUNGLE");
    expect(detectSource("https://www.monmaster.gouv.fr/formation/123")).toBe("MON_MASTER");
    expect(detectSource("https://jobs.lever.co/zefir/1")).toBe("COMPANY_WEBSITE");
    expect(detectSource("https://www.epfl.ch/education/master")).toBe("UNIVERSITY_WEBSITE");
    expect(detectSource("https://unknown.example/job")).toBeNull();
  });
});

describe("capture parsing", () => {
  it("parses pasted emails with headers", () => {
    const raw = "From: Marc Weber <marc@roche.example>\nTo: me@example.com\nSubject: Interview invitation\nDate: Mon, 28 Sep 2026 16:42:00 +0200\n\nDear candidate,\nWe would like to invite you.";
    expect(looksLikeEmail(raw)).toBe(true);
    const parsed = parseEmail(raw);
    expect(parsed.email).toMatchObject({ from: "Marc Weber <marc@roche.example>", subject: "Interview invitation" });
    expect(parsed.text).toContain("We would like to invite you.");
  });

  it("decodes encoded subjects", () => {
    const parsed = parseEmail("From: a@b.c\nSubject: =?UTF-8?B?RW50cmV0aWVuIMOgIFBhcmlz?=\n\nbody");
    expect(parsed.email?.subject).toBe("Entretien à Paris");
  });

  it("extracts readable text and JSON-LD from HTML", () => {
    const html = `<!doctype html><html><head><title>Job</title><meta property="og:site_name" content="Careers">
      <script type="application/ld+json">{"@type":"JobPosting","title":"Backend Engineer","hiringOrganization":{"name":"Alan"}}</script></head>
      <body><nav>Menu</nav><main><h1>Backend Engineer</h1><p>${"Nous recrutons un ingénieur backend pour notre plateforme santé. ".repeat(12)}</p></main><footer>Footer</footer></body></html>`;
    const r = extractHtml(html);
    expect(r.siteName).toBe("Careers");
    expect(r.jsonLd).toHaveLength(1);
    expect(r.text).toContain("ingénieur backend");
    expect(extractJsonLdHints(r.jsonLd)?.organizationName).toBe("Alan");
  });
});
