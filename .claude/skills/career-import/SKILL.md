---
name: career-import
description: Import a job posting, internship, VIE, master/formation or PhD into Career OS from pasted text, a URL or a local file (PDF/DOCX), with field-level provenance and duplicate check. Use when the user says "ajoute cette offre", "importe cette formation", pastes a posting, or gives a posting URL/file.
---

# Import an opportunity into Career OS

1. **Get the content.** Pasted text: use it as-is. URL: try `capture` with `{ url, analyze: false }` and read it back
   with `get_inbox_item` (the server fetches the page and its JSON-LD); if the site blocks it (LinkedIn…), ask the user
   to paste the text. Local file: read it yourself (Read tool), then work from its text.
2. **Classify the type**: JOB, INTERNSHIP, ALTERNANCE, VIE, FORMATION (master/degree/school), PHD, PROGRAM, OTHER.
3. **Check duplicates**: `check_duplicates { title, organizationName, url }`. Strong match → show it, ask before continuing.
4. **Extract only what is written.** Build the `create_opportunity` input:
   - `type`, `title`, `organizationName` (+ `organizationWebsite`), `url` (posting / program page), `links` (application
     portal as `{ kind: "APPLICATION", url }`), `locationCity`, `locationCountry`, `remotePolicy` (ONSITE/HYBRID/REMOTE),
     `source` (LINKEDIN, WELCOME_TO_THE_JUNGLE, INDEED, GLASSDOOR, MON_MASTER, UNIVERSITY_WEBSITE, COMPANY_WEBSITE, REFERRAL…).
   - Lists, one idea per item, in the source language: `responsibilities`, `requirements` (prerequisites), `skills`,
     `technologies`, `niceToHave`, `benefits`, `requiredDocuments` (CV, lettre de motivation, relevés de notes,
     recommandations, certificat de langue… — each becomes a checklist item).
   - `deadline` (YYYY-MM-DD) + `deadlineTime`, `applicationOpensAt` for programs.
   - `details`: jobs → `contractType` (CDI, CDD, FREELANCE, INTERNSHIP, ALTERNANCE, VIE…), `seniority`, `experienceYears`,
     `salaryMin`/`salaryMax` (numbers, e.g. 70000), `salaryCurrency`, `salaryPeriod` (YEAR/MONTH/DAY/HOUR), `salaryText`
     (original wording), `department`, `startDate`, `duration`; education → `department`, `level`, `entryYear`, `format`
     (FULL_TIME/PART_TIME/ONLINE/HYBRID/ALTERNANCE), `duration`, `teachingLanguage`, `languageRequirement`,
     `tuitionFees`, `applicationFee`, `alternance`, `subjects`, `careerOutcomes`, `selectionProcess`.
   - `summary`: 1–2 factual sentences in French. `tags`: reuse existing tags (`get_reference`), at most 3 new ones.
   - `description`: the full original text (kept for reference).
   - `contacts`: named people only (`fullName`, `role`, `email`, `relationship`: RECRUITER, HIRING_MANAGER, PROFESSOR…).
   - `status`: default (TO_APPLY) unless the user says they already applied (then APPLIED / APPLICATION_SUBMITTED + `appliedAt`).
5. **Provenance for every field you fill**: `provenance: { "<field>": { source: "EXTRACTED", confidence: "HIGH",
   evidence: "<verbatim quote ≤ 25 words>" } }`; `INFERRED` for deductions (country from city, currency from €, year
   of a date). Keys: top-level field names, `details.<name>` for details, `organizationId` for the organization.
   Unknown → omit the field. Never guess a salary, a deadline or a year.
6. `create_opportunity` (with `captureId` if it came from the inbox). Then reply with: title — organization, status,
   deadline, key facts, what is still unknown, and the `url`.
