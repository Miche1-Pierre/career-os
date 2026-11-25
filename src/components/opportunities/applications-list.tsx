"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Briefcase, ChevronDown, FilterX, GraduationCap, Kanban, List, Loader2, MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { PriorityDot } from "@/components/app/badges";
import { Counter } from "@/components/app/sparkle";
import { OrgAvatar } from "@/components/app/org-avatar";
import { MultiSelect } from "@/components/app/multi-select";
import { EmptyState } from "@/components/app/empty-state";
import { SortableHead, useTableSort, type SortColumn } from "@/components/app/sortable-table";
import { useAppData } from "@/components/app/app-data";
import { useQuickImport } from "@/components/app/quick-import";
import { hasActiveFilters, type ListFilters } from "@/lib/filters";
import {
  FAMILY_LABEL,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_META,
  PRIORITIES,
  PRIORITY_META,
  SOURCES,
  SOURCE_LABEL,
  STAGE_CATEGORIES,
  STAGE_CATEGORY_META,
  REMOTE_LABEL,
  sourceLabel,
} from "@/lib/constants";
import { diffDays, formatISODate, type ISODate } from "@/lib/dates";
import type { OpportunityListItem } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";
import { applicationsHref, defaultSort, nextActionOf, relativeDayFr, sameFilters, type ApplicationsLayout, type SavedViewRef } from "./applications-params";
import { NextActionChip, StageChip, TagChips } from "./chips";
import { KanbanBoard } from "./kanban-board";
import { ViewsMenu } from "./views-menu";

// The tooltip trigger overrides the item's data-state, so the pressed look is keyed on aria-checked.
const PRESSED = "aria-checked:bg-selected aria-checked:text-foreground";

const SORTS = [
  { value: "updated", label: "Récemment modifiées" },
  { value: "created", label: "Récemment ajoutées" },
  { value: "priority", label: "Priorité" },
  { value: "deadline", label: "Date limite" },
  { value: "followup", label: "Prochaine relance" },
  { value: "applied", label: "Date de candidature" },
  { value: "organization", label: "Organisation" },
  { value: "title", label: "Intitulé" },
];

/** Search field with its own state (debounced), resynced when the filters change from elsewhere (reset, view). */
function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [q, setQ] = useState(value);
  const [seen, setSeen] = useState(value);
  const [committed, setCommitted] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== committed) {
      setCommitted(value);
      setQ(value);
    }
  }
  useEffect(() => {
    if (q === committed) return;
    const t = setTimeout(() => {
      setCommitted(q);
      onCommit(q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Intitulé, entreprise, ville, tag…" className="pl-9" aria-label="Rechercher dans les candidatures" />
    </div>
  );
}

export function ApplicationsList({
  rows,
  filters,
  layout,
  view,
  views,
  countries,
}: {
  rows: OpportunityListItem[];
  filters: ListFilters;
  layout: ApplicationsLayout;
  view: SavedViewRef | null;
  views: SavedViewRef[];
  countries: string[];
}) {
  const router = useRouter();
  const { tags } = useAppData();
  const quickImport = useQuickImport();
  const [isNavigating, startNavigation] = useTransition();
  const isBoard = layout === "board";

  const navigate = (href: string, mode: "push" | "replace" = "replace") =>
    startNavigation(() => (mode === "push" ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })));
  const update = (patch: Partial<ListFilters>) => navigate(applicationsHref({ filters: { ...filters, ...patch }, layout, view }));

  const baseFilters = (view?.filters ?? {}) as ListFilters;
  const canReset = view ? !sameFilters(filters, baseFilters) : hasActiveFilters(filters) || !!filters.sort;
  const filtered = hasActiveFilters(filters);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const r of rows) byCat[r.stage.category] = (byCat[r.stage.category] ?? 0) + 1;
    return byCat;
  }, [rows]);

  return (
    <PageContainer wide className={cn(isBoard && "flex flex-col md:h-[calc(100svh-3.5rem-4.5rem)]")}>
      <PageHeader
        eyebrow={view ? "Vue enregistrée" : undefined}
        title={
          <span className="flex min-w-0 items-center gap-2">
            {view && <Bookmark className="size-5 shrink-0 text-highlight-500" />}
            <span className="min-w-0 truncate">{view?.name ?? "Candidatures"}</span>
            <Counter value={rows.length} size="sm" />
            {isNavigating && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          </span>
        }
        description={view ? undefined : isBoard ? "Faites glisser une carte pour changer son statut : chaque déplacement est consigné dans l’historique." : "Tous les emplois, stages, VIE, masters et programmes que vous suivez."}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => quickImport.open()}>
              Importer
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus /> Nouvelle candidature <ChevronDown className="opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
                {OPPORTUNITY_TYPES.map((t) => (
                  <DropdownMenuItem key={t} asChild>
                    <Link href={`/applications/new?type=${t}`} className="min-w-0">
                      {OPPORTUNITY_TYPE_META[t].family === "EDUCATION" ? <GraduationCap /> : <Briefcase />}
                      <span className="shrink-0">{OPPORTUNITY_TYPE_META[t].label}</span>
                      <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{OPPORTUNITY_TYPE_META[t].description}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        className={isBoard ? "pb-4" : undefined}
      />

      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filters.family ?? "ALL"} onValueChange={(v) => update({ family: v === "ALL" ? undefined : (v as "JOB" | "EDUCATION") })}>
            <TabsList>
              <TabsTrigger value="ALL">Tout</TabsTrigger>
              <TabsTrigger value="JOB">{FAMILY_LABEL.JOB}</TabsTrigger>
              <TabsTrigger value="EDUCATION">{FAMILY_LABEL.EDUCATION}</TabsTrigger>
            </TabsList>
          </Tabs>
          <SearchBox value={filters.q ?? ""} onCommit={(q) => update({ q: q || undefined })} />
          <Select value={filters.sort ?? defaultSort(layout)} onValueChange={(v) => update({ sort: v === defaultSort(layout) ? undefined : v })}>
            <SelectTrigger size="sm" className="w-48" aria-label="Trier par">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
            <ViewsMenu views={views} view={view} filters={filters} layout={layout} onNavigate={navigate} />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={layout}
              onValueChange={(v) => v && v !== layout && navigate(applicationsHref({ filters, layout: v as ApplicationsLayout, view }), "push")}
              aria-label="Disposition"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="list" className={PRESSED} aria-label="Liste">
                    <List />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Liste</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="board" className={PRESSED} aria-label="Tableau">
                    <Kanban />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Tableau</TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Statut"
            value={filters.categories ?? []}
            onChange={(v) => update({ categories: v.length ? (v as never) : undefined })}
            options={STAGE_CATEGORIES.map((c) => ({ value: c, label: STAGE_CATEGORY_META[c].label, hint: counts[c] ? String(counts[c]) : undefined, icon: <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[c].dot)} /> }))}
          />
          <MultiSelect label="Type" value={filters.types ?? []} onChange={(v) => update({ types: v.length ? (v as never) : undefined })} options={OPPORTUNITY_TYPES.map((t) => ({ value: t, label: OPPORTUNITY_TYPE_META[t].label }))} />
          <MultiSelect label="Tags" value={filters.tags ?? []} onChange={(v) => update({ tags: v.length ? v : undefined })} options={tags.map((t) => ({ value: t.name, label: t.name }))} />
          <MultiSelect label="Source" value={filters.sources ?? []} onChange={(v) => update({ sources: v.length ? v : undefined })} options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
          <MultiSelect label="Priorité" value={filters.priorities ?? []} onChange={(v) => update({ priorities: v.length ? (v as never) : undefined })} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} searchable={false} />
          {countries.length > 0 && <MultiSelect label="Pays" value={filters.countries ?? []} onChange={(v) => update({ countries: v.length ? v : undefined })} options={countries.map((c) => ({ value: c, label: c }))} />}
          <div className="ml-1 flex items-center gap-2">
            <Switch id="closed" size="sm" checked={filters.includeClosed !== false} onCheckedChange={(v) => update({ includeClosed: v ? undefined : false })} />
            <Label htmlFor="closed" className="text-sm font-normal whitespace-nowrap text-muted-foreground">
              Clôturées
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="archived" size="sm" checked={!!filters.archived} onCheckedChange={(v) => update({ archived: v || undefined })} />
            <Label htmlFor="archived" className="text-sm font-normal whitespace-nowrap text-muted-foreground">
              Archivées
            </Label>
          </div>
          {canReset && (
            <Button variant="ghost-secondary" size="sm" onClick={() => navigate(applicationsHref({ filters: baseFilters, layout, view }))}>
              <FilterX /> {view ? "Revenir à la vue" : "Réinitialiser"}
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={filtered ? "Aucun résultat" : "Aucune candidature pour l’instant"}
          description={filtered ? "Essayez de retirer quelques filtres." : "Ajoutez votre première opportunité : collez une offre, une URL ou un fichier."}
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="highlight" onClick={() => quickImport.open()}>
              Import rapide
            </Button>
            <Button variant="outline" asChild>
              <Link href="/applications/new">Saisir manuellement</Link>
            </Button>
          </div>
        </EmptyState>
      ) : isBoard ? (
        <KanbanBoard rows={rows} />
      ) : (
        // A new sort chosen in the menu replaces the column sort.
        <ApplicationsTable key={filters.sort ?? ""} rows={rows} />
      )}
    </PageContainer>
  );
}

type ApplicationColumn = "title" | "stage" | "next" | "applied" | "place" | "source";

function applicationColumns(today: ISODate): Record<ApplicationColumn, SortColumn<OpportunityListItem>> {
  return {
    title: { value: (r) => r.title },
    stage: { value: (r) => STAGE_CATEGORIES.indexOf(r.stage.category) * 1000 + r.stage.position },
    next: { value: (r) => nextActionOf(r, today, "fr")?.date },
    applied: { value: (r) => r.appliedAt, firstDir: "desc" },
    place: { value: (r) => [r.locationCity, r.locationCountry].filter(Boolean).join(", ") },
    source: { value: (r) => sourceLabel(r.source) },
  };
}

function ApplicationsTable({ rows: input }: { rows: OpportunityListItem[] }) {
  const router = useRouter();
  const { today, dateLocale } = useAppData();
  const columns = useMemo(() => applicationColumns(today), [today]);
  const { rows, sort, onSort } = useTableSort(input, columns);
  const head = { sort, onSort };
  return (
    <>
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SortableHead column="title" {...head} className="pl-3">
                Candidature
              </SortableHead>
              <SortableHead column="stage" {...head} className="w-32 lg:w-40">
                Statut
              </SortableHead>
              <SortableHead column="next" {...head} className="w-40 lg:w-52">
                Prochaine action
              </SortableHead>
              <SortableHead column="applied" {...head} className="hidden w-28 lg:table-cell">
                Envoyée
              </SortableHead>
              <SortableHead column="place" {...head} className="hidden w-44 xl:table-cell">
                Lieu
              </SortableHead>
              <SortableHead column="source" {...head} className="hidden w-36 2xl:table-cell">
                Source
              </SortableHead>
              <TableHead className="hidden w-44 2xl:table-cell">Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const location = [row.locationCity, row.locationCountry].filter(Boolean).join(", ");
              const remote = row.remotePolicy ? REMOTE_LABEL[row.remotePolicy] : null;
              return (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(`/applications/${row.id}`)}>
                  <TableCell className="h-16 max-w-0 pl-3">
                    <div className="flex items-center gap-3">
                      <OrgAvatar name={row.organization?.name ?? row.title} orgId={row.organization?.id} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Link href={`/applications/${row.id}`} className="truncate text-sm font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()} title={row.title}>
                            {row.title}
                          </Link>
                          <PriorityDot priority={row.priority} />
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{row.organization?.name ?? "Sans organisation"}</span>
                          <span className="text-faint">·</span>
                          <span className="shrink-0">{OPPORTUNITY_TYPE_META[row.type].label}</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <StageChip label={row.stage.label} category={row.stage.category} />
                  </TableCell>
                  <TableCell className="max-w-0">
                    <NextActionChip row={row} />
                  </TableCell>
                  <TableCell className="hidden truncate text-sm text-muted-foreground tabular-nums lg:table-cell">
                    {row.appliedAt ? <span title={formatISODate(row.appliedAt, "long", dateLocale)}>{relativeDayFr(diffDays(row.appliedAt, today))}</span> : <span className="text-faint">—</span>}
                  </TableCell>
                  <TableCell className="hidden truncate text-sm text-muted-foreground xl:table-cell" title={[location, remote].filter(Boolean).join(" · ") || undefined}>
                    {location || <span className="text-faint">—</span>}
                    {remote && <span className="ml-1 text-xs text-faint">· {remote}</span>}
                  </TableCell>
                  <TableCell className="hidden truncate text-sm text-muted-foreground 2xl:table-cell">{sourceLabel(row.source)}</TableCell>
                  <TableCell className="hidden max-w-0 2xl:table-cell">
                    <TagChips tags={row.tags} max={2} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <Link key={row.id} href={`/applications/${row.id}`} className="block rounded-2xl border border-border bg-background p-4 transition-colors hover:bg-muted-background active:bg-primary-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <OrgAvatar name={row.organization?.name ?? row.title} orgId={row.organization?.id} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
                    <PriorityDot priority={row.priority} />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{row.organization?.name ?? "—"}</div>
                </div>
              </div>
              <StageChip label={row.stage.label} category={row.stage.category} className="max-w-[45%] shrink-0" />
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
              <NextActionChip row={row} />
              {row.locationCity && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0" />
                  <span className="truncate">{row.locationCity}</span>
                </span>
              )}
              <TagChips tags={row.tags} max={2} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
