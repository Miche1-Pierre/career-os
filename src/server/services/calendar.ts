import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { housingListings, interviews, moves, opportunities, organizations, pipelineStages, tasks } from "@/server/db/schema";
import { addDays, instantToZonedParts, type ISODate } from "@/lib/dates";
import { interviewKindTitle } from "@/lib/constants";
import { getSettings } from "./settings";

export type CalendarEventKind = "INTERVIEW" | "DEADLINE" | "FOLLOW_UP" | "TASK" | "OPENS" | "DECISION" | "APPLIED" | "VISIT" | "MOVE";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  date: ISODate;
  time: string | null;
  start?: Date | null;
  end?: Date | null;
  title: string;
  subtitle: string | null;
  opportunityId: string | null;
  href: string;
  location?: string | null;
  url?: string | null;
  done?: boolean;
}

export async function getCalendarEvents(from: ISODate, to: ISODate, options: { includeApplied?: boolean } = {}): Promise<CalendarEvent[]> {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const events: CalendarEvent[] = [];

  const opps = await db
    .select({ opp: opportunities, orgName: organizations.name, category: pipelineStages.category })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(
      and(
        isNull(opportunities.deletedAt),
        or(
          and(gte(opportunities.deadline, from), lte(opportunities.deadline, to)),
          and(gte(opportunities.nextFollowUpAt, from), lte(opportunities.nextFollowUpAt, to)),
          and(gte(opportunities.applicationOpensAt, from), lte(opportunities.applicationOpensAt, to)),
          and(gte(opportunities.expectedResponseAt, from), lte(opportunities.expectedResponseAt, to)),
          options.includeApplied ? and(gte(opportunities.appliedAt, from), lte(opportunities.appliedAt, to)) : undefined,
        ),
      ),
    );
  for (const { opp, orgName, category } of opps) {
    const closed = category === "WON" || category === "LOST";
    const name = orgName ? `${orgName} — ${opp.title}` : opp.title;
    const href = `/applications/${opp.id}`;
    if (opp.deadline && opp.deadline >= from && opp.deadline <= to) {
      events.push({ id: `deadline:${opp.id}`, kind: "DEADLINE", date: opp.deadline, time: opp.deadlineTime, title: `Date limite · ${name}`, subtitle: opp.deadlineTime ? `jusqu’à ${opp.deadlineTime}` : null, opportunityId: opp.id, href, done: !["BACKLOG", "TO_APPLY", "PREPARING"].includes(category) });
    }
    if (!closed && opp.nextFollowUpAt && !opp.followUpPaused && opp.nextFollowUpAt >= from && opp.nextFollowUpAt <= to) {
      events.push({ id: `followup:${opp.id}`, kind: "FOLLOW_UP", date: opp.nextFollowUpAt, time: null, title: `Relance · ${orgName ?? opp.title}`, subtitle: opp.title, opportunityId: opp.id, href });
    }
    if (opp.applicationOpensAt && opp.applicationOpensAt >= from && opp.applicationOpensAt <= to) {
      events.push({ id: `opens:${opp.id}`, kind: "OPENS", date: opp.applicationOpensAt, time: null, title: `Ouverture des candidatures · ${name}`, subtitle: null, opportunityId: opp.id, href });
    }
    if (!closed && opp.expectedResponseAt && opp.expectedResponseAt >= from && opp.expectedResponseAt <= to) {
      events.push({ id: `decision:${opp.id}`, kind: "DECISION", date: opp.expectedResponseAt, time: null, title: `Réponse attendue · ${orgName ?? opp.title}`, subtitle: opp.title, opportunityId: opp.id, href });
    }
    if (options.includeApplied && opp.appliedAt && opp.appliedAt >= from && opp.appliedAt <= to) {
      events.push({ id: `applied:${opp.id}`, kind: "APPLIED", date: opp.appliedAt, time: null, title: `Postulé · ${name}`, subtitle: null, opportunityId: opp.id, href });
    }
  }

  const ivs = await db
    .select({ interview: interviews, oppTitle: opportunities.title, orgName: organizations.name })
    .from(interviews)
    .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(
      and(
        isNull(opportunities.deletedAt),
        gte(interviews.scheduledAt, new Date(`${addDays(from, -1)}T00:00:00Z`)),
        lte(interviews.scheduledAt, new Date(`${addDays(to, 1)}T23:59:59Z`)),
        sql`${interviews.status} <> 'CANCELLED'`,
      ),
    );
  for (const { interview, oppTitle, orgName } of ivs) {
    if (!interview.scheduledAt) continue;
    const parts = instantToZonedParts(interview.scheduledAt, tz);
    if (parts.date < from || parts.date > to) continue;
    events.push({
      id: `interview:${interview.id}`,
      kind: "INTERVIEW",
      date: parts.date,
      time: parts.time,
      start: interview.scheduledAt,
      end: new Date(interview.scheduledAt.getTime() + (interview.durationMinutes ?? 60) * 60_000),
      title: `${interviewKindTitle(interview.kind)} · ${orgName ?? oppTitle}`,
      subtitle: oppTitle,
      opportunityId: interview.opportunityId,
      href: `/applications/${interview.opportunityId}?tab=interviews`,
      location: interview.location,
      url: interview.meetingUrl,
      done: interview.status === "COMPLETED",
    });
  }

  const taskRows = await db
    .select({ task: tasks, oppTitle: opportunities.title })
    .from(tasks)
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .where(and(gte(tasks.dueDate, from), lte(tasks.dueDate, to), isNull(opportunities.deletedAt)));
  for (const { task, oppTitle } of taskRows) {
    events.push({
      id: `task:${task.id}`,
      kind: "TASK",
      date: task.dueDate!,
      time: null,
      title: task.title,
      subtitle: oppTitle,
      opportunityId: task.opportunityId,
      href: task.opportunityId ? `/applications/${task.opportunityId}?tab=checklist` : "/tasks",
      done: task.done,
    });
  }

  // Relocation: arrival / departure of each move, housing visits.
  const moveRows = await db
    .select()
    .from(moves)
    .where(and(isNull(moves.deletedAt), or(and(gte(moves.arrivalDate, from), lte(moves.arrivalDate, to)), and(gte(moves.departureDate, from), lte(moves.departureDate, to)))));
  for (const m of moveRows) {
    if (m.arrivalDate && m.arrivalDate >= from && m.arrivalDate <= to) {
      events.push({ id: `move-arrival:${m.id}`, kind: "MOVE", date: m.arrivalDate, time: null, title: `Arrivée · ${m.city ?? m.title}`, subtitle: m.title, opportunityId: m.opportunityId, href: `/moves/${m.id}` });
    }
    if (m.departureDate && m.departureDate >= from && m.departureDate <= to) {
      events.push({ id: `move-end:${m.id}`, kind: "MOVE", date: m.departureDate, time: null, title: `Fin du séjour · ${m.city ?? m.title}`, subtitle: m.title, opportunityId: m.opportunityId, href: `/moves/${m.id}` });
    }
  }
  const visits = await db
    .select({ listing: housingListings, moveTitle: moves.title })
    .from(housingListings)
    .innerJoin(moves, eq(moves.id, housingListings.moveId))
    .where(and(isNull(housingListings.deletedAt), isNull(moves.deletedAt), gte(housingListings.visitDate, from), lte(housingListings.visitDate, to)));
  for (const { listing, moveTitle } of visits) {
    events.push({
      id: `visit:${listing.id}`,
      kind: "VISIT",
      date: listing.visitDate!,
      time: listing.visitTime,
      title: `Visite · ${listing.title}`,
      subtitle: moveTitle,
      opportunityId: null,
      href: `/moves/${listing.moveId}?tab=housing&listing=${listing.id}`,
      location: listing.address,
      url: listing.url,
      done: ["VISITED", "APPLIED", "CHOSEN", "DECLINED"].includes(listing.status),
    });
  }

  const order: Record<CalendarEventKind, number> = { INTERVIEW: 0, VISIT: 1, MOVE: 2, DEADLINE: 3, DECISION: 4, FOLLOW_UP: 5, OPENS: 6, TASK: 7, APPLIED: 8 };
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || order[a.kind] - order[b.kind]);
}

// ---------------------------------------------------------------------------
// iCalendar export
// ---------------------------------------------------------------------------

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(date: ISODate) {
  return date.replace(/-/g, "");
}

function icsInstant(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function eventsToICS(events: CalendarEvent[], options: { appUrl?: string; name?: string } = {}) {
  const now = icsInstant(new Date());
  const base = (options.appUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Career OS//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(options.name ?? "Career OS")}`];
  for (const e of events) {
    if (e.kind === "TASK" && e.done) continue;
    lines.push("BEGIN:VEVENT", `UID:${e.id}@career-os`, `DTSTAMP:${now}`);
    if (e.start && e.end) lines.push(`DTSTART:${icsInstant(e.start)}`, `DTEND:${icsInstant(e.end)}`);
    else lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`);
    lines.push(fold(`SUMMARY:${icsEscape(e.title)}`));
    const description = [e.subtitle, e.url ? `Lien : ${e.url}` : null, `${base}${e.href}`].filter(Boolean).join("\n");
    lines.push(fold(`DESCRIPTION:${icsEscape(description)}`));
    if (e.location) lines.push(fold(`LOCATION:${icsEscape(e.location)}`));
    if (e.url) lines.push(fold(`URL:${e.url}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
