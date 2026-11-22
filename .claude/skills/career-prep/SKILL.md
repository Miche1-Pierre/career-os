---
name: career-prep
description: Prepare an interview or analyze an opportunity against the user's profile in Career OS — likely questions with prepared answers, questions to ask, projects to present, descriptive match/gap analysis saved in the app. Use when the user says "prépare mon entretien", "analyse cette offre par rapport à mon profil", or before an upcoming interview.
---

# Interview preparation & descriptive analysis

## Interview preparation
1. `search` / `list_opportunities` to find the opportunity, then `get_opportunity` (interviews, timeline, contacts,
   documents used — e.g. which CV version was sent) and `get_profile`.
2. Build the preparation from facts only (posting requirements, company info in notes, interviewer role, the user's
   profile). For the interview type (HR, TECHNICAL, MANAGER, FOUNDER, CASE_STUDY, ACADEMIC…):
   - `questions` with `kind: "EXPECTED"`: 8–12 likely questions; `answer` = a draft based on the user's real
     experience (STAR structure), clearly marked `[à compléter]` where the profile lacks facts — never invent achievements.
   - `questions` with `kind: "TO_ASK"`: 5–8 questions to ask (team, product, expectations, next steps).
   - `preparation` (Markdown): projects to present and why, points of the posting to address, company notes,
     interviewer notes, logistics (time, link, duration).
   Each question item needs an `id` (any unique string).
3. `update_interview { id, patch: { preparation, questions } }` (keep existing questions: merge, don't overwrite
   without asking). If no interview exists yet, ask for date/time or create it with `add_interview` (status TO_SCHEDULE).
4. After the interview, when the user debriefs: `update_interview` with `notes`, `feedback`, `outcome`
   (PASSED/FAILED/UNKNOWN) and `status: "COMPLETED"` — a thank-you task and the next follow-up are created automatically.

## Descriptive analysis (matching)
1. `get_opportunity` + `get_profile` + `list_documents`.
2. `save_analysis` with: `summary`; `dimensions` among technical, domain, experience, education, language, location,
   product, international — each `{ key, label, level: HIGH|MEDIUM|LOW|UNKNOWN, score: 0–100 or null, rationale citing
   both sides, matched: [], gaps: [] }`; `potentialGaps`, `questionsToClarify`, `suggestedDocuments`,
   `talkingPoints`, `caveats`.
3. Never recommend applying or not; say what is unknown. Give the analysis URL (`…?tab=analysis`).
