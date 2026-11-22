---
name: career-inbox
description: Process the Career OS inbox — analyze raw captures (postings, program pages, recruiter emails, LinkedIn messages, notes) and submit structured, provenance-checked analyses for review, or apply the obvious actions. Use when the user says "traite mon inbox", "process my inbox", or asks what is waiting in Career OS.
---

# Process the Career OS inbox

1. `list_inbox` (view "active"). Focus on status NEW and FAILED; READY items are already waiting for the user's review.
2. For each item: `get_inbox_item` → read `rawText`, `extras` (JSON-LD, email headers) and `context`
   (today, status keys, existing tags, candidate opportunities).
3. Produce the analysis exactly in the `submit_inbox_analysis` schema:
   - `kind`: JOB_POSTING | PROGRAM | EMAIL | MESSAGE | NOTE | OTHER, with `kindConfidence`.
   - Postings/programs → `opportunity` (every field present, `null` when unknown, lists `[]`), plus `fieldSources`:
     one entry per filled field `{ field, source: EXTRACTED|INFERRED, confidence, evidence: verbatim quote }`.
   - Emails/messages → `communication`: intent (INTERVIEW_INVITATION, REJECTION, OFFER, ADMISSION, WAITLIST,
     RECRUITER_OUTREACH…), sender, `matchedOpportunityId` **only** from `context.candidateOpportunities`,
     `suggestedStatus` **only** from `context.statusKeys`, `interview` {kind, date, time, timezone, meetingUrl…}, `nextAction`.
   - Notes → `note`: summary, facts, tasks with due dates, `matchedOpportunityId`, followUpDate.
   - `title` (short label), `summary` and generated text in French. `warnings` for ambiguities (missing year, timezone…).
4. `submit_inbox_analysis { id, analysis }`. The server verifies every quote against the raw text and reports
   `unverifiedFields` — fix or downgrade them if needed.
5. Default: leave the final decision to the user in the app (Inbox → Review). If the user asked you to go all the
   way, convert: postings → `convert_inbox_item { to: "opportunity" }` (after `check_duplicates`); emails/notes →
   `apply_actions` with `inboxId` (LOG_EVENT, UPSERT_CONTACT, SET_STATUS, ADD_INTERVIEW, ADD_TASK…). Ask before any
   closing status (REJECTED…).
6. Finish with a short table: item → what was detected → what is pending review (with the review URLs).
