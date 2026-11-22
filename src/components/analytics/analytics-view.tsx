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
  applications: { label: "Candidatures envoyées", color: "var(--chart-1)" },
  added: { label: "Opportunités ajoutées", color: "var(--chart-2)" },
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
    { label: "Candidatures envoyées", value: o.applications },
    { label: "Réponses", value: o.responses },
    { label: "Entretiens", value: o.interviews },
    { label: "Offres / admissions", value: o.offers },
    { label: "Acceptées", value: o.accepted },
  ];
  return (
    <PageContainer wide>
      <PageHeader
        title="Statistiques"
        description="Uniquement des chiffres objectifs — Career OS ne tire jamais de conclusions à votre place."
        actions={
          <Tabs value={family} onValueChange={(v) => set("family", v)}>
            <TabsList>
              <TabsTrigger value="ALL">Tout</TabsTrigger>
              <TabsTrigger value="JOB">Emplois</TabsTrigger>
              <TabsTrigger value="EDUCATION">Études</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Candidatures envoyées" value={o.applications} hint={`${data.totalTracked} suivies au total`} />
        <Stat label="Taux de réponse" value={o.responseRate} suffix="%" hint={`${o.responses} réponse${o.responses > 1 ? "s" : ""}`} />
        <Stat label="Taux d’entretien" value={o.interviewRate} suffix="%" hint={`${o.interviews} avec entretien`} />
        <Stat label="Offres / admissions" value={o.offers} hint={o.offerRate != null ? `${o.offerRate} % des candidatures` : undefined} />
        <Stat label="Délai moyen de réponse" value={o.avgResponseDays} suffix="j" />
        <Stat label="Délai moyen avant 1er entretien" value={o.avgDaysToInterview} suffix="j" />
        <Stat label="Relances / candidature" value={o.followUpsPerApplication} hint={`${o.followUps} relance${o.followUps > 1 ? "s" : ""} envoyée${o.followUps > 1 ? "s" : ""}`} />
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Par mois</CardTitle>
            <CardDescription>12 derniers mois</CardDescription>
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
            <CardTitle>Entonnoir</CardTitle>
            <CardDescription>De la candidature à la décision</CardDescription>
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
                <p className="mb-1 font-medium text-foreground">Études</p>
                {data.education.tracked} programme(s) suivi(s) · {data.education.applications} candidature(s) · {data.education.admissions} admission(s) · {data.education.rejections} refus · {data.education.waiting} en attente
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Répartition : {data.segmentLabel}</CardTitle>
            <CardDescription>Volumes et taux par segment (candidatures envoyées uniquement)</CardDescription>
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
            <p className="text-sm text-muted-foreground">Aucune candidature envoyée pour l’instant.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>{data.segmentLabel}</TableHead>
                  <TableHead className="text-right">Candidatures</TableHead>
                  <TableHead className="text-right">Réponses</TableHead>
                  <TableHead className="text-right">Entretiens</TableHead>
                  <TableHead className="text-right">Offres</TableHead>
                  <TableHead className="text-right">Taux de réponse</TableHead>
                  <TableHead className="text-right">Taux d’entretien</TableHead>
                  <TableHead className="text-right">Délai moyen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.segments.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">
                      {s.key}
                      {s.applications < 5 && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">petit échantillon</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.applications}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.responses}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.interviews}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.offers}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.responseRate != null ? `${s.responseRate} %` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.interviewRate != null ? `${s.interviewRate} %` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.avgResponseDays != null ? `${s.avgResponseDays} j` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Une réponse = tout retour (positif ou négatif), un entretien, une offre ou une liste d’attente. Les taux calculés sur moins de ~5 candidatures ne sont pas significatifs.
      </p>
    </PageContainer>
  );
}
