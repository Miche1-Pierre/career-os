"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  DoorOpen,
  ExternalLink,
  FileWarning,
  Hourglass,
  Inbox,
  ListTodo,
  Mail,
  MessageSquareReply,
  MoreHorizontal,
  PartyPopper,
  Send,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatISODate } from "@/lib/dates";
import type { TodayData, TodayItem } from "@/server/services/today";
import { PageContainer } from "@/components/app/page-header";
import { DueBadge, StageBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { List, ListIcon, SectionHeader, ValueCard } from "@/components/app/sparkle";
import { useAppData } from "@/components/app/app-data";
import { useQuickImport } from "@/components/app/quick-import";
import { useAction } from "@/hooks/use-action";
import { followUpAction, updateTaskAction } from "@/app/actions/opportunities";
import { dismissNotificationAction, runNotificationAction } from "@/app/actions/settings";
import { EmailDialog } from "@/components/opportunities/email-dialog";

const KIND_ICON: Record<TodayItem["kind"], React.ComponentType<{ className?: string }>> = {
  FOLLOW_UP: MessageSquareReply,
  TASK: ListTodo,
  INTERVIEW: Video,
  OUTCOME: CalendarCheck2,
  DEADLINE: AlarmClock,
  OPENS: DoorOpen,
  DECISION: Hourglass,
  WAITING: Clock,
  DOCUMENTS: FileWarning,
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function TodayView({ data, userName }: { data: TodayData; userName: string }) {
  const { dateLocale } = useAppData();
  const quickImport = useQuickImport();
  const c = data.counts;
  const stats = [
    { n: c.overdue, label: "Overdue", href: "#overdue", icon: AlarmClock, variant: "warning" as const },
    { n: c.followUpsDue, label: c.followUpsDue === 1 ? "Follow-up due" : "Follow-ups due", href: "#today", icon: MessageSquareReply },
    { n: c.interviewsUpcoming, label: c.interviewsUpcoming === 1 ? "Interview soon" : "Interviews soon", href: "#upcoming", icon: Video },
    { n: c.deadlinesSoon, label: c.deadlinesSoon === 1 ? "Deadline this week" : "Deadlines this week", href: "#upcoming", icon: CalendarCheck2 },
    { n: c.missingDocuments, label: c.missingDocuments === 1 ? "Missing document" : "Missing documents", href: "#documents", icon: FileWarning },
    { n: c.waiting, label: "Waiting for an answer", href: "#waiting", icon: Clock },
    { n: c.inbox, label: "In the inbox", href: "/inbox", icon: Inbox },
  ].filter((x) => x.n > 0);
  const nothing = !data.overdue.length && !data.dueToday.length && !data.upcoming.length && !data.waiting.length && !data.missingDocuments.length && !data.suggestions.length;

  return (
    <PageContainer className="max-w-4xl">
      <div className="mb-8 space-y-1.5">
        <p className="label-sm text-muted-foreground">{formatISODate(data.today, "long", dateLocale)}</p>
        <h1 className="heading-3xl text-foreground">
          {greeting()}
          {userName ? `, ${userName}` : ""}.
        </h1>
        <p className="copy-base text-muted-foreground">{stats.length > 0 ? "Here is what needs your attention." : "Nothing urgent. A good day to find new opportunities."}</p>
      </div>

      {stats.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <ValueCard key={stat.label} title={stat.label} value={stat.n} icon={stat.icon} href={stat.href} variant={stat.variant} />
          ))}
        </div>
      )}

      {nothing && (
        <EmptyState icon={PartyPopper} title="All clear" description="No follow-up, deadline or interview needs you. Capture a new opportunity to keep the pipeline moving.">
          <Button variant="highlight" onClick={() => quickImport.open()}>
            <Inbox /> Quick import
          </Button>
        </EmptyState>
      )}

      <div className="space-y-10">
        <TodaySection id="overdue" title="Overdue" items={data.overdue} tone="danger" />
        <TodaySection id="today" title="Today" items={data.dueToday} tone="warning" empty={data.overdue.length || data.upcoming.length ? "Nothing due today." : undefined} />
        {data.suggestions.length > 0 && <Suggestions items={data.suggestions} />}
        <TodaySection id="upcoming" title="Next 7 days" items={data.upcoming} />
        <TodaySection id="waiting" title="Waiting for an answer" items={data.waiting} compact />
        <TodaySection id="documents" title="Missing documents" items={data.missingDocuments} compact />
      </div>
    </PageContainer>
  );
}

function TodaySection({ id, title, items, tone, empty, compact }: { id: string; title: string; items: TodayItem[]; tone?: "danger" | "warning"; empty?: string; compact?: boolean }) {
  if (!items.length && !empty) return null;
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <SectionHeader title={title} count={items.length} tone={tone === "danger" ? "warning" : undefined} />
      {items.length ? (
        <List tone={tone === "danger" ? "warning" : undefined}>
          {items.map((item) => (
            <TodayRow key={item.key} item={item} compact={compact} />
          ))}
        </List>
      ) : (
        <p className="copy-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function TodayRow({ item, compact }: { item: TodayItem; compact?: boolean }) {
  const Icon = KIND_ICON[item.kind];
  const { run, pending } = useAction();
  const [emailOpen, setEmailOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const opp = item.opportunity;
  const href = opp ? `/applications/${opp.id}${item.kind === "INTERVIEW" || item.kind === "OUTCOME" ? "?tab=interviews" : item.kind === "DOCUMENTS" ? "?tab=checklist" : ""}` : "/tasks";
  if (hidden) return null;
  const done = (fn: () => ReturnType<typeof followUpAction>, message: string) =>
    run(fn, {
      success: message,
      onSuccess: () => setHidden(true),
    });
  return (
    <div className={cn("group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted-background", pending && "opacity-60")}>
      {item.kind === "TASK" && item.taskId ? (
        <span className="flex size-8 shrink-0 items-center justify-center">
          <Checkbox aria-label="Mark as done" onCheckedChange={() => done(() => updateTaskAction(item.taskId!, { done: true }) as never, "Task completed")} />
        </span>
      ) : (
        <ListIcon icon={Icon} tone={item.due.kind === "overdue" ? "warning" : item.kind === "INTERVIEW" ? "highlight" : item.kind === "DEADLINE" ? "info" : undefined} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={href} className="truncate text-sm font-medium text-foreground hover:underline">
            {item.title}
          </Link>
          {item.time && <span className="text-xs font-medium text-muted-foreground tabular-nums">{item.time}</span>}
          {!compact && <DueBadge date={item.date} time={item.time} />}
          {opp && !compact && item.kind !== "WAITING" && <StageBadge label={opp.stageLabel} category={opp.stageCategory} className="hidden sm:inline-flex" />}
        </div>
        {item.subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</p>}
      </div>
      {opp && (item.kind === "FOLLOW_UP" || item.kind === "WAITING") && emailOpen && (
        <EmailDialog opportunityId={opp.id} open={emailOpen} onOpenChange={setEmailOpen} onSent={() => done(() => followUpAction(opp.id, { action: "done", channel: "EMAIL" }), "Follow-up logged")} />
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        {item.kind === "FOLLOW_UP" && opp && (
          <>
            <Button size="xs" variant="outline" onClick={() => setEmailOpen(true)} className="hidden sm:inline-flex">
              <Mail /> Draft
            </Button>
            <Button size="xs" onClick={() => done(() => followUpAction(opp.id, { action: "done" }), "Follow-up logged — next one scheduled")}>
              <Send /> Done
            </Button>
          </>
        )}
        {item.kind === "INTERVIEW" && item.meetingUrl && (
          <Button size="xs" variant="outline" asChild>
            <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer">
              <Video /> Join
            </a>
          </Button>
        )}
        {item.kind === "WAITING" && opp && (
          <Button size="xs" variant="outline" onClick={() => setEmailOpen(true)}>
            <Mail /> Follow up
          </Button>
        )}
        {item.kind === "WAITING" && (item.meta?.overThreshold as boolean) && (
          <span className="hidden text-xs font-medium text-info-800 tabular-nums sm:inline">{String(item.meta?.days)}d</span>
        )}
        {(item.kind === "FOLLOW_UP" || item.kind === "TASK") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost-secondary" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.kind === "FOLLOW_UP" && opp && (
                <>
                  <DropdownMenuLabel>Snooze</DropdownMenuLabel>
                  {[1, 3, 7, 14].map((d) => (
                    <DropdownMenuItem key={d} onClick={() => done(() => followUpAction(opp.id, { action: "snooze", days: d }), `Snoozed ${d} day${d > 1 ? "s" : ""}`)}>
                      +{d} day{d > 1 ? "s" : ""}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => done(() => followUpAction(opp.id, { action: "pause" }), "Follow-ups paused")}>Pause follow-ups</DropdownMenuItem>
                </>
              )}
              {item.kind === "TASK" && item.taskId && (
                <>
                  <DropdownMenuLabel>Postpone</DropdownMenuLabel>
                  {[1, 3, 7].map((d) => (
                    <DropdownMenuItem
                      key={d}
                      onClick={() => {
                        const next = new Date(`${item.date > new Date().toISOString().slice(0, 10) ? item.date : new Date().toISOString().slice(0, 10)}T12:00:00Z`);
                        next.setUTCDate(next.getUTCDate() + d);
                        done(() => updateTaskAction(item.taskId!, { dueDate: next.toISOString().slice(0, 10) }) as never, "Task postponed");
                      }}
                    >
                      +{d} day{d > 1 ? "s" : ""}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {opp && (
                <DropdownMenuItem asChild>
                  <Link href={`/applications/${opp.id}`}>
                    <ExternalLink /> Open
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function Suggestions({ items }: { items: TodayData["suggestions"] }) {
  const { run } = useAction();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = items.filter((n) => !hidden.has(n.id));
  if (!visible.length) return null;
  const hide = (id: string) => setHidden((s) => new Set(s).add(id));
  return (
    <section className="space-y-3">
      <SectionHeader title="Suggestions" count={visible.length} countVariant="highlight" />
      <List>
        {visible.map((n) => (
          <div key={n.id} className="flex items-center gap-3 px-4 py-3">
            <ListIcon icon={BellRing} tone="highlight" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{n.title}</p>
              {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {n.action?.type === "SET_STATUS" && (
                <Button size="xs" variant="outline" onClick={() => run(() => runNotificationAction(n.id, n.action!), { success: "Done", onSuccess: () => hide(n.id) })}>
                  <CheckCircle2 /> {n.action.label}
                </Button>
              )}
              {n.action?.type === "OPEN_OPPORTUNITY" && (
                <Button size="xs" variant="outline" asChild>
                  <Link href={`/applications/${String(n.action.payload?.opportunityId)}?tab=interviews`}>{n.action.label}</Link>
                </Button>
              )}
              {n.entityType === "opportunity" && n.entityId && !n.action && (
                <Button size="xs" variant="ghost-secondary" asChild>
                  <Link href={`/applications/${n.entityId}`}>Open</Link>
                </Button>
              )}
              <Button size="icon-xs" variant="ghost-secondary" aria-label="Dismiss" onClick={() => run(() => dismissNotificationAction(n.id), { onSuccess: () => hide(n.id) })}>
                <X />
              </Button>
            </div>
          </div>
        ))}
      </List>
    </section>
  );
}
