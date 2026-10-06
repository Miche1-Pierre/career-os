"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Link2, Mail, MessageSquarePlus, Pencil, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/app/page-header";
import { StageBadge, TagList } from "@/components/app/badges";
import { Markdown } from "@/components/app/markdown";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { deleteContactAction } from "@/app/actions/network";
import { logEventAction } from "@/app/actions/opportunities";
import { EVENT_TYPE_LABEL, RELATIONSHIP_LABEL, type EventType } from "@/lib/constants";
import { formatInstant, formatISODate } from "@/lib/dates";
import { initials } from "@/lib/text";
import type { getContact } from "@/server/services/contacts";
import { ContactDialog } from "./contact-form";

type ContactDetail = Awaited<ReturnType<typeof getContact>>;

export function ContactDetailView({ data }: { data: ContactDetail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run, pending } = useAction();
  const { timezone, dateLocale } = useAppData();
  const c = data.contact;
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<EventType>("EMAIL");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("OUTBOUND");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [opportunityId, setOpportunityId] = useState<string>(data.opportunities[0]?.opportunity.id ?? "none");

  const log = () =>
    run(
      () =>
        logEventAction({
          contactId: c.id,
          opportunityId: opportunityId === "none" ? null : opportunityId,
          organizationId: c.organizationId,
          type,
          direction: type === "NOTE" ? null : direction,
          title: title || null,
          body: body || null,
        }),
      {
        success: "Logged",
        onSuccess: () => {
          setTitle("");
          setBody("");
        },
      },
    );

  return (
    <PageContainer className="max-w-5xl space-y-5">
      <Link href="/contacts" className="text-xs text-muted-foreground hover:text-foreground">
        ← Contacts
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-highlight-50 text-base font-semibold text-highlight-700">{initials(c.fullName)}</span>
          <div className="space-y-1">
            <h1 className="heading-2xl text-foreground">{c.fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {[c.role, c.relationship ? RELATIONSHIP_LABEL[c.relationship] : null].filter(Boolean).join(" · ")}
              {c.organization && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/${c.organization.kind === "INSTITUTION" ? "institutions" : "companies"}/${c.organization.id}`} className="inline-flex items-center gap-1 hover:underline">
                    <Building2 className="size-3.5" /> {c.organization.name}
                  </Link>
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {c.email && (
                <Button size="xs" variant="outline" asChild>
                  <a href={`mailto:${c.email}`}>
                    <Mail /> {c.email}
                  </a>
                </Button>
              )}
              {c.phone && (
                <Button size="xs" variant="outline" asChild>
                  <a href={`tel:${c.phone}`}>
                    <Phone /> {c.phone}
                  </a>
                </Button>
              )}
              {c.linkedinUrl && (
                <Button size="xs" variant="outline" asChild>
                  <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">
                    <Link2 /> LinkedIn
                  </a>
                </Button>
              )}
              <TagList tags={c.tags} max={6} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete"
            onClick={async () => {
              if (await confirm({ title: `Move ${c.fullName} to trash?`, destructive: true, confirmLabel: "Move to trash" })) run(() => deleteContactAction(c.id), { success: "Moved to trash", onSuccess: () => router.push("/contacts") });
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="space-y-2 surface p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MessageSquarePlus className="size-4" /> Log an interaction
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Select value={type} onValueChange={(v) => setType(v as EventType)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["EMAIL", "MESSAGE", "CALL", "MEETING", "NOTE"] as EventType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {EVENT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={direction} onValueChange={(v) => setDirection(v as "INBOUND" | "OUTBOUND")} disabled={type === "NOTE"}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTBOUND">I contacted them</SelectItem>
                  <SelectItem value="INBOUND">They contacted me</SelectItem>
                </SelectContent>
              </Select>
              <Select value={opportunityId} onValueChange={setOpportunityId}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No application</SelectItem>
                  {data.opportunities.map(({ opportunity: o }) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summary" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Details, pasted message…" />
            <div className="flex justify-end">
              <Button size="sm" onClick={log} disabled={pending || (!title.trim() && !body.trim())}>
                Log
              </Button>
            </div>
          </div>
          <ol className="space-y-2">
            {data.events.length === 0 && <li className="text-sm text-muted-foreground">No interaction logged yet.</li>}
            {data.events.map(({ event, opportunityTitle }) => (
              <li key={event.id} className="rounded-xl border border-separator bg-background px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{event.title}</span>
                  {event.direction && <span className="text-xs text-muted-foreground">{event.direction === "INBOUND" ? "received" : "sent"}</span>}
                  {opportunityTitle && <span className="text-xs text-muted-foreground">· {opportunityTitle}</span>}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatInstant(event.occurredAt, { timeZone: timezone, locale: dateLocale })}</span>
                </div>
                {event.body && <Markdown className="mt-1 text-[13px] text-muted-foreground">{event.body}</Markdown>}
              </li>
            ))}
          </ol>
        </div>
        <aside className="space-y-4">
          <div className="surface p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Applications</p>
            {data.opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not linked to any application.</p>
            ) : (
              <ul className="space-y-2">
                {data.opportunities.map(({ opportunity: o, stage, role, organizationName }) => (
                  <li key={o.id}>
                    <Link href={`/applications/${o.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-primary-100">
                      <span className="block truncate text-sm font-medium">{o.title}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {organizationName}
                        {role ? ` · ${role}` : ""}
                        <StageBadge label={stage.label} category={stage.category} className="h-4 text-[10px]" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {c.notes && (
            <div className="surface p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Notes</p>
              <Markdown>{c.notes}</Markdown>
            </div>
          )}
          {c.lastContactAt && <p className="text-xs text-muted-foreground">Last contact: {formatISODate(c.lastContactAt, "long", dateLocale)}</p>}
        </aside>
      </div>
      {editing && (
        <ContactDialog
          open={editing}
          onOpenChange={setEditing}
          initial={{ id: c.id, fullName: c.fullName, organizationId: c.organizationId, organizationName: c.organization?.name ?? null, role: c.role, email: c.email, phone: c.phone, linkedinUrl: c.linkedinUrl, relationship: c.relationship, notes: c.notes, tags: c.tags }}
        />
      )}
    </PageContainer>
  );
}
