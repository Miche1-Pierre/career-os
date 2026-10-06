import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { contacts, documents, interviews, opportunities, organizations, pipelineStages, timelineEvents } from "@/server/db/schema";
import { normalizedContains } from "@/server/db/sql-helpers";
import { INTERVIEW_KIND_LABEL } from "@/lib/constants";
import { normalizeText } from "@/lib/text";

export interface SearchHit {
  type: "opportunity" | "organization" | "contact" | "document" | "interview" | "event";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  score: number;
}

function score(text: string | null | undefined, q: string): number {
  const t = normalizeText(text);
  const n = normalizeText(q);
  if (!t || !n) return 0;
  if (t === n) return 100;
  if (t.startsWith(n)) return 80;
  if (t.split(" ").some((w) => w.startsWith(n))) return 60;
  if (t.includes(n)) return 40;
  return 10;
}

/** Global search across every entity (used by the command palette, the API and MCP). */
export async function searchAll(query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const [opps, orgs, people, docs, ivs, events] = await Promise.all([
    db
      .select({ id: opportunities.id, title: opportunities.title, org: organizations.name, stage: pipelineStages.label, type: opportunities.type })
      .from(opportunities)
      .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
      .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
      .where(
        and(
          isNull(opportunities.deletedAt),
          sql`(${normalizedContains(opportunities.title, q)} or ${normalizedContains(organizations.name, q)} or ${normalizedContains(
            sql`array_to_string(${opportunities.tags}, ' ')`,
            q,
          )} or ${normalizedContains(opportunities.locationCity, q)} or ${normalizedContains(opportunities.notes, q)})`,
        ),
      )
      .orderBy(desc(opportunities.updatedAt))
      .limit(limit * 2),
    db
      .select({ id: organizations.id, name: organizations.name, kind: organizations.kind, city: organizations.city, industry: organizations.industry })
      .from(organizations)
      .where(and(isNull(organizations.deletedAt), sql`(${normalizedContains(organizations.name, q)} or ${normalizedContains(organizations.notes, q)})`))
      .limit(limit),
    db
      .select({ id: contacts.id, name: contacts.fullName, role: contacts.role, email: contacts.email, org: organizations.name })
      .from(contacts)
      .leftJoin(organizations, eq(organizations.id, contacts.organizationId))
      .where(
        and(
          isNull(contacts.deletedAt),
          sql`(${normalizedContains(contacts.fullName, q)} or ${normalizedContains(contacts.email, q)} or ${normalizedContains(contacts.notes, q)})`,
        ),
      )
      .limit(limit),
    db
      .select({ id: documents.id, name: documents.name, kind: documents.kind })
      .from(documents)
      .where(and(isNull(documents.deletedAt), sql`(${normalizedContains(documents.name, q)} or ${normalizedContains(sql`array_to_string(${documents.tags}, ' ')`, q)})`))
      .limit(limit),
    db
      .select({ id: interviews.id, kind: interviews.kind, title: interviews.title, oppId: opportunities.id, oppTitle: opportunities.title, org: organizations.name, at: interviews.scheduledAt })
      .from(interviews)
      .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
      .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
      .where(
        and(
          isNull(opportunities.deletedAt),
          sql`(${normalizedContains(organizations.name, q)} or ${normalizedContains(interviews.notes, q)} or ${normalizedContains(interviews.preparation, q)} or ${normalizedContains(
            interviews.title,
            q,
          )})`,
        ),
      )
      .limit(limit),
    db
      .select({ id: timelineEvents.id, title: timelineEvents.title, body: timelineEvents.body, oppId: timelineEvents.opportunityId, contactId: timelineEvents.contactId, at: timelineEvents.occurredAt })
      .from(timelineEvents)
      .where(sql`(${timelineEvents.type} in ('NOTE','EMAIL','MESSAGE','CALL','MEETING')) and (${normalizedContains(timelineEvents.title, q)} or ${normalizedContains(timelineEvents.body, q)})`)
      .orderBy(desc(timelineEvents.occurredAt))
      .limit(limit),
  ]);

  const hits: SearchHit[] = [
    ...opps.map((o) => ({
      type: "opportunity" as const,
      id: o.id,
      title: o.title,
      subtitle: [o.org, o.stage].filter(Boolean).join(" · "),
      href: `/applications/${o.id}`,
      score: Math.max(score(o.title, q), score(o.org, q)) + 5,
    })),
    ...orgs.map((o) => ({
      type: "organization" as const,
      id: o.id,
      title: o.name,
      subtitle: [o.kind === "INSTITUTION" ? "Institution" : "Company", o.industry, o.city].filter(Boolean).join(" · "),
      href: `/${o.kind === "INSTITUTION" ? "institutions" : "companies"}/${o.id}`,
      score: score(o.name, q) + 4,
    })),
    ...people.map((c) => ({
      type: "contact" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.role, c.org, c.email].filter(Boolean).join(" · "),
      href: `/contacts/${c.id}`,
      score: score(c.name, q) + 3,
    })),
    ...docs.map((d) => ({ type: "document" as const, id: d.id, title: d.name, subtitle: d.kind, href: `/documents/${d.id}`, score: score(d.name, q) + 2 })),
    ...ivs.map((i) => ({
      type: "interview" as const,
      id: i.id,
      title: `${INTERVIEW_KIND_LABEL[i.kind]} interview — ${i.org ?? i.oppTitle}`,
      subtitle: i.oppTitle,
      href: `/applications/${i.oppId}?tab=interviews`,
      score: score(i.org, q) + 1,
    })),
    ...events.map((e) => ({
      type: "event" as const,
      id: e.id,
      title: e.title,
      subtitle: e.body ? e.body.slice(0, 120) : null,
      href: e.oppId ? `/applications/${e.oppId}?tab=timeline` : e.contactId ? `/contacts/${e.contactId}` : "/today",
      score: Math.max(score(e.title, q), score(e.body, q)),
    })),
  ];
  return hits.sort((a, b) => b.score - a.score).slice(0, limit * 4);
}
