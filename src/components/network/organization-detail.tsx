"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Building2, CalendarClock, ExternalLink, GraduationCap, Link2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/app/page-header";
import { StageBadge, TagList } from "@/components/app/badges";
import { MarkdownEditor } from "@/components/app/markdown";
import { EmptyState } from "@/components/app/empty-state";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { archiveOrganizationAction, deleteOrganizationAction, updateOrganizationAction } from "@/app/actions/network";
import { INTERVIEW_KIND_LABEL, RELATIONSHIP_LABEL } from "@/lib/constants";
import { formatInstant, formatISODate } from "@/lib/dates";
import { initials } from "@/lib/text";
import type { getOrganization } from "@/server/services/organizations";
import { OrganizationDialog } from "./organization-form";
import { ContactDialog } from "./contact-form";

type OrgDetail = Awaited<ReturnType<typeof getOrganization>>;

export function OrganizationDetailView({ data }: { data: OrgDetail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run, pending } = useAction();
  const { timezone, dateLocale } = useAppData();
  const org = data.organization;
  const institution = org.kind === "INSTITUTION";
  const [editing, setEditing] = useState(false);
  const [addContact, setAddContact] = useState(false);
  const [notes, setNotes] = useState(org.notes ?? "");
  const Icon = institution ? GraduationCap : Building2;

  return (
    <PageContainer wide className="space-y-5">
      <Link href={institution ? "/institutions" : "/companies"} className="text-xs text-muted-foreground hover:text-foreground">
        ← {institution ? "Institutions" : "Companies"}
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Icon className="size-6 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <h1 className="heading-2xl text-foreground">{org.name}</h1>
            <p className="text-sm text-muted-foreground">{[org.industry, org.size, [org.city, org.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No details yet"}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {org.website && (
                <a href={org.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="size-3.5" /> {org.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              )}
              {org.linkedinUrl && (
                <a href={org.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Link2 className="size-3.5" /> LinkedIn
                </a>
              )}
              <TagList tags={org.tags} max={8} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/applications/new?type=${institution ? "FORMATION" : "JOB"}&org=${org.id}`}>
              <Plus /> {institution ? "New program" : "New application"}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => run(() => archiveOrganizationAction(org.id, !org.archivedAt), { success: org.archivedAt ? "Unarchived" : "Archived" })}>
                {org.archivedAt ? <ArchiveRestore /> : <Archive />} {org.archivedAt ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: `Move ${org.name} to trash?`, description: "Its applications and contacts are kept (unlinked if you purge it later).", destructive: true, confirmLabel: "Move to trash" }))
                    run(() => deleteOrganizationAction(org.id), { success: "Moved to trash", onSuccess: () => router.push(institution ? "/institutions" : "/companies") });
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {org.description && <p className="max-w-3xl text-sm text-muted-foreground">{org.description}</p>}

      <Tabs defaultValue="opportunities">
        <TabsList variant="line">
          <TabsTrigger value="opportunities">{institution ? "Programs" : "Applications"} ({data.opportunities.length})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({data.contacts.length})</TabsTrigger>
          <TabsTrigger value="interviews">Interviews ({data.interviews.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="opportunities" className="pt-4">
          {data.opportunities.length === 0 ? (
            <EmptyState icon={Icon} title="Nothing yet" description={`No ${institution ? "program" : "application"} at ${org.name}.`} />
          ) : (
            <ul className="surface-list">
              {data.opportunities.map(({ opportunity: o, stage }) => (
                <li key={o.id}>
                  <Link href={`/applications/${o.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-muted-background">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.title}</span>
                    <StageBadge label={stage.label} category={stage.category} />
                    <span className="text-xs text-muted-foreground tabular-nums">{o.appliedAt ? `applied ${formatISODate(o.appliedAt, "dayMonth", dateLocale)}` : "not applied"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="contacts" className="space-y-3 pt-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAddContact(true)}>
              <Plus /> Add contact
            </Button>
          </div>
          {data.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contact yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.contacts.map((c) => (
                <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center gap-3 surface p-3 hover:bg-muted-background">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{initials(c.fullName)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.role ?? (c.relationship ? RELATIONSHIP_LABEL[c.relationship] : c.email)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="interviews" className="pt-4">
          {data.interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interview yet.</p>
          ) : (
            <ul className="surface-list">
              {data.interviews.map(({ interview: i, opportunityTitle }) => (
                <li key={i.id}>
                  <Link href={`/applications/${i.opportunityId}?tab=interviews`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-muted-background">
                    <CalendarClock className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">
                      {INTERVIEW_KIND_LABEL[i.kind]} interview <span className="text-muted-foreground">— {opportunityTitle}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{i.scheduledAt ? formatInstant(i.scheduledAt, { timeZone: timezone, locale: dateLocale }) : "to schedule"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="timeline" className="pt-4">
          <ol className="space-y-2">
            {data.events.length === 0 && <li className="text-sm text-muted-foreground">No activity.</li>}
            {data.events.map(({ event, opportunityTitle }) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-separator bg-background px-3 py-2 text-sm">
                <span className="font-medium">{event.title}</span>
                {opportunityTitle && <span className="text-xs text-muted-foreground">{opportunityTitle}</span>}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatInstant(event.occurredAt, { timeZone: timezone, locale: dateLocale })}</span>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="notes" className="space-y-2 pt-4">
          <MarkdownEditor value={notes} onChange={setNotes} minRows={14} placeholder={`What you know about ${org.name}: culture, people met, questions…`} />
          <div className="flex justify-end">
            <Button size="sm" disabled={notes === (org.notes ?? "") || pending} onClick={() => run(() => updateOrganizationAction(org.id, { notes: notes || null }), { success: "Notes saved" })}>
              Save notes
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      {editing && (
        <OrganizationDialog
          open={editing}
          onOpenChange={setEditing}
          initial={{ id: org.id, kind: org.kind, name: org.name, website: org.website, linkedinUrl: org.linkedinUrl, industry: org.industry, size: org.size, city: org.city, country: org.country, description: org.description, tags: org.tags }}
        />
      )}
      {addContact && <ContactDialog open={addContact} onOpenChange={setAddContact} initial={{ fullName: "", organizationId: org.id, organizationName: org.name, tags: [] }} />}
    </PageContainer>
  );
}
