"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Counter } from "@/components/app/sparkle";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/app/multi-select";
import { useAppData } from "@/components/app/app-data";
import { RELATIONSHIPS, RELATIONSHIP_LABEL } from "@/lib/constants";
import { formatISODate } from "@/lib/dates";
import { initials, normalizeText } from "@/lib/text";
import type { ContactListItem } from "@/server/services/contacts";
import { ContactDialog } from "./contact-form";

export function ContactsList({ rows, openNew }: { rows: ContactListItem[]; openNew?: boolean }) {
  const router = useRouter();
  const { dateLocale } = useAppData();
  const [q, setQ] = useState("");
  const [relationships, setRelationships] = useState<string[]>([]);
  const [creating, setCreating] = useState(!!openNew);
  const filtered = useMemo(() => {
    const n = normalizeText(q);
    return rows.filter(
      (r) =>
        (!n || normalizeText(`${r.fullName} ${r.organizationName ?? ""} ${r.role ?? ""} ${r.email ?? ""} ${r.tags.join(" ")}`).includes(n)) &&
        (!relationships.length || (r.relationship && relationships.includes(r.relationship))),
    );
  }, [rows, q, relationships]);
  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Contacts <Counter value={rows.length} size="sm" />
          </span>
        }
        description="Recruiters, hiring managers, professors, referrals — your personal CRM."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New contact
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, email…" className="pl-9" />
        </div>
        <MultiSelect label="Relationship" value={relationships} onChange={setRelationships} options={RELATIONSHIPS.map((r) => ({ value: r, label: RELATIONSHIP_LABEL[r] }))} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Users} title={rows.length ? "No match" : "No contact yet"} description="Contacts are also created from imported postings and emails." />
      ) : (
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Name</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="text-right">Applications</TableHead>
                <TableHead className="hidden lg:table-cell">Last contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/contacts/${c.id}`)}>
                  <TableCell className="h-16 pl-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-highlight-50 text-xs font-semibold text-highlight-700">{initials(c.fullName)}</span>
                      <div className="min-w-0">
                        <Link href={`/contacts/${c.id}`} className="block truncate text-sm font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.fullName}
                        </Link>
                        {c.role && <span className="block truncate text-xs text-muted-foreground">{c.role}</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.organizationName ?? "—"}</TableCell>
                  <TableCell>{c.relationship ? <Badge size="sm">{RELATIONSHIP_LABEL[c.relationship]}</Badge> : <span className="text-faint">—</span>}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-sm text-highlight-600 hover:underline">
                        <Mail className="size-3" /> {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{c.opportunityCount}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{c.lastContactAt ? formatISODate(c.lastContactAt, "medium", dateLocale) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {creating && <ContactDialog open={creating} onOpenChange={setCreating} initial={{ fullName: "", tags: [] }} />}
    </PageContainer>
  );
}
