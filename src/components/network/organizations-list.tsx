"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, GraduationCap, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StageBadge, TagList } from "@/components/app/badges";
import { Counter } from "@/components/app/sparkle";
import { OrgAvatar } from "@/components/app/org-avatar";
import { useAppData } from "@/components/app/app-data";
import { formatISODate, formatRelativeInstant } from "@/lib/dates";
import { groupOrganizations, locationsLabel, type OrganizationGroup } from "@/lib/org-grouping";
import { normalizeText, pluralize } from "@/lib/text";
import type { OrgKind } from "@/lib/constants";
import type { OpportunitySummary, OrganizationListItem } from "@/server/services/organizations";
import { cn } from "@/lib/utils";
import { OrganizationDialog } from "./organization-form";

type Row = OrganizationListItem;

const matches = (r: Row, n: string) => normalizeText(`${r.name} ${r.industry ?? ""} ${r.city ?? ""} ${r.country ?? ""} ${r.tags.join(" ")}`).includes(n);

function place(r: Pick<Row, "city" | "country">) {
  return [r.city, r.country].filter(Boolean).join(", ");
}

function Dash() {
  return <span className="text-faint">—</span>;
}

export function OrganizationsList({
  kind,
  rows,
  opportunities = [],
  openNew,
}: {
  kind: OrgKind;
  rows: Row[];
  /** Opportunities of the organizations that belong to a multi-site brand (shown when a brand row is expanded). */
  opportunities?: OpportunitySummary[];
  openNew?: boolean;
}) {
  useAppData();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(!!openNew);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const institution = kind === "INSTITUTION";
  const base = institution ? "/institutions" : "/companies";
  const groups = useMemo(() => groupOrganizations(rows), [rows]);
  const oppsByOrg = useMemo(() => {
    const map = new Map<string, OpportunitySummary[]>();
    for (const o of opportunities) map.set(o.organizationId, [...(map.get(o.organizationId) ?? []), o]);
    return map;
  }, [opportunities]);
  const filtered = useMemo(() => {
    const n = normalizeText(q);
    if (!n) return groups;
    const out: OrganizationGroup<Row>[] = [];
    for (const g of groups) {
      if (g.members.length > 1 && normalizeText(g.name).includes(n)) out.push(g);
      else {
        const members = g.members.filter((m) => matches(m, n));
        if (members.length) out.push({ ...g, members });
      }
    }
    return out;
  }, [groups, q]);
  const Icon = institution ? GraduationCap : Building2;
  const toggle = (key: string, value: boolean) =>
    setOpen((s) => {
      const next = new Set(s);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  const searching = !!normalizeText(q);

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {institution ? "Établissements" : "Entreprises"} <Counter value={groups.length} size="sm" />
          </span>
        }
        description={
          institution
            ? "Universités et écoles : formations, contacts et notes au même endroit. Les campus d’un même établissement sont regroupés."
            : "Les entreprises où vous avez postulé ou que vous suivez. Les filiales d’une même marque sont regroupées."
        }
        actions={
          <Button onClick={() => setCreating(true)} className="whitespace-nowrap">
            <Plus /> {institution ? "Nouvel établissement" : "Nouvelle entreprise"}
          </Button>
        }
      />
      <div className="relative mb-4 w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" aria-label="Filtrer" className="pl-9" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={rows.length ? "Aucun résultat" : institution ? "Aucun établissement pour l’instant" : "Aucune entreprise pour l’instant"}
          description={rows.length ? undefined : "Ils sont créés automatiquement quand vous importez une opportunité."}
        />
      ) : (
        // Columns follow the width actually available (container queries), not the viewport: the sidebar takes room.
        <div className="@container min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Nom</TableHead>
                <TableHead className="hidden @3xl:table-cell">{institution ? "Type" : "Secteur"}</TableHead>
                <TableHead className="hidden @xl:table-cell">Localisation</TableHead>
                <TableHead className="text-right">{institution ? "Formations" : "Candidatures"}</TableHead>
                <TableHead className="hidden text-right @5xl:table-cell">Contacts</TableHead>
                <TableHead className="hidden @6xl:table-cell">Tags</TableHead>
                <TableHead className="hidden @5xl:table-cell">Activité</TableHead>
              </TableRow>
            </TableHeader>
            {filtered.map((g) =>
              g.members.length > 1 ? (
                <BrandRows key={g.key} group={g} base={base} open={searching || open.has(g.key)} onOpenChange={(v) => toggle(g.key, v)} oppsByOrg={oppsByOrg} institution={institution} />
              ) : (
                <tbody key={g.key}>
                  <OrganizationRow row={g.members[0]} base={base} />
                </tbody>
              ),
            )}
          </Table>
        </div>
      )}
      {creating && <OrganizationDialog open={creating} onOpenChange={setCreating} initial={{ kind, name: "", tags: [] }} />}
    </PageContainer>
  );
}

function OrganizationRow({ row: r, base }: { row: Row; base: string }) {
  const router = useRouter();
  return (
    <TableRow className="cursor-pointer" onClick={() => router.push(`${base}/${r.id}`)}>
      <TableCell className="h-14 pl-3">
        <div className="flex min-w-0 items-center gap-3 max-w-[min(24rem,calc(100cqw-140px))] @xl:max-w-[min(24rem,calc(100cqw-320px))] @3xl:max-w-[min(24rem,calc(100cqw-500px))] @5xl:max-w-[min(24rem,calc(100cqw-700px))] @6xl:max-w-[min(26rem,calc(100cqw-870px))]">
          <OrgAvatar name={r.name} orgId={r.id} website={r.website} />
          <Link href={`${base}/${r.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:underline" title={r.name} onClick={(e) => e.stopPropagation()}>
            {r.name}
          </Link>
        </div>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground @3xl:table-cell">
        <span className="block max-w-40 truncate" title={r.industry ?? undefined}>
          {r.industry ?? <Dash />}
        </span>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground @xl:table-cell">
        <span className="block max-w-40 truncate" title={place(r) || undefined}>
          {place(r) || <Dash />}
        </span>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        <Counts active={r.activeOpportunityCount} total={r.opportunityCount} />
      </TableCell>
      <TableCell className="hidden text-right text-sm tabular-nums @5xl:table-cell">{r.contactCount}</TableCell>
      <TableCell className="hidden @6xl:table-cell">
        <TagList tags={r.tags} max={2} className="flex-nowrap" />
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground @5xl:table-cell">{r.lastActivityAt ? formatRelativeInstant(r.lastActivityAt) : <Dash />}</TableCell>
    </TableRow>
  );
}

function Counts({ active, total }: { active: number; total: number }) {
  return (
    <>
      {active}
      {total > active && <span className="text-xs text-muted-foreground"> / {total}</span>}
    </>
  );
}

function BrandRows({
  group,
  base,
  open,
  onOpenChange,
  oppsByOrg,
  institution,
}: {
  group: OrganizationGroup<Row>;
  base: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oppsByOrg: Map<string, OpportunitySummary[]>;
  institution: boolean;
}) {
  const { dateLocale } = useAppData();
  const members = group.members;
  const lead = members[0];
  const industries = [...new Set(members.map((m) => m.industry).filter(Boolean))];
  const where = locationsLabel(members);
  const tags = [...new Set(members.flatMap((m) => m.tags))];
  const last = members.reduce<string | Date | null>((acc, m) => (m.lastActivityAt && (!acc || new Date(m.lastActivityAt) > new Date(acc)) ? m.lastActivityAt : acc), null);
  const sites = pluralize(members.length, institution ? "campus" : "site", institution ? "campus" : "sites");
  return (
    <Collapsible asChild open={open} onOpenChange={onOpenChange}>
      <tbody>
        <TableRow className="cursor-pointer" onClick={() => onOpenChange(!open)}>
          <TableCell className="h-14 pl-1">
            <div className="flex min-w-0 items-center gap-2 max-w-[min(24rem,calc(100cqw-140px))] @xl:max-w-[min(24rem,calc(100cqw-320px))] @3xl:max-w-[min(24rem,calc(100cqw-500px))] @5xl:max-w-[min(24rem,calc(100cqw-700px))] @6xl:max-w-[min(26rem,calc(100cqw-870px))]">
              <CollapsibleTrigger asChild>
                <Button variant="ghost-secondary" size="icon-xs" aria-label={open ? `Masquer les ${sites} de ${group.name}` : `Afficher les ${sites} de ${group.name}`} onClick={(e) => e.stopPropagation()}>
                  <ChevronRight className={cn("transition-transform duration-150", open && "rotate-90")} />
                </Button>
              </CollapsibleTrigger>
              <OrgAvatar name={group.name} orgId={(members.find((m) => m.website) ?? lead).id} website={members.find((m) => m.website)?.website ?? null} />
              <span className="min-w-0 truncate text-sm font-medium text-foreground" title={group.name}>
                {group.name}
              </span>
              <span className="shrink-0 rounded-md bg-primary-100 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground dark:bg-stone-800">{sites}</span>
            </div>
          </TableCell>
          <TableCell className="hidden text-sm text-muted-foreground @3xl:table-cell">
            <span className="block max-w-40 truncate" title={industries.join(", ") || undefined}>
              {industries.length ? industries.join(", ") : <Dash />}
            </span>
          </TableCell>
          <TableCell className="hidden text-sm text-muted-foreground @xl:table-cell">
            <span className="block max-w-40 truncate" title={where.label || undefined}>
              {where.label ? (
                <>
                  {where.label}
                  {where.more > 0 && <span className="text-faint"> +{where.more}</span>}
                </>
              ) : (
                <Dash />
              )}
            </span>
          </TableCell>
          <TableCell className="text-right text-sm tabular-nums">
            <Counts active={members.reduce((a, m) => a + m.activeOpportunityCount, 0)} total={members.reduce((a, m) => a + m.opportunityCount, 0)} />
          </TableCell>
          <TableCell className="hidden text-right text-sm tabular-nums @5xl:table-cell">{members.reduce((a, m) => a + m.contactCount, 0)}</TableCell>
          <TableCell className="hidden @6xl:table-cell">
            <TagList tags={tags} max={2} className="flex-nowrap" />
          </TableCell>
          <TableCell className="hidden text-sm text-muted-foreground @5xl:table-cell">{last ? formatRelativeInstant(last) : <Dash />}</TableCell>
        </TableRow>
        <CollapsibleContent asChild>
          <tr className="border-b border-separator bg-muted-background/60">
            <td colSpan={7} className="px-2 pt-1 pb-3 sm:pl-10">
              {/* w-0 + min-w-full: the panel fills the row without widening the table columns. */}
              <ul className="surface-list w-0 min-w-full">
                {members.map((m) => {
                  const opps = oppsByOrg.get(m.id) ?? [];
                  return (
                    <li key={m.id} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <OrgAvatar name={m.name} orgId={m.id} website={m.website} size="sm" />
                        <Link href={`${base}/${m.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:underline" title={m.name}>
                          {m.name}
                        </Link>
                        {place(m) && <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">{place(m)}</span>}
                        <span className="ml-auto shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                          {pluralize(m.opportunityCount, institution ? "formation" : "candidature")} · {pluralize(m.contactCount, "contact")}
                        </span>
                      </div>
                      {opps.length > 0 ? (
                        <ul className="flex flex-col gap-1 pl-8.5">
                          {opps.map((o) => (
                            <li key={o.id} className="min-w-0">
                              <Link href={`/applications/${o.id}`} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
                                <span className="min-w-0 truncate text-[13px] text-foreground" title={o.title}>
                                  {o.title}
                                </span>
                                <StageBadge label={o.stageLabel} category={o.stageCategory} className="shrink-0" />
                                {o.appliedAt && <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">postulé le {formatISODate(o.appliedAt, "dayMonth", dateLocale)}</span>}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pl-8.5 text-xs text-muted-foreground">{institution ? "Aucune formation." : "Aucune candidature."}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </td>
          </tr>
        </CollapsibleContent>
      </tbody>
    </Collapsible>
  );
}
