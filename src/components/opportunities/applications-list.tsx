"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, Briefcase, ChevronDown, Download, FilterX, GraduationCap, Loader2, MapPin, Plus, Search, SquareKanban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { DueBadge, PriorityDot, StageBadge, TagList } from "@/components/app/badges";
import { Counter } from "@/components/app/sparkle";
import { OrgAvatar } from "@/components/app/org-avatar";
import { MultiSelect } from "@/components/app/multi-select";
import { EmptyState } from "@/components/app/empty-state";
import { useAppData } from "@/components/app/app-data";
import { useQuickImport } from "@/components/app/quick-import";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { createViewAction, deleteViewAction, updateViewAction } from "@/app/actions/settings";
import { filtersToSearch, hasActiveFilters, type ListFilters } from "@/lib/filters";
import {
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
import { formatISODate, relativeDayLabel } from "@/lib/dates";
import type { OpportunityListItem } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently added" },
  { value: "priority", label: "Priority" },
  { value: "deadline", label: "Deadline" },
  { value: "followup", label: "Next follow-up" },
  { value: "applied", label: "Application date" },
  { value: "organization", label: "Organization" },
  { value: "title", label: "Title" },
];

export function NextActionCell({ row, hideEmpty }: { row: OpportunityListItem; hideEmpty?: boolean }) {
  const pre = ["BACKLOG", "TO_APPLY", "PREPARING"].includes(row.stage.category);
  if (pre && row.deadline) return <DueBadge date={row.deadline} time={row.deadlineTime} prefix="Deadline" />;
  if (row.nextFollowUpAt && !row.followUpPaused && !["WON", "LOST"].includes(row.stage.category)) return <DueBadge date={row.nextFollowUpAt} prefix="Follow up" />;
  if (row.expectedResponseAt && !["WON", "LOST"].includes(row.stage.category)) return <DueBadge date={row.expectedResponseAt} prefix="Answer" />;
  return hideEmpty ? null : <span className="text-sm text-faint">—</span>;
}

export function ApplicationsList({ rows, filters, view, countries }: { rows: OpportunityListItem[]; filters: ListFilters; view: { id: string; name: string } | null; countries: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { tags, today, dateLocale } = useAppData();
  const quickImport = useQuickImport();
  const confirm = useConfirm();
  const { run } = useAction();
  const [isNavigating, startNavigation] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  const update = (patch: Partial<ListFilters>) => {
    const next = { ...filters, ...patch };
    startNavigation(() => router.replace(`${pathname}${filtersToSearch(next, { view: view?.id })}`, { scroll: false }));
  };

  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const t = setTimeout(() => update({ q: q || undefined }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const r of rows) byCat[r.stage.category] = (byCat[r.stage.category] ?? 0) + 1;
    return byCat;
  }, [rows]);

  const exportHref = `/api/v1/export?format=csv&table=opportunities`;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={view ? "Saved view" : undefined}
        title={
          <span className="flex items-center gap-2">
            {view && <Bookmark className="size-5 text-highlight-500" />}
            {view?.name ?? "Applications"}
            <Counter value={rows.length} size="sm" />
            {isNavigating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </span>
        }
        description={view ? undefined : "Every job, internship, VIE, master and program you track."}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/applications/board${filtersToSearch({ family: filters.family, tags: filters.tags })}`}>
                <SquareKanban /> Board
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Bookmark /> View <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => (setViewName(""), setSaveOpen(true))}>
                  <BookmarkPlus /> Save as new view
                </DropdownMenuItem>
                {view && (
                  <>
                    <DropdownMenuItem onClick={() => run(() => updateViewAction(view.id, { filters: filters as never }), { success: "View updated" })}>
                      <Bookmark /> Update “{view.name}”
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        if (await confirm({ title: `Delete the view “${view.name}”?`, description: "Only the saved filter is deleted, not the applications.", destructive: true, confirmLabel: "Delete view" }))
                          run(() => deleteViewAction(view.id), { success: "View deleted", onSuccess: () => router.push("/applications") });
                      }}
                    >
                      <Trash2 /> Delete view
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={exportHref}>
                    <Download /> Export CSV
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => quickImport.open()}>
              Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus /> New <ChevronDown className="opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {OPPORTUNITY_TYPES.map((t) => (
                  <DropdownMenuItem key={t} asChild>
                    <Link href={`/applications/new?type=${t}`}>
                      {OPPORTUNITY_TYPE_META[t].family === "EDUCATION" ? <GraduationCap /> : <Briefcase />}
                      {OPPORTUNITY_TYPE_META[t].label}
                      <span className="ml-auto text-xs text-muted-foreground">{OPPORTUNITY_TYPE_META[t].description}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filters.family ?? "ALL"} onValueChange={(v) => update({ family: v === "ALL" ? undefined : (v as "JOB" | "EDUCATION") })}>
            <TabsList>
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="JOB">Jobs</TabsTrigger>
              <TabsTrigger value="EDUCATION">Education</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, company, city, tag…" className="pl-9" />
          </div>
          <Select value={filters.sort ?? "updated"} onValueChange={(v) => update({ sort: v === "updated" ? undefined : v })}>
            <SelectTrigger size="sm" className="w-44">
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Status"
            value={filters.categories ?? []}
            onChange={(v) => update({ categories: v.length ? (v as never) : undefined })}
            options={STAGE_CATEGORIES.map((c) => ({ value: c, label: STAGE_CATEGORY_META[c].label, hint: counts[c] ? String(counts[c]) : undefined, icon: <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[c].dot)} /> }))}
          />
          <MultiSelect label="Type" value={filters.types ?? []} onChange={(v) => update({ types: v.length ? (v as never) : undefined })} options={OPPORTUNITY_TYPES.map((t) => ({ value: t, label: OPPORTUNITY_TYPE_META[t].label }))} />
          <MultiSelect label="Tags" value={filters.tags ?? []} onChange={(v) => update({ tags: v.length ? v : undefined })} options={tags.map((t) => ({ value: t.name, label: t.name }))} />
          <MultiSelect label="Source" value={filters.sources ?? []} onChange={(v) => update({ sources: v.length ? v : undefined })} options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
          <MultiSelect label="Priority" value={filters.priorities ?? []} onChange={(v) => update({ priorities: v.length ? (v as never) : undefined })} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} searchable={false} />
          {countries.length > 0 && <MultiSelect label="Country" value={filters.countries ?? []} onChange={(v) => update({ countries: v.length ? v : undefined })} options={countries.map((c) => ({ value: c, label: c }))} />}
          <div className="ml-1 flex items-center gap-2">
            <Switch id="closed" size="sm" checked={filters.includeClosed !== false} onCheckedChange={(v) => update({ includeClosed: v ? undefined : false })} />
            <Label htmlFor="closed" className="text-sm font-normal text-muted-foreground">
              Show closed
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="archived" size="sm" checked={!!filters.archived} onCheckedChange={(v) => update({ archived: v || undefined })} />
            <Label htmlFor="archived" className="text-sm font-normal text-muted-foreground">
              Archived
            </Label>
          </div>
          {hasActiveFilters(filters) && (
            <Button variant="ghost-secondary" size="sm" onClick={() => (setQ(""), startNavigation(() => router.replace(view ? `${pathname}?view=${view.id}` : pathname)))}>
              <FilterX /> Reset
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Briefcase} title={hasActiveFilters(filters) ? "No match" : "No applications yet"} description={hasActiveFilters(filters) ? "Try removing some filters." : "Capture your first opportunity: paste a posting, a URL or a file."}>
          <div className="flex gap-2">
            <Button variant="highlight" onClick={() => quickImport.open()}>Quick import</Button>
            <Button variant="outline" asChild>
              <Link href="/applications/new">Add manually</Link>
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-3">Opportunity</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead className="w-44">Next</TableHead>
                  <TableHead className="hidden w-28 lg:table-cell">Applied</TableHead>
                  <TableHead className="hidden w-44 xl:table-cell">Location</TableHead>
                  <TableHead className="hidden w-36 2xl:table-cell">Source</TableHead>
                  <TableHead className="hidden w-44 2xl:table-cell">Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(`/applications/${row.id}`)}>
                    <TableCell className="h-16 max-w-0 pl-3">
                      <div className="flex items-center gap-3">
                        <OrgAvatar name={row.organization?.name ?? row.title} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/applications/${row.id}`} className="truncate text-sm font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                              {row.title}
                            </Link>
                            <PriorityDot priority={row.priority} />
                          </div>
                          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <span className="truncate">{row.organization?.name ?? "No organization"}</span>
                            <span className="text-faint">·</span>
                            <span className="shrink-0">{OPPORTUNITY_TYPE_META[row.type].label}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <StageBadge label={row.stage.label} category={row.stage.category} />
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <NextActionCell row={row} />
                    </TableCell>
                    <TableCell className="hidden truncate text-sm text-muted-foreground tabular-nums lg:table-cell">{row.appliedAt ? <span title={formatISODate(row.appliedAt, "long", dateLocale)}>{relativeDayLabel(row.appliedAt, today)}</span> : <span className="text-faint">—</span>}</TableCell>
                    <TableCell className="hidden truncate text-sm text-muted-foreground xl:table-cell">
                      {[row.locationCity, row.locationCountry].filter(Boolean).join(", ") || <span className="text-faint">—</span>}
                      {row.remotePolicy && <span className="ml-1 text-xs text-faint">· {REMOTE_LABEL[row.remotePolicy]}</span>}
                    </TableCell>
                    <TableCell className="hidden truncate text-sm text-muted-foreground 2xl:table-cell">{sourceLabel(row.source)}</TableCell>
                    <TableCell className="hidden overflow-hidden 2xl:table-cell">
                      <TagList tags={row.tags} max={2} className="flex-nowrap" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <Link key={row.id} href={`/applications/${row.id}`} className="block rounded-2xl border border-border bg-background p-4 transition-colors hover:bg-muted-background active:bg-primary-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <OrgAvatar name={row.organization?.name ?? row.title} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
                        <PriorityDot priority={row.priority} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{row.organization?.name ?? "—"}</div>
                    </div>
                  </div>
                  <StageBadge label={row.stage.label} category={row.stage.category} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NextActionCell row={row} />
                  {row.locationCity && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {row.locationCity}
                    </span>
                  )}
                  <TagList tags={row.tags} max={2} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. HealthTech in Switzerland" autoFocus />
          <DialogFooter>
            <Button
              disabled={!viewName.trim()}
              onClick={() =>
                run(() => createViewAction(viewName.trim(), filters as never), {
                  success: "View saved",
                  onSuccess: (d) => {
                    setSaveOpen(false);
                    router.push(`/applications?view=${d.id}`);
                  },
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
