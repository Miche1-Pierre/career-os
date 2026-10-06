"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, GraduationCap, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { TagList } from "@/components/app/badges";
import { Counter } from "@/components/app/sparkle";
import { OrgAvatar } from "@/components/app/org-avatar";
import { useAppData } from "@/components/app/app-data";
import { formatRelativeInstant } from "@/lib/dates";
import { normalizeText } from "@/lib/text";
import type { OrgKind } from "@/lib/constants";
import type { OrganizationListItem } from "@/server/services/organizations";
import { OrganizationDialog } from "./organization-form";

export function OrganizationsList({ kind, rows, openNew }: { kind: OrgKind; rows: OrganizationListItem[]; openNew?: boolean }) {
  const router = useRouter();
  useAppData();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(!!openNew);
  const institution = kind === "INSTITUTION";
  const base = institution ? "/institutions" : "/companies";
  const filtered = useMemo(() => {
    const n = normalizeText(q);
    return n ? rows.filter((r) => normalizeText(`${r.name} ${r.industry ?? ""} ${r.city ?? ""} ${r.country ?? ""} ${r.tags.join(" ")}`).includes(n)) : rows;
  }, [rows, q]);
  const Icon = institution ? GraduationCap : Building2;
  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {institution ? "Institutions" : "Companies"} <Counter value={rows.length} size="sm" />
          </span>
        }
        description={institution ? "Universities and schools — every program, contact and note in one place." : "Every company you applied to or are watching."}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New {institution ? "institution" : "company"}
          </Button>
        }
      />
      <div className="relative mb-4 max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="pl-9" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Icon} title={rows.length ? "No match" : `No ${institution ? "institution" : "company"} yet`} description={rows.length ? undefined : "They are created automatically when you import an opportunity."} />
      ) : (
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Name</TableHead>
                <TableHead>{institution ? "Type" : "Industry"}</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">{institution ? "Programs" : "Applications"}</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="hidden md:table-cell">Tags</TableHead>
                <TableHead className="hidden lg:table-cell">Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`${base}/${r.id}`)}>
                  <TableCell className="h-14 pl-3">
                    <div className="flex items-center gap-3">
                      <OrgAvatar name={r.name} />
                      <Link href={`${base}/${r.id}`} className="truncate text-sm font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.industry ?? <span className="text-faint">—</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[r.city, r.country].filter(Boolean).join(", ") || <span className="text-faint">—</span>}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.activeOpportunityCount}
                    {r.opportunityCount > r.activeOpportunityCount && <span className="text-xs text-muted-foreground"> / {r.opportunityCount}</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.contactCount}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <TagList tags={r.tags} max={2} className="flex-nowrap" />
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{r.lastActivityAt ? formatRelativeInstant(r.lastActivityAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {creating && <OrganizationDialog open={creating} onOpenChange={setCreating} initial={{ kind, name: "", tags: [] }} />}
    </PageContainer>
  );
}
