---
name: career-today
description: Daily Career OS review — what is overdue, due today and coming up (follow-ups, interviews, deadlines, missing documents, applications waiting), with drafted follow-up emails and quick status updates. Use when the user asks "qu'est-ce que je dois faire aujourd'hui", "mes relances", "ma semaine", or wants to update several applications at once.
---

# Daily review with Career OS

1. `get_today` (use `horizonDays: 7`, or 14 for "ma semaine").
2. Present, in this order and only non-empty sections: **En retard**, **Aujourd'hui**, **Entretiens à venir**,
   **Deadlines**, **Documents manquants**, **En attente de réponse**, **Suggestions** (automation). One line per item:
   date/heure — organisation — action — lien.
3. Offer concrete next steps:
   - Follow-ups due → draft each email with `render_email_template { opportunityId }` (adapt it to the context from
     `get_opportunity`: last exchange, contact name). Show drafts; the user sends them. When the user confirms it was
     sent → `follow_up { opportunityId, action: "done", channel: "EMAIL" }` (the next follow-up is scheduled
     automatically). “Plus tard” → `follow_up { action: "snooze", days }`.
   - Interview tomorrow → propose the `career-prep` skill.
   - Deadline soon with missing documents → list them (from the checklist) and link the Documents tab.
   - “No answer after N follow-ups” suggestions → ask whether to mark as GHOSTED (`set_status`) — never do it silently.
4. Batch updates from the user (“j'ai postulé chez A et B, entretien RH chez C jeudi 10h”) → `search` each one, then
   `set_status` / `add_interview`; summarize what changed with links.
