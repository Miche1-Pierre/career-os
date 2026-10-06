"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { ValueCard } from "@/components/app/sparkle";
import type { getAnalytics } from "@/server/services/analytics";

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const monthsConfig = {
  applications: { label: "Applications sent", color: "var(--chart-1)" },
  added: { label: "Opportunities added", color: "var(--chart-2)" },
} satisfies ChartConfig;

function Stat({ label, value, suffix, hint }: { label: string; value: number | null; suffix?: string; hint?: string }) {
  return (
    <ValueCard
      title={label}
      value={
        <>
          {value == null ? "—" : value}
          {value != null && suffix && <span className="ml-0.5 text-base font-normal text-muted-foreground">{suffix}</span>}
        </>
      }
      subtitle={hint}
    />
  );
}

export function AnalyticsView({ data, family, segments }: { data: Analytics; family: string; segments: { key: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const o = data.overall;
  const funnelMax = Math.max(1, o.applications);
  const funnel = [
    { label: "Applications sent", value: o.applications },
    { label: "Responses", value: o.responses },
    { label: "Interviews", value: o.interviews },
    { label: "Offers / admissions", value: o.offers },
    { label: "Accepted", value: o.accepted },
  ];
  return (
    <PageContainer wide>
      <PageHeader
        title="Analytics"
        description="Objective numbers only — Career OS never draws conclusions for you."
        actions={
          <Tabs value={family} onValueChange={(v) => set("family", v)}>
            <TabsList>
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="JOB">Jobs</TabsTrigger>
              <TabsTrigger value="EDUCATION">Education</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Applications sent" value={o.applications} hint={`${data.totalTracked} tracked in total`} />
        <Stat label="Response rate" value={o.responseRate} suffix="%" hint={`${o.responses} responses`} />
        <Stat label="Interview rate" value={o.interviewRate} suffix="%" hint={`${o.interviews} with interviews`} />
        <Stat label="Offers / admissions" value={o.offers} hint={o.offerRate != null ? `${o.offerRate}% of applications` : undefined} />
        <Stat label="Avg. response time" value={o.avgResponseDays} suffix="d" />
        <Stat label="Avg. days to 1st interview" value={o.avgDaysToInterview} suffix="d" />
        <Stat label="Follow-ups / application" value={o.followUpsPerApplication} hint={`${o.followUps} follow-ups sent`} />
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Per month</CardTitle>
            <CardDescription>Last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={monthsConfig} className="h-64 w-full">
              <BarChart data={data.months} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="applications" fill="var(--color-applications)" radius={4} />
                <Bar dataKey="added" fill="var(--color-added)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>From application to decision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((f) => (
              <div key={f.label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{f.label}</span>
                  <span className="tabular-nums">{f.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-highlight-500" style={{ width: `${(f.value / funnelMax) * 100}%` }} />
                </div>
              </div>
            ))}
            {family !== "JOB" && data.education.tracked > 0 && (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Education</p>
                {data.education.tracked} programs tracked · {data.education.applications} applications · {data.education.admissions} admissions · {data.education.rejections} rejections · {data.education.waiting} waiting
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>By {data.segmentLabel.toLowerCase()}</CardTitle>
            <CardDescription>Counts and rates per segment (submitted applications only)</CardDescription>
          </div>
          <Select value={data.segmentKey} onValueChange={(v) => set("segment", v)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {data.segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submitted application yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>{data.segmentLabel}</TableHead>
                  <TableHead className="text-right">Applications</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="text-right">Interviews</TableHead>
                  <TableHead className="text-right">Offers</TableHead>
                  <TableHead className="text-right">Response rate</TableHead>
                  <TableHead className="text-right">Interview rate</TableHead>
                  <TableHead className="text-right">Avg. response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.segments.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">
                      {s.key}
                      {s.applications < 5 && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">small sample</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.applications}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.responses}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.interviews}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.offers}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.responseRate != null ? `${s.responseRate}%` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.interviewRate != null ? `${s.interviewRate}%` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.avgResponseDays != null ? `${s.avgResponseDays} d` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        A response = any answer (positive or negative), an interview, an offer or a waitlist. Rates on fewer than ~5 applications are not meaningful.
      </p>
    </PageContainer>
  );
}
