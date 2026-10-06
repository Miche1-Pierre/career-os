"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  Bot,
  CalendarCheck,
  CalendarClock,
  FileCheck2,
  Gift,
  Import,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Send,
  StickyNote,
  Trash2,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityCombobox, type ComboOption } from "@/components/app/entity-combobox";
import { Markdown } from "@/components/app/markdown";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { deleteEventAction, logEventAction } from "@/app/actions/opportunities";
import { ACTOR_LABEL, CHANNELS, CHANNEL_LABEL, EVENT_TYPE_LABEL, type Actor, type Channel, type EventType } from "@/lib/constants";
import { formatInstant } from "@/lib/dates";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<EventType, LucideIcon>> = {
  CREATED: Plus,
  IMPORTED: Import,
  STATUS_CHANGED: ArrowRightLeft,
  APPLIED: Send,
  FOLLOW_UP_SENT: Send,
  RESPONSE_RECEIVED: Mail,
  EMAIL: Mail,
  MESSAGE: MessageSquare,
  CALL: Phone,
  MEETING: Users,
  INTERVIEW_SCHEDULED: CalendarClock,
  INTERVIEW_DONE: CalendarCheck,
  OFFER_RECEIVED: Gift,
  REJECTED: XCircle,
  DOCUMENT_ATTACHED: FileCheck2,
  NOTE: StickyNote,
};

const LOGGABLE: EventType[] = ["NOTE", "EMAIL", "MESSAGE", "CALL", "MEETING", "RESPONSE_RECEIVED", "OTHER"];

export function DetailTimeline({ opp, contactOptions }: { opp: OpportunityDetail; contactOptions: ComboOption[] }) {
  const { timezone, dateLocale } = useAppData();
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [type, setType] = useState<EventType>("NOTE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND" | "NONE">("NONE");
  const [channel, setChannel] = useState<Channel | "NONE">("NONE");
  const [occurredAt, setOccurredAt] = useState("");
  const [contact, setContact] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [expanded, setExpanded] = useState(false);

  const submit = () =>
    run(
      () =>
        logEventAction({
          opportunityId: opp.id,
          type,
          title: title || null,
          body: body || null,
          direction: direction === "NONE" ? (type === "RESPONSE_RECEIVED" ? "INBOUND" : null) : direction,
          channel: channel === "NONE" ? null : channel,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
          contactId: contact.id,
        }),
      {
        success: "Added to the timeline",
        onSuccess: () => {
          setTitle("");
          setBody("");
          setOccurredAt("");
          setExpanded(false);
        },
      },
    );

  return (
    <div className="space-y-5">
      <div className="surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={(v) => (setType(v as EventType), setExpanded(true))}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOGGABLE.map((t) => (
                <SelectItem key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => setExpanded(true)} placeholder={type === "NOTE" ? "Add a note…" : "Subject / summary"} className="h-7 flex-1 rounded-[10px]" />
          <Button size="sm" onClick={submit} disabled={pending || (!title.trim() && !body.trim())}>
            Add
          </Button>
        </div>
        {expanded && (
          <div className="mt-2 space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={type === "EMAIL" ? "Paste the email here…" : "Details (Markdown)…"} />
            <div className="grid gap-2 sm:grid-cols-4">
              <Select value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No direction</SelectItem>
                  <SelectItem value="INBOUND">Received</SelectItem>
                  <SelectItem value="OUTBOUND">Sent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Any channel</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="h-7" />
              <EntityCombobox options={contactOptions} value={contact} onChange={setContact} placeholder="Contact (optional)" allowCreate={false} className="h-7" />
            </div>
            <p className="text-xs text-muted-foreground">A received email or call marks the first response and updates the last contact date.</p>
          </div>
        )}
      </div>

      <ol className="relative ml-3 space-y-5 border-l border-border pl-6">
        {opp.events.map((event) => {
          const Icon = ICONS[event.type] ?? StickyNote;
          const removable = ["NOTE", "EMAIL", "MESSAGE", "CALL", "MEETING", "OTHER", "RESPONSE_RECEIVED"].includes(event.type);
          return (
            <li key={event.id} className="group relative">
              <span
                className={cn(
                  "absolute top-0 -left-[38px] flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-[0_1px_1.5px_0_rgba(0,0,0,0.04)]",
                  event.direction === "INBOUND" && "border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
                  event.direction === "OUTBOUND" && "border-transparent bg-highlight-50 text-highlight-600",
                  event.type === "REJECTED" && "border-transparent bg-warning-50 text-warning-500",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-0.5">
                <span className="text-sm font-medium text-foreground">{event.title}</span>
                <span className="text-xs text-faint tabular-nums">{formatInstant(event.occurredAt, { timeZone: timezone, locale: dateLocale })}</span>
                {event.actor !== "USER" && (
                  <span className="inline-flex h-5 items-center gap-1 rounded-lg bg-highlight-50 px-1.5 text-xs font-medium text-highlight-700">
                    {(event.actor === "CLAUDE" || event.actor === "AI") && <Bot className="size-3" />}
                    {ACTOR_LABEL[event.actor as Actor] ?? event.actor}
                  </span>
                )}
                {event.direction && <span className="text-xs text-faint">{event.direction === "INBOUND" ? "received" : "sent"}</span>}
                {removable && (
                  <button
                    type="button"
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Delete entry"
                    onClick={async () => {
                      if (await confirm({ title: "Delete this entry?", destructive: true, confirmLabel: "Delete" })) run(() => deleteEventAction(event.id), { success: "Deleted" });
                    }}
                  >
                    <Trash2 className="size-3.5 text-faint hover:text-warning-500" />
                  </button>
                )}
              </div>
              {event.body && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-separator bg-muted-background px-3.5 py-2.5 dark:border-border">
                  <Markdown>{event.body}</Markdown>
                </div>
              )}
            </li>
          );
        })}
        {!opp.events.length && <li className="text-sm text-muted-foreground">No activity yet.</li>}
      </ol>
    </div>
  );
}
