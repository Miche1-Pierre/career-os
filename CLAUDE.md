# Career OS

Personal career operating system of the user (jobs, internships, VIE, masters/formations, PhDs).
Next.js 16 + PostgreSQL (Drizzle) + shadcn/ui, running with Docker Compose on http://localhost:3000.

This folder is used in two ways. Figure out which one the user wants:

1. **Operating Career OS** (most conversations): the user pastes a job posting, an email, notes, asks what to do
   today, wants a follow-up drafted… → use the `career-os` MCP tools. Do **not** edit code or query the database
   directly for this.
2. **Developing Career OS**: the user asks to change the app itself → see “Development” below.

## Operating Career OS (MCP server `career-os`)

The app exposes an MCP server at `http://localhost:3000/api/mcp` (declared in `.mcp.json`). If its tools are
missing, the app is probably stopped: tell the user to run `docker compose up -d` (then `/mcp` → reconnect).

Rules — they matter more than speed:

- **Never invent data.** Unknown = leave the field out (null). Salaries, deadlines, contacts, requirements must come
  from the source. When you create or update from a source, fill `provenance` for each field you set:
  `{ source: "EXTRACTED", confidence, evidence: "<short verbatim quote>" }` or `source: "INFERRED"` when deduced
  (country from a city, year of a date…). Detail fields use `details.<name>` keys; the organization uses `organizationId`.
- **Duplicates:** call `check_duplicates` before `create_opportunity`. If a strong duplicate exists, show it and ask
  before retrying with `force: true`.
- **Dates:** calendar dates are `YYYY-MM-DD` in the user's timezone (Europe/Paris by default); interviews take `date`
  + `time` (HH:mm). Resolve relative dates (“mardi”, “dans 5 jours”) from today (`get_today` returns it).
- **Statuses** are pipeline stage keys (`get_reference`): JOB → TO_APPLY, APPLIED, FOLLOW_UP, HR_INTERVIEW,
  TECHNICAL_INTERVIEW, MANAGER_INTERVIEW, FINAL_INTERVIEW, OFFER, ACCEPTED, REJECTED, WITHDRAWN, GHOSTED…;
  EDUCATION → RESEARCHING, TO_APPLY, PREPARING, APPLICATION_SUBMITTED, INTERVIEW, ADMITTED, WAITLIST, REJECTED…
  Side effects (application date, follow-up scheduling, closing) are automatic — don't recompute them.
- **Confirm first** before closing an application (REJECTED/WITHDRAWN/GHOSTED/DECLINED), archiving, bulk changes or
  anything irreversible. Never send emails/messages: draft them (`render_email_template` or your own draft).
- **Analyses are descriptive** (`save_analysis`): matches, gaps, questions — never “you should / shouldn't apply”.
- Always give the user the record `url` returned by the tools. Answer in the user's language (French by default).

Typical requests and the tools to use:

| Request | Tools |
|---|---|
| “Ajoute cette offre / formation : …” (text, URL, or a file path you read) | `check_duplicates` → `create_opportunity` (see skill `career-import`) |
| “Traite mon inbox” | `list_inbox` → `get_inbox_item` → `submit_inbox_analysis` (skill `career-inbox`) |
| “Qu'est-ce que je dois faire aujourd'hui ?” | `get_today` (skill `career-today`) |
| “J'ai postulé chez X aujourd'hui” | `search` → `set_status` (APPLIED / APPLICATION_SUBMITTED) |
| “Relance Roche” / “rédige la relance” | `get_opportunity` → `render_email_template` → after the user sent it: `follow_up {action:"done"}` |
| “Ajoute un entretien avec Jean mardi 14h” | `search` → `add_interview` |
| “Prépare mon entretien chez Zefir” | `get_opportunity` + `get_profile` → `update_interview` (skill `career-prep`) |
| “Analyse cette offre par rapport à mon profil” | `get_opportunity` + `get_profile` → `save_analysis` |
| “Voici un email reçu : …” | `search` → `apply_actions` (LOG_EVENT, SET_STATUS, ADD_INTERVIEW…) |
| “Lis mon CV et remplis mon profil” | read the file → `update_profile` |
| Statistics | `get_analytics` (report numbers, no conclusions) |

## Development

- Stack: Next.js 16 App Router (Turbopack, `proxy.ts` instead of middleware), React 19, Tailwind v4, shadcn/ui
  (radix-nova preset, `cn` from package `cn`), Drizzle ORM + postgres.js, Zod 4, Vitest.
- Architecture: `docs/ARCHITECTURE.md`. Single business layer in `src/server/services/*` used by Server Actions
  (`src/app/actions/*`), the REST API (`src/server/api/router.ts`, `/api/v1/*`) and the MCP server
  (`src/server/mcp/*`). Pure, client-safe logic lives in `src/lib/*` (dates, follow-ups, duplicates, schemas).
- AI: `src/server/ai/*` — provider abstraction (claude-code CLI/bridge, anthropic, openai, none), versioned prompts,
  deterministic verification of AI output (`verify.ts`).
- Commands: `npm run dev` (needs `docker compose up -d db`), `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run db:generate` after schema changes (migrations in `drizzle/`, applied at container start).
- Local dev DB: `postgres://careeros:careeros@localhost:5433/careeros` (see `.env`).
- Don't break the MCP tool contracts or the export format (`EXPORT_SCHEMA_VERSION`) without a migration.
- UI = Dust's Sparkle design system (MIT, `THIRD_PARTY_NOTICES.md`): tokens in `src/app/globals.css` (stone grays,
  `highlight` blue accent, `success`/`warning`/`info` ramps that flip in dark mode, Geist 450/550). Use the type
  utilities (`heading-*`, `copy-*`, `label-*`), `surface` (tinted card) / `surface-list` (white list panel),
  `border-separator` for row dividers, and `src/components/app/sparkle.tsx` (Counter, ValueCard, List, ListIcon,
  SectionHeader). One `variant="highlight"` button per view; chips are `*-50` backgrounds with `*-700` labels.
- Tests (`tests/`): pure logic + AI-extraction fixtures + DB integration on in-memory PGlite (`tests/helpers/db.ts`,
  real migrations). Add a test with every rule/date/import change. Deployment: `docs/DEPLOYMENT.md`,
  `docker-compose.prod.yml`, `deploy/Caddyfile`; backups: `scripts/backup.*`, `scripts/restore.*`.

@AGENTS.md
