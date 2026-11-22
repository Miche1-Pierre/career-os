import { and, eq, inArray, sql } from "drizzle-orm";
import type { DBOrTx } from "@/server/db";
import { goals, pipelineStages, savedViews, settings, tags, tasks } from "@/server/db/schema";
import { DEFAULT_PIPELINES, interviewKindTitle, type PipelineKey } from "@/lib/constants";
import { ensureDefaultStages } from "@/server/services/stages";

const DEFAULT_TAGS: [string, string][] = [
  ["HealthTech", "teal"],
  ["IA", "violet"],
  ["Produit", "blue"],
  ["Full-stack", "sky"],
  ["International", "amber"],
  ["France", "blue"],
  ["Asie", "red"],
  ["Télétravail", "green"],
  ["Startup", "orange"],
  ["Grand groupe", "slate"],
  ["Bio-informatique", "pink"],
  ["Master", "violet"],
  ["Prioritaire", "red"],
  ["Logiciel", "sky"],
];

const DEFAULT_VIEWS = [
  { name: "International", filters: { tags: ["International"] } },
  { name: "HealthTech", filters: { tags: ["HealthTech"] } },
  { name: "Logiciel", filters: { tags: ["Logiciel", "Full-stack"] } },
  { name: "Bio-informatique", filters: { tags: ["Bio-informatique"] } },
];

type BootstrapState = { tags?: boolean; views?: boolean; frLabels?: boolean };

/** Idempotent first-run defaults. Never overwrites user customizations. */
export async function bootstrapDefaults(tx: DBOrTx) {
  const stagesCreated = await ensureDefaultStages(tx);
  const [flag] = await tx.select().from(settings).where(eq(settings.key, "bootstrap"));
  const state = (flag?.value ?? {}) as BootstrapState;
  let tagsCreated = 0;
  let viewsCreated = 0;
  let labelsTranslated = 0;
  if (!state.frLabels) labelsTranslated = await translateLegacyDefaults(tx);
  if (!state.tags) {
    const inserted = await tx
      .insert(tags)
      .values(DEFAULT_TAGS.map(([name, color]) => ({ name, color })))
      .onConflictDoNothing()
      .returning();
    tagsCreated = inserted.length;
  }
  if (!state.views) {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(savedViews);
    if (count === 0) {
      await tx.insert(savedViews).values(DEFAULT_VIEWS.map((v, i) => ({ ...v, position: (i + 1) * 10 })));
      viewsCreated = DEFAULT_VIEWS.length;
    }
  }
  const done: BootstrapState = { tags: true, views: true, frLabels: true };
  await tx
    .insert(settings)
    .values({ key: "bootstrap", value: done })
    .onConflictDoUpdate({ target: settings.key, set: { value: done } });
  return { stagesCreated, tagsCreated, viewsCreated, labelsTranslated };
}

// ---------------------------------------------------------------------------
// English → French defaults (one-shot, for databases created before the French UI)
//
// Only values still strictly equal to the old English default are renamed: anything the user renamed or created
// is left untouched. Runs once (`bootstrap.frLabels` flag), so a label set back to English later is respected.
// ---------------------------------------------------------------------------

/** Stage key → former English label (identical in both pipelines). New labels come from DEFAULT_PIPELINES. */
const LEGACY_STAGE_LABELS: Record<string, string> = {
  DISCOVERED: "Discovered",
  RESEARCHING: "Researching",
  ELIGIBILITY_CHECK: "Eligibility check",
  TO_APPLY: "To apply",
  PREPARING: "Preparing",
  APPLIED: "Applied",
  FOLLOW_UP: "Followed up",
  APPLICATION_SUBMITTED: "Submitted",
  WAITING: "Waiting",
  HR_INTERVIEW: "HR interview",
  TECHNICAL_INTERVIEW: "Technical interview",
  MANAGER_INTERVIEW: "Manager interview",
  FINAL_INTERVIEW: "Final interview",
  INTERVIEW: "Interview",
  WAITLIST: "Waitlist",
  OFFER: "Offer",
  ADMITTED: "Admitted",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  DECLINED: "Declined",
  GHOSTED: "Ghosted",
  CLOSED: "Closed",
};

const LEGACY_TAGS: Record<string, string> = {
  AI: "IA",
  Product: "Produit",
  Asia: "Asie",
  Remote: "Télétravail",
  "Large company": "Grand groupe",
  Bioinformatics: "Bio-informatique",
  Priority: "Prioritaire",
  Software: "Logiciel",
};

const LEGACY_VIEWS: Record<string, string> = { Software: "Logiciel", Bioinformatics: "Bio-informatique" };

/** Former English interview kind labels, used in automation task titles ("Prepare technical interview"). */
const LEGACY_INTERVIEW_KINDS: Record<string, string> = {
  HR: "HR",
  TECHNICAL: "Technical",
  MANAGER: "Manager",
  FOUNDER: "Founder",
  CULTURE: "Culture fit",
  CASE_STUDY: "Case study",
  ACADEMIC: "Academic",
  PANEL: "Panel",
  OTHER: "Other",
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Checklist template items and automation tasks: former English title → French title. */
const LEGACY_TASK_TITLES: Record<string, string> = {
  "Read the job description": "Lire la fiche de poste",
  "Research the company": "Se renseigner sur l’entreprise",
  "Select CV": "Choisir le CV",
  "Write cover letter": "Rédiger la lettre de motivation",
  "Submit application": "Envoyer la candidature",
  "Follow up": "Relancer",
  "Prepare interview": "Préparer l’entretien",
  "Check eligibility & prerequisites": "Vérifier l’éligibilité et les prérequis",
  "Motivation letter": "Lettre de motivation",
  Transcripts: "Relevés de notes",
  "Recommendation letter": "Lettre de recommandation",
  "Recommendation letters": "Lettres de recommandation",
  "Language certificate": "Certificat de langue",
  "Check school / rhythm compatibility": "Vérifier la compatibilité avec l’école et le rythme",
  "Check Business France VIE eligibility": "Vérifier l’éligibilité au VIE (Business France)",
  "Read the research topic & lab publications": "Lire le sujet de recherche et les publications du labo",
  "Contact the supervisor": "Contacter le directeur de thèse",
  "Research statement / motivation letter": "Projet de recherche / lettre de motivation",
  "Decide on the offer": "Prendre une décision sur l’offre",
  "Decide on the admission": "Prendre une décision sur l’admission",
  "Send a thank-you note": "Envoyer un mot de remerciement",
  ...Object.fromEntries(
    Object.entries(LEGACY_INTERVIEW_KINDS).map(([kind, label]) => [`Prepare ${label.toLowerCase()} interview`, `Préparer l’${lowerFirst(interviewKindTitle(kind))}`]),
  ),
};

const TAGGED_TABLES = ["opportunities", "organizations", "contacts", "documents"] as const;

async function translateLegacyDefaults(tx: DBOrTx): Promise<number> {
  let renamed = 0;

  // Pipeline stages: matched by (pipeline, key) and the untouched English label.
  for (const pipeline of Object.keys(DEFAULT_PIPELINES) as PipelineKey[]) {
    for (const stage of DEFAULT_PIPELINES[pipeline]) {
      const legacy = LEGACY_STAGE_LABELS[stage.key];
      if (!legacy || legacy === stage.label) continue;
      const rows = await tx
        .update(pipelineStages)
        .set({ label: stage.label })
        .where(and(eq(pipelineStages.pipeline, pipeline), eq(pipelineStages.key, stage.key), eq(pipelineStages.label, legacy)))
        .returning({ id: pipelineStages.id });
      renamed += rows.length;
    }
  }

  // Tags are referenced by name: rename the tagged rows first, then the tag itself (safe to re-run if interrupted).
  // Skipped when the French name already exists, so no user tag is merged.
  const existingTags = await tx.select({ id: tags.id, name: tags.name }).from(tags);
  const taken = new Set(existingTags.map((t) => t.name.toLowerCase()));
  const tagMap = new Map<string, string>();
  for (const tag of existingTags) {
    const target = LEGACY_TAGS[tag.name];
    if (!target || taken.has(target.toLowerCase())) continue;
    for (const table of TAGGED_TABLES) {
      await tx.execute(sql`update ${sql.identifier(table)} set tags = array_replace(tags, ${tag.name}, ${target}) where ${tag.name} = any(tags)`);
    }
    await tx.update(tags).set({ name: target }).where(eq(tags.id, tag.id));
    taken.add(target.toLowerCase());
    tagMap.set(tag.name, target);
    renamed++;
  }
  if (tagMap.size) {
    const renameTags = (list: string[]) => list.map((name) => tagMap.get(name) ?? name);
    for (const view of await tx.select().from(savedViews)) {
      if (!view.filters?.tags?.some((name) => tagMap.has(name))) continue;
      await tx.update(savedViews).set({ filters: { ...view.filters, tags: renameTags(view.filters.tags) } }).where(eq(savedViews.id, view.id));
    }
    for (const goal of await tx.select().from(goals)) {
      if (!goal.filters?.tags?.some((name) => tagMap.has(name))) continue;
      await tx.update(goals).set({ filters: { ...goal.filters, tags: renameTags(goal.filters.tags) } }).where(eq(goals.id, goal.id));
    }
  }

  // Saved views.
  for (const [legacy, name] of Object.entries(LEGACY_VIEWS)) {
    const rows = await tx.update(savedViews).set({ name }).where(eq(savedViews.name, legacy)).returning({ id: savedViews.id });
    renamed += rows.length;
  }

  // Checklist / automation tasks created from the English templates (user-written tasks are never touched).
  for (const [legacy, title] of Object.entries(LEGACY_TASK_TITLES)) {
    const rows = await tx
      .update(tasks)
      .set({ title })
      .where(and(eq(tasks.title, legacy), inArray(tasks.origin, ["TEMPLATE", "RULE"])))
      .returning({ id: tasks.id });
    renamed += rows.length;
  }

  // Stored settings that still hold the former defaults.
  const stored = await tx.select().from(settings).where(inArray(settings.key, ["general", "templates", "emailTemplates"]));
  for (const row of stored) {
    let value: unknown = row.value;
    if (row.key === "general") {
      const general = row.value as { dateLocale?: string } | null;
      if (general?.dateLocale === "en-GB") value = { ...general, dateLocale: "fr-FR" };
    } else if (row.key === "templates" && row.value && typeof row.value === "object") {
      value = Object.fromEntries(
        Object.entries(row.value as Record<string, unknown>).map(([type, items]) => [
          type,
          Array.isArray(items) ? items.map((item: { title?: string }) => (item?.title && LEGACY_TASK_TITLES[item.title] ? { ...item, title: LEGACY_TASK_TITLES[item.title] } : item)) : items,
        ]),
      );
    } else if (row.key === "emailTemplates" && Array.isArray(row.value)) {
      value = row.value.map((t: { id?: string; name?: string }) => (t?.id === "follow-up-en" && t.name === "Application follow-up (EN)" ? { ...t, name: "Relance candidature (EN)" } : t));
    }
    if (JSON.stringify(value) === JSON.stringify(row.value)) continue;
    await tx.update(settings).set({ value }).where(eq(settings.key, row.key));
    renamed++;
  }

  return renamed;
}
