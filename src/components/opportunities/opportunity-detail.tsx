"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  ScrollText,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/app/page-header";
import { DueBadge, StageBadge, TypeBadge, UnknownValue, ProvenanceMark } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import { OrgAvatar } from "@/components/app/org-avatar";
import { useConfirm } from "@/components/app/confirm";
import type { ComboOption } from "@/components/app/entity-combobox";
import { useAction } from "@/hooks/use-action";
import {
  changeStatusAction,
  deleteOpportunityAction,
  duplicateOpportunityAction,
  setOpportunityArchivedAction,
  updateOpportunityAction,
} from "@/app/actions/opportunities";
import { OPPORTUNITY_TYPE_META, PRIORITIES, PRIORITY_META, REMOTE_LABEL, familyOf, type Priority } from "@/lib/constants";
import { formatISODate, relativeDayLabel } from "@/lib/dates";
import type { OpportunityDetail } from "@/server/services/opportunities";
import type { AuditLog } from "@/server/db/schema";
import type { SkillMatch } from "@/lib/matching";
import { useAppData } from "@/components/app/app-data";
import { cn } from "@/lib/utils";
import { StageSelect } from "./stage-select";
import { FollowUpCard } from "./follow-up-card";
import { DetailOverview } from "./detail-overview";
import { DetailTimeline } from "./detail-timeline";
import { DetailInterviews } from "./detail-interviews";
import { DetailChecklist } from "./detail-checklist";
import { DetailDocuments, type VersionOption } from "./detail-documents";
import { DetailNotes } from "./detail-notes";
import { DetailAnalysis } from "./detail-analysis";
import { DetailHistory } from "./detail-history";
import { DetailSidebar } from "./detail-sidebar";

export function OpportunityDetailView({
  opp,
  versions,
  contactOptions,
  audit,
  skillMatch,
  profileHasSkills,
  intervalLabel,
  initialTab,
}: {
  opp: OpportunityDetail;
  versions: VersionOption[];
  contactOptions: ComboOption[];
  audit: AuditLog[];
  skillMatch: SkillMatch;
  profileHasSkills: boolean;
  intervalLabel: string;
  initialTab: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();
  const { run, pending } = useAction();
  const { today, dateLocale } = useAppData();
  const [tab, setTab] = useState(initialTab);
  const family = familyOf(opp.type);
  const closed = opp.stage.category === "WON" || opp.stage.category === "LOST";
  const preSubmit = ["BACKLOG", "TO_APPLY", "PREPARING"].includes(opp.stage.category);
  const details = opp.details ?? {};
  const openTasks = opp.tasks.filter((t) => !t.done).length;
  const upcomingInterviews = opp.interviews.filter((i) => i.status === "SCHEDULED").length;

  const changeTab = (value: string) => {
    setTab(value);
    router.replace(`${pathname}${value === "overview" ? "" : `?tab=${value}`}`, { scroll: false });
  };

  const setStatus = async (key: string) => {
    const closing = ["REJECTED", "WITHDRAWN", "GHOSTED", "DECLINED", "CLOSED"].includes(key);
    if (closing && !(await confirm({ title: "Close this application?", description: "Follow-ups stop and the application moves to Closed. You can reopen it anytime by changing the status.", confirmLabel: "Close it" }))) return;
    run(() => changeStatusAction(opp.id, key), { success: (d) => (d.changed ? `${d.from} → ${d.to}` : "No change") });
  };

  const salary =
    details.salaryMin || details.salaryMax
      ? `${details.salaryMin ? Math.round(details.salaryMin / 1000) + "k" : "?"}–${details.salaryMax ? Math.round(details.salaryMax / 1000) + "k" : "?"} ${details.salaryCurrency ?? ""}${details.salaryPeriod && details.salaryPeriod !== "YEAR" ? `/${details.salaryPeriod.toLowerCase()}` : ""}`
      : details.salaryText ?? null;

  return (
    <PageContainer wide className={cn("space-y-5", pending && "opacity-90")}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/applications" className="hover:text-foreground">
          Applications
        </Link>
        <ChevronRight className="size-3.5 text-faint" />
        {opp.organization ? (
          <Link href={`/${opp.organization.kind === "INSTITUTION" ? "institutions" : "companies"}/${opp.organization.id}`} className="hover:text-foreground">
            {opp.organization.name}
          </Link>
        ) : (
          <span>No organization</span>
        )}
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <OrgAvatar name={opp.organization?.name ?? opp.title} size="xl" className="hidden sm:flex" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <TypeBadge type={opp.type} />
              <StageBadge label={opp.stage.label} category={opp.stage.category} />
              {opp.archivedAt && <Badge size="sm">Archived</Badge>}
              {opp.deletedAt && (
                <Badge size="sm" variant="destructive">
                  In trash
                </Badge>
              )}
              {opp.isDemo && (
                <Badge size="sm" variant="info">
                  Demo
                </Badge>
              )}
            </div>
            <h1 className="flex items-center gap-1.5 heading-2xl text-foreground">
              {opp.title}
              <ProvenanceMark provenance={opp.provenance?.title} />
            </h1>
            <p className="copy-sm text-muted-foreground">
              {opp.organization?.name ?? "No organization"}
              {opp.locationCity || opp.locationCountry ? ` · ${[opp.locationCity, opp.locationCountry].filter(Boolean).join(", ")}` : ""}
              {opp.remotePolicy ? ` · ${REMOTE_LABEL[opp.remotePolicy]}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StageSelect pipeline={family} value={opp.stage.key} onChange={setStatus} />
          <Select value={opp.priority} onValueChange={(v) => run(() => updateOpportunityAction(opp.id, { priority: v as Priority }), { success: "Priority updated" })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className={cn("size-2 rounded-full", PRIORITY_META[p].dot)} />
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preSubmit && (
            <Button onClick={() => setStatus(family === "EDUCATION" ? "APPLICATION_SUBMITTED" : "APPLIED")}>
              <Send /> Mark as applied
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/applications/${opp.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost-secondary" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {opp.url && (
                <DropdownMenuItem asChild>
                  <a href={opp.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Open posting
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => run(() => duplicateOpportunityAction(opp.id), { success: "Duplicated", onSuccess: (d) => router.push(`/applications/${d.id}`) })}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/v1/opportunities/${opp.id}`} target="_blank" rel="noopener noreferrer">
                  <Download /> View as JSON
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => run(() => setOpportunityArchivedAction(opp.id, !opp.archivedAt), { success: opp.archivedAt ? "Unarchived" : "Archived" })}>
                {opp.archivedAt ? <ArchiveRestore /> : <Archive />} {opp.archivedAt ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: "Move to trash?", description: "You can restore it from “Recently deleted”. Documents and files are never deleted.", destructive: true, confirmLabel: "Move to trash" }))
                    run(() => deleteOpportunityAction(opp.id), { success: "Moved to trash", onSuccess: () => router.push("/applications") });
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Key facts */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Applied">
          {opp.appliedAt ? (
            <span title={formatISODate(opp.appliedAt, "long", dateLocale)}>
              {formatISODate(opp.appliedAt, "medium", dateLocale)} <span className="text-xs text-muted-foreground">({relativeDayLabel(opp.appliedAt, today)})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Not yet</span>
          )}
          {opp.firstResponseAt && <div className="text-xs text-muted-foreground">First answer {formatISODate(opp.firstResponseAt, "dayMonth", dateLocale)}</div>}
        </Fact>
        <FollowUpCard opp={opp} closed={closed} intervalLabel={intervalLabel} />
        <Fact label={family === "EDUCATION" ? "Deadline" : "Deadline"} provenance={opp.provenance?.deadline}>
          {opp.deadline ? (
            <div className="flex flex-wrap items-center gap-2">
              {formatISODate(opp.deadline, "medium", dateLocale)}
              {opp.deadlineTime && <span className="text-xs text-muted-foreground">{opp.deadlineTime}</span>}
              {preSubmit && <DueBadge date={opp.deadline} time={opp.deadlineTime} />}
            </div>
          ) : (
            <UnknownValue label="No deadline" />
          )}
          {opp.applicationOpensAt && <div className="text-xs text-muted-foreground">Opens {formatISODate(opp.applicationOpensAt, "medium", dateLocale)}</div>}
        </Fact>
        <Fact label={family === "EDUCATION" ? "Fees" : "Compensation"} provenance={family === "EDUCATION" ? opp.provenance?.["details.tuitionFees"] : opp.provenance?.["details.salaryMin"]}>
          {family === "EDUCATION" ? details.tuitionFees ?? <UnknownValue /> : salary ?? <UnknownValue />}
          <div className="text-xs text-muted-foreground">
            {family === "EDUCATION" ? [details.level, details.entryYear].filter(Boolean).join(" · ") : [details.contractType, details.seniority].filter(Boolean).join(" · ")}
          </div>
        </Fact>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs value={tab} onValueChange={changeTab} className="min-w-0">
          {/* One scrollable row on small screens (wrapping rows would overlap the content). */}
          <div className="-mx-4 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <TabsList className="w-max min-w-full justify-start" variant="line">
              <TabsTrigger value="overview">
                <ScrollText /> Overview
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <History /> Timeline <Count n={opp.events.length} />
              </TabsTrigger>
              <TabsTrigger value="interviews">
                <CalendarDays /> Interviews <Count n={opp.interviews.length} highlight={upcomingInterviews > 0} />
              </TabsTrigger>
              <TabsTrigger value="checklist">
                <CheckSquare /> Checklist <Count n={openTasks} />
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText /> Documents <Count n={opp.documents.length} />
              </TabsTrigger>
              <TabsTrigger value="notes">
                <NotebookPen /> Notes
              </TabsTrigger>
              <TabsTrigger value="analysis">
                <Sparkles /> Analysis
              </TabsTrigger>
              <TabsTrigger value="history">
                <History /> Changes
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="pt-4">
            <DetailOverview opp={opp} skillMatch={skillMatch} />
          </TabsContent>
          <TabsContent value="timeline" className="pt-4">
            <DetailTimeline opp={opp} contactOptions={contactOptions} />
          </TabsContent>
          <TabsContent value="interviews" className="pt-4">
            <DetailInterviews opp={opp} />
          </TabsContent>
          <TabsContent value="checklist" className="pt-4">
            <DetailChecklist opp={opp} />
          </TabsContent>
          <TabsContent value="documents" className="pt-4">
            <DetailDocuments opp={opp} versions={versions} />
          </TabsContent>
          <TabsContent value="notes" className="pt-4">
            <DetailNotes opp={opp} />
          </TabsContent>
          <TabsContent value="analysis" className="pt-4">
            <DetailAnalysis opp={opp} skillMatch={skillMatch} profileHasSkills={profileHasSkills} />
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <DetailHistory audit={audit} />
          </TabsContent>
        </Tabs>
        <DetailSidebar opp={opp} contactOptions={contactOptions} />
      </div>
      <p className="text-xs text-faint">
        {OPPORTUNITY_TYPE_META[opp.type].label} · added {formatISODate(opp.discoveredAt ?? String(opp.createdAt).slice(0, 10), "medium", dateLocale)} · updated {relativeDayLabel(String(opp.updatedAt).slice(0, 10), today).toLowerCase()}
      </p>
    </PageContainer>
  );
}

function Count({ n, highlight }: { n: number; highlight?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 heading-xs tabular-nums",
        highlight ? "bg-highlight-400 text-white" : "bg-primary-150 text-primary-700 dark:bg-stone-800 dark:text-stone-300",
      )}
    >
      {n}
    </span>
  );
}

export function Fact({ label, children, provenance, className }: { label: string; children: React.ReactNode; provenance?: Parameters<typeof ProvenanceMark>[0]["provenance"]; className?: string }) {
  return (
    <div className={cn("surface px-4 py-3.5", className)}>
      <div className="mb-1.5 flex items-center gap-1 heading-sm text-muted-foreground">
        {label}
        <ProvenanceMark provenance={provenance} />
      </div>
      <div className="text-base text-foreground">{children}</div>
    </div>
  );
}
