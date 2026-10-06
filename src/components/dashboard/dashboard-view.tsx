"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase, CalendarClock, Flag, GraduationCap, Hourglass, MessageSquareReply, PartyPopper, Target, ThumbsDown, TimerOff } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { DueBadge } from "@/components/app/badges";
import { ValueCard } from "@/components/app/sparkle";
import { useAppData } from "@/components/app/app-data";
import { formatInstant } from "@/lib/dates";
import type { getDashboard } from "@/server/services/analytics";
import type { TodayItem } from "@/server/services/today";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

const chartConfig = {
  jobs: { label: "Jobs", color: "var(--chart-1)" },
  education: { label: "Education", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function DashboardView({ data, upcoming, overdue }: { data: Dashboard; upcoming: TodayItem[]; overdue: number }) {
  const { timezone, dateLocale } = useAppData();
  const k = data.kpis;
  const delta = k.appliedThisMonth - k.appliedLastMonth;
  return (
    <PageContainer wide>
      <PageHeader
        title="Dashboard"
        description="Where you stand — signal, not noise."
        actions={
          <Button variant="outline" asChild>
            <Link href="/analytics">
              Detailed analytics <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ValueCard title="Active" value={k.active} icon={Briefcase} href="/applications?closed=0" subtitle={`${k.jobsActive} jobs · ${k.educationActive} education`} />
        <ValueCard
          title="Applied this month"
          value={k.appliedThisMonth}
          icon={delta >= 0 ? ArrowUpRight : ArrowDownRight}
          subtitle={`${k.appliedLastMonth} last month`}
        />
        <ValueCard title="Interviews ahead" value={k.interviewsUpcoming} icon={CalendarClock} href="/calendar" variant={k.interviewsUpcoming ? "highlight" : "default"} />
        <ValueCard title="Follow-ups due" value={k.followUpsDue} icon={MessageSquareReply} href="/today" variant={k.followUpsDue ? "warning" : "default"} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ValueCard title="Waiting for an answer" value={k.pending} icon={Hourglass} href="/applications?categories=APPLIED" variant="white" />
        <ValueCard
          title="Deadlines ≤ 7 days"
          value={k.deadlinesSoon}
          icon={Flag}
          href="/applications?sort=deadline&closed=0"
          variant={k.deadlinesSoon ? "info" : "white"}
          subtitle={k.overdueDeadlines ? `${k.overdueDeadlines} already passed` : undefined}
        />
        <ValueCard title="Offers" value={k.offers} icon={PartyPopper} href="/applications?categories=OFFER,WON" variant="white" />
        <ValueCard title="Rejections" value={k.rejections} icon={ThumbsDown} href="/applications?stages=REJECTED" variant="white" />
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Opportunities per stage category</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart data={data.pipeline} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="jobs" stackId="a" fill="var(--color-jobs)" radius={[0, 0, 6, 6]} />
                <Bar dataKey="education" stackId="a" fill="var(--color-education)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
            <CardDescription>Interviews and deadlines, next 14 days{overdue ? ` · ${overdue} overdue in Today` : ""}</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            {upcoming.length === 0 && <p className="px-3 text-sm text-muted-foreground">Nothing scheduled.</p>}
            <div className="flex flex-col gap-0.5">
              {upcoming.map((i) => (
                <Link
                  key={i.key}
                  href={i.opportunity ? `/applications/${i.opportunity.id}` : "/today"}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-primary-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{i.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{i.subtitle}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {i.time && <span className="text-xs font-medium text-muted-foreground tabular-nums">{i.time}</span>}
                    <DueBadge date={i.date} />
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" /> Goals
            </CardTitle>
            <CardAction>
              <Button variant="ghost-secondary" size="xs" asChild>
                <Link href="/settings/goals">Manage</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.goals.length === 0 && <p className="text-sm text-muted-foreground">No goal yet — e.g. “20 applications this month”.</p>}
            {data.goals.map((g) => (
              <div key={g.goal.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{g.goal.title}</span>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {g.current} / {g.goal.target}
                  </span>
                </div>
                <Progress value={g.percent} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            {data.recent.length === 0 && <p className="px-3 text-sm text-muted-foreground">No activity yet.</p>}
            <ul className="flex flex-col gap-0.5">
              {data.recent.map(({ event, opportunityTitle, organizationName }) => (
                <li key={event.id}>
                  <Link
                    href={event.opportunityId ? `/applications/${event.opportunityId}` : "/applications"}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-primary-100"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{event.title}</span>
                      {event.opportunityId && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {organizationName ? `${organizationName} · ` : ""}
                          {opportunityTitle}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                      {formatInstant(event.occurredAt, { timeZone: timezone, locale: dateLocale, style: "dayMonth" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {data.total === 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-separator bg-muted-background p-4 text-sm text-muted-foreground">
          <TimerOff className="size-4" /> No data yet — your dashboard fills up as you capture opportunities.
        </div>
      )}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-faint">
        <GraduationCap className="size-3.5" /> Education and jobs are counted together unless filtered.
      </p>
    </PageContainer>
  );
}
