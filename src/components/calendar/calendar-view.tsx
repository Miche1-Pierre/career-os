"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, List, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { useAppData } from "@/components/app/app-data";
import { addMonths, formatISODate, monthGrid } from "@/lib/dates";
import type { CalendarEvent, CalendarEventKind } from "@/server/services/calendar";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<CalendarEventKind, { label: string; className: string; dot: string }> = {
  INTERVIEW: { label: "Interview", className: "bg-info-50 text-info-900", dot: "bg-info-500" },
  DEADLINE: { label: "Deadline", className: "bg-warning-50 text-warning-700", dot: "bg-warning-500" },
  FOLLOW_UP: { label: "Follow-up", className: "bg-highlight-50 text-highlight-700", dot: "bg-highlight-500" },
  TASK: { label: "Task", className: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300", dot: "bg-stone-400" },
  OPENS: { label: "Applications open", className: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300", dot: "bg-violet-500" },
  DECISION: { label: "Answer expected", className: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300", dot: "bg-pink-500" },
  APPLIED: { label: "Applied", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500" },
};

export function CalendarView({ month, events }: { month: string; events: CalendarEvent[] }) {
  const { today, weekStartsOn, dateLocale } = useAppData();
  const [mode, setMode] = useState<"month" | "agenda">("month");
  const [hidden, setHidden] = useState<Set<CalendarEventKind>>(new Set(["APPLIED"]));
  const weeks = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn]);
  const visible = events.filter((e) => !hidden.has(e.kind));
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visible) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [visible]);
  const monthKey = month.slice(0, 7);
  const prev = addMonths(month, -1).slice(0, 7);
  const next = addMonths(month, 1).slice(0, 7);
  const weekdays = weeks[0].map((d) => new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)));
  const agenda = visible.filter((e) => e.date >= today).slice(0, 200);

  return (
    <PageContainer wide>
      <PageHeader
        title={new Intl.DateTimeFormat(dateLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}
        description="Interviews, deadlines, follow-ups and tasks."
        actions={
          <>
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "month" | "agenda")} variant="outline" size="sm">
              <ToggleGroupItem value="month" aria-label="Month view">
                <CalendarDays />
              </ToggleGroupItem>
              <ToggleGroupItem value="agenda" aria-label="Agenda view">
                <List />
              </ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={`/calendar?month=${prev}`} aria-label="Previous month">
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/calendar">Today</Link>
            </Button>
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={`/calendar?month=${next}`} aria-label="Next month">
                <ChevronRight />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/v1/calendar.ics" download="career-os.ics">
                <Download /> .ics
              </a>
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(KIND_STYLE) as CalendarEventKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setHidden((h) => {
              const n = new Set(h);
              if (n.has(kind)) n.delete(kind);
              else n.add(kind);
              return n;
            })}
            className={cn("flex h-6 items-center gap-1.5 rounded-[9px] border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", hidden.has(kind) && "opacity-40")}
          >
            <span className={cn("size-2 rounded-full", KIND_STYLE[kind].dot)} />
            {KIND_STYLE[kind].label}
          </button>
        ))}
      </div>
      {mode === "month" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="grid grid-cols-7 border-b border-separator bg-muted-background heading-xs text-muted-foreground dark:border-border">
            {weekdays.map((w) => (
              <div key={w} className="px-2.5 py-2">
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-separator last:border-b-0 dark:border-border">
              {week.map((day) => {
                const items = byDay.get(day) ?? [];
                const inMonth = day.startsWith(monthKey);
                return (
                  <div key={day} className={cn("min-h-28 border-r border-separator p-1.5 last:border-r-0 dark:border-border", !inMonth && "bg-muted-background", day === today && "bg-highlight-50/40")}>
                    <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums", day === today ? "bg-linear-to-b from-highlight-400 to-highlight-500 text-white" : inMonth ? "text-foreground" : "text-faint")}>{Number(day.slice(8))}</div>
                    <div className="space-y-0.5">
                      {items.slice(0, 4).map((e) => (
                        <Link key={e.id} href={e.href} className={cn("block truncate rounded-md px-1.5 py-0.5 text-xs leading-tight font-medium", KIND_STYLE[e.kind].className, e.done && "line-through opacity-60")} title={e.title}>
                          {e.time && <span className="font-medium tabular-nums">{e.time} </span>}
                          {e.title}
                        </Link>
                      ))}
                      {items.length > 4 && <div className="px-1 text-xs text-muted-foreground">+{items.length - 4} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {agenda.length === 0 && <p className="text-sm text-muted-foreground">Nothing upcoming.</p>}
          {Object.entries(
            agenda.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
              (acc[e.date] ??= []).push(e);
              return acc;
            }, {}),
          ).map(([day, items]) => (
            <div key={day}>
              <h3 className={cn("mb-2 heading-sm", day === today ? "text-highlight-600" : "text-foreground")}>{formatISODate(day, "long", dateLocale)}</h3>
              <ul className="surface-list">
                {items.map((e) => (
                  <li key={e.id}>
                    <Link href={e.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted-background">
                      <span className={cn("size-2 shrink-0 rounded-full", KIND_STYLE[e.kind].dot)} />
                      <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{e.time ?? "—"}</span>
                      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium text-foreground", e.done && "line-through opacity-60")}>{e.title}</span>
                      {e.subtitle && <span className="hidden truncate text-xs text-muted-foreground md:inline">{e.subtitle}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-faint">Subscribe from Google Calendar / Outlook with the .ics feed (requires the app to be reachable, e.g. on your VPS with an access token).</p>
    </PageContainer>
  );
}
