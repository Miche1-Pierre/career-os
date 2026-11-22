"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Building2, CalendarClock, ExternalLink, GraduationCap, Link2, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/app/page-header";
import { StageBadge, TagList } from "@/components/app/badges";
import { MarkdownEditor } from "@/components/app/markdown";
import { EmptyState } from "@/components/app/empty-state";
import { OrgAvatar } from "@/components/app/org-avatar";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { archiveOrganizationAction, deleteOrganizationAction, updateOrganizationAction } from "@/app/actions/network";
import { RELATIONSHIP_LABEL, interviewKindTitle } from "@/lib/constants";
import { formatInstant, formatISODate } from "@/lib/dates";
import { initials } from "@/lib/text";
import type { BrandSibling, getOrganization } from "@/server/services/organizations";
import { OrganizationDialog } from "./organization-form";
import { ContactDialog } from "./contact-form";

type OrgDetail = Awaited<ReturnType<typeof getOrganization>>;

export function OrganizationDetailView({ data, brand }: { data: OrgDetail; brand?: { brand: string; siblings: BrandSibling[] } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run, pending } = useAction();
  const { timezone, dateLocale } = useAppData();
  const org = data.organization;
  const institution = org.kind === "INSTITUTION";
  const listHref = institution ? "/institutions" : "/companies";
  const [editing, setEditing] = useState(false);
  const [addContact, setAddContact] = useState(false);
  const [notes, setNotes] = useState(org.notes ?? "");
  const Icon = institution ? GraduationCap : Building2;
  const siblings = brand?.siblings ?? [];
  const facts = [org.industry, org.size, [org.city, org.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

  return (
    <PageContainer wide className="space-y-5">
      <Link href={listHref} className="text-xs text-muted-foreground hover:text-foreground">
        ← {institution ? "Établissements" : "Entreprises"}
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <OrgAvatar name={org.name} orgId={org.id} website={org.website} size="xl" />
          <div className="min-w-0 space-y-1">
            <h1 className="truncate heading-2xl text-foreground" title={org.name}>
              {org.name}
            </h1>
            <p className="truncate text-sm text-muted-foreground" title={facts || undefined}>
              {facts || "Aucun détail pour l’instant"}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {org.website && (
                <a href={org.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="max-w-64 truncate">{org.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
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
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild className="whitespace-nowrap">
            <Link href={`/applications/new?type=${institution ? "FORMATION" : "JOB"}&org=${org.id}`}>
              <Plus /> {institution ? "Nouvelle formation" : "Nouvelle candidature"}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Modifier
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Plus d’actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => run(() => archiveOrganizationAction(org.id, !org.archivedAt), { success: org.archivedAt ? "Désarchivé" : "Archivé" })}>
                {org.archivedAt ? <ArchiveRestore /> : <Archive />} {org.archivedAt ? "Désarchiver" : "Archiver"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Mettre ${org.name} à la corbeille ?`,
                      description: institution
                        ? "Ses formations et ses contacts sont conservés (ils seront détachés si vous le supprimez définitivement)."
                        : "Ses candidatures et ses contacts sont conservés (ils seront détachés si vous la supprimez définitivement).",
                      destructive: true,
                      confirmLabel: "Mettre à la corbeille",
                    })
                  )
                    run(() => deleteOrganizationAction(org.id), { success: "Mis à la corbeille", onSuccess: () => router.push(listHref) });
                }}
              >
                <Trash2 /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {org.description && <p className="max-w-3xl text-sm text-muted-foreground">{org.description}</p>}

      {siblings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-separator bg-muted-background px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
            <MapPin className="size-3.5" />
            {institution ? "Autres campus" : "Autres sites"} {brand?.brand ? `de ${brand.brand}` : ""}
          </span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`${s.kind === "INSTITUTION" ? "/institutions" : "/companies"}/${s.id}`}
              className="inline-flex max-w-64 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-hover"
              title={[s.name, [s.city, s.country].filter(Boolean).join(", ")].filter(Boolean).join(" — ")}
            >
              <OrgAvatar name={s.name} orgId={s.id} website={s.website} size="sm" className="size-4 rounded-[5px] text-[8px]" />
              <span className="truncate">{s.name}</span>
            </Link>
          ))}
        </div>
      )}

      <Tabs defaultValue="opportunities">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="opportunities">
              {institution ? "Formations" : "Candidatures"} ({data.opportunities.length})
            </TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({data.contacts.length})</TabsTrigger>
            <TabsTrigger value="interviews">Entretiens ({data.interviews.length})</TabsTrigger>
            <TabsTrigger value="timeline">Historique</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="opportunities" className="pt-4">
          {data.opportunities.length === 0 ? (
            <EmptyState icon={Icon} title="Rien pour l’instant" description={institution ? `Aucune formation chez ${org.name}.` : `Aucune candidature chez ${org.name}.`} />
          ) : (
            <ul className="surface-list">
              {data.opportunities.map(({ opportunity: o, stage }) => (
                <li key={o.id}>
                  <Link href={`/applications/${o.id}`} className="flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted-background">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={o.title}>
                      {o.title}
                    </span>
                    <StageBadge label={stage.label} category={stage.category} className="shrink-0" />
                    <span className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:inline">
                      {o.appliedAt ? `postulé le ${formatISODate(o.appliedAt, "dayMonth", dateLocale)}` : "pas encore postulé"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="contacts" className="space-y-3 pt-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAddContact(true)}>
              <Plus /> Ajouter un contact
            </Button>
          </div>
          {data.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun contact pour l’instant.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.contacts.map((c) => (
                <Link key={c.id} href={`/contacts/${c.id}`} className="flex min-w-0 items-center gap-3 surface p-3 hover:bg-muted-background">
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
            <p className="text-sm text-muted-foreground">Aucun entretien pour l’instant.</p>
          ) : (
            <ul className="surface-list">
              {data.interviews.map(({ interview: i, opportunityTitle }) => (
                <li key={i.id}>
                  <Link href={`/applications/${i.opportunityId}?tab=interviews`} className="flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted-background">
                    <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {interviewKindTitle(i.kind)} <span className="text-muted-foreground">— {opportunityTitle}</span>
                    </span>
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{i.scheduledAt ? formatInstant(i.scheduledAt, { timeZone: timezone, locale: dateLocale }) : "à planifier"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="timeline" className="pt-4">
          <ol className="space-y-2">
            {data.events.length === 0 && <li className="text-sm text-muted-foreground">Aucune activité.</li>}
            {data.events.map(({ event, opportunityTitle }) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-separator bg-background px-3 py-2 text-sm">
                <span className="min-w-0 font-medium break-words">{event.title}</span>
                {opportunityTitle && <span className="min-w-0 truncate text-xs text-muted-foreground">{opportunityTitle}</span>}
                <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatInstant(event.occurredAt, { timeZone: timezone, locale: dateLocale })}</span>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="notes" className="space-y-2 pt-4">
          <MarkdownEditor value={notes} onChange={setNotes} minRows={14} placeholder={`Ce que vous savez de ${org.name} : culture, personnes rencontrées, questions…`} />
          <div className="flex justify-end">
            <Button size="sm" disabled={notes === (org.notes ?? "") || pending} onClick={() => run(() => updateOrganizationAction(org.id, { notes: notes || null }), { success: "Notes enregistrées" })}>
              Enregistrer les notes
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
