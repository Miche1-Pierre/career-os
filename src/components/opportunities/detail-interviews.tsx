"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Clock, ExternalLink, MapPin, Plus, Trash2, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormField, DateInput, TimeInput, NumberInput } from "@/components/app/fields";
import { MarkdownEditor, Markdown } from "@/components/app/markdown";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { createInterviewAction, deleteInterviewAction, updateInterviewAction } from "@/app/actions/opportunities";
import { INTERVIEW_KINDS, INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOMES, INTERVIEW_STATUSES, INTERVIEW_STATUS_LABEL, type InterviewKind, type InterviewOutcome, type InterviewStatus } from "@/lib/constants";
import { formatInstant, instantToZonedParts, zonedTimeToInstant } from "@/lib/dates";
import type { InterviewQuestion } from "@/lib/schemas";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

type InterviewRow = OpportunityDetail["interviews"][number];

const OUTCOME_LABEL: Record<InterviewOutcome, string> = { PENDING: "Pending", PASSED: "Passed", FAILED: "Not selected", UNKNOWN: "Unknown" };

export function DetailInterviews({ opp }: { opp: OpportunityDetail }) {
  const { timezone, dateLocale } = useAppData();
  const [editing, setEditing] = useState<InterviewRow | "new" | null>(null);
  const upcoming = opp.interviews.filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED");
  const past = opp.interviews.filter((i) => i.status === "COMPLETED" || i.status === "CANCELLED");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{opp.interviews.length ? `${opp.interviews.length} interview${opp.interviews.length > 1 ? "s" : ""}` : "No interview yet."}</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Add interview
        </Button>
      </div>
      {[...upcoming, ...past].map((iv) => (
        <button key={iv.id} type="button" onClick={() => setEditing(iv)} className="block w-full surface p-4 text-left transition-colors hover:bg-muted-background">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{iv.title || `${INTERVIEW_KIND_LABEL[iv.kind]} interview`}</span>
                <span className={cn("rounded-lg px-1.5 text-xs font-medium", iv.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : iv.status === "CANCELLED" ? "bg-muted text-muted-foreground line-through" : "bg-info-50 text-info-800")}>
                  {INTERVIEW_STATUS_LABEL[iv.status]}
                </span>
                {iv.status === "COMPLETED" && iv.outcome !== "PENDING" && <span className="text-xs text-muted-foreground">{OUTCOME_LABEL[iv.outcome]}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {iv.scheduledAt ? formatInstant(iv.scheduledAt, { timeZone: timezone, locale: dateLocale, style: "weekday" }) : "Date to be scheduled"}
                </span>
                {iv.durationMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {iv.durationMinutes} min
                  </span>
                )}
                {iv.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {iv.location}
                  </span>
                )}
                {iv.participants.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    {iv.participants.map((p) => p.name).join(", ")}
                  </span>
                )}
              </div>
            </div>
            {iv.meetingUrl && iv.status === "SCHEDULED" && (
              <Button size="sm" variant="outline" asChild onClick={(e) => e.stopPropagation()}>
                <a href={iv.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Video /> Join
                </a>
              </Button>
            )}
          </div>
          {(iv.preparation || iv.questions.length > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Preparation: {iv.questions.length} question{iv.questions.length === 1 ? "" : "s"}
              {iv.preparation ? " · notes" : ""}
            </p>
          )}
        </button>
      ))}
      {editing && <InterviewDialog opp={opp} interview={editing === "new" ? null : editing} onClose={() => setEditing(null)} timezone={timezone} />}
    </div>
  );
}

function InterviewDialog({ opp, interview, onClose, timezone }: { opp: OpportunityDetail; interview: InterviewRow | null; onClose: () => void; timezone: string }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const parts = interview?.scheduledAt ? instantToZonedParts(new Date(interview.scheduledAt), timezone) : null;
  const [kind, setKind] = useState<InterviewKind>(interview?.kind ?? "HR");
  const [title, setTitle] = useState(interview?.title ?? "");
  const [date, setDate] = useState<string | null>(parts?.date ?? null);
  const [time, setTime] = useState<string | null>(parts?.time ?? "10:00");
  const [duration, setDuration] = useState<number | null>(interview?.durationMinutes ?? 45);
  const [location, setLocation] = useState(interview?.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(interview?.meetingUrl ?? "");
  const [participants, setParticipants] = useState(interview?.participants.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join("\n") ?? "");
  const [status, setStatus] = useState<InterviewStatus>(interview?.status ?? "SCHEDULED");
  const [outcome, setOutcome] = useState<InterviewOutcome>(interview?.outcome ?? "PENDING");
  const [preparation, setPreparation] = useState(interview?.preparation ?? "");
  const [questions, setQuestions] = useState<InterviewQuestion[]>(interview?.questions ?? []);
  const [notes, setNotes] = useState(interview?.notes ?? "");
  const [feedback, setFeedback] = useState(interview?.feedback ?? "");

  const payload = () => ({
    kind,
    title: title || null,
    scheduledAt: date ? zonedTimeToInstant(date, time ?? "09:00", timezone).toISOString() : null,
    durationMinutes: duration,
    location: location || null,
    meetingUrl: meetingUrl || null,
    participants: participants
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = /^(.*?)\s*\((.*)\)$/.exec(l);
        return m ? { name: m[1], role: m[2] } : { name: l };
      }),
    status: date && status === "TO_SCHEDULE" ? "SCHEDULED" : !date && status === "SCHEDULED" ? "TO_SCHEDULE" : status,
    outcome,
    preparation: preparation || null,
    questions: questions.filter((q) => q.question.trim()),
    notes: notes || null,
    feedback: feedback || null,
  });

  const save = () =>
    run(() => (interview ? updateInterviewAction(interview.id, payload()) : createInterviewAction({ opportunityId: opp.id, ...payload() })), {
      success: interview ? "Interview updated" : "Interview added — preparation task created",
      onSuccess: onClose,
    });

  const addQuestion = (kindQ: "EXPECTED" | "TO_ASK") => setQuestions((qs) => [...qs, { id: crypto.randomUUID(), kind: kindQ, question: "", answer: null }]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{interview ? "Interview" : "New interview"}</DialogTitle>
          <DialogDescription>
            {opp.title}
            {opp.organization ? ` — ${opp.organization.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={interview?.status === "COMPLETED" ? "debrief" : "details"}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="prep">Preparation</TabsTrigger>
            <TabsTrigger value="debrief">Notes & outcome</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Type">
                <Select value={kind} onValueChange={(v) => setKind(v as InterviewKind)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {INTERVIEW_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Title (optional)">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${INTERVIEW_KIND_LABEL[kind]} interview`} />
              </FormField>
              <FormField label="Date" hint={`Times are in ${timezone}`}>
                <div className="flex gap-2">
                  <DateInput value={date} onChange={setDate} />
                  <TimeInput value={time} onChange={setTime} className="w-28" />
                </div>
              </FormField>
              <FormField label="Duration (minutes)">
                <NumberInput value={duration} onChange={setDuration} step={15} />
              </FormField>
              <FormField label="Meeting link">
                <Input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" />
              </FormField>
              <FormField label="Location">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office address, phone…" />
              </FormField>
              <FormField label="Participants" hint="One per line — “Name (role)”" className="sm:col-span-2">
                <Textarea value={participants} onChange={(e) => setParticipants(e.target.value)} rows={2} />
              </FormField>
              <FormField label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as InterviewStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {INTERVIEW_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </TabsContent>
          <TabsContent value="prep" className="space-y-4 pt-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Likely questions & prepared answers</Label>
                <Button size="xs" variant="outline" onClick={() => addQuestion("EXPECTED")}>
                  <Plus /> Question
                </Button>
              </div>
              {questions
                .map((q, index) => ({ q, index }))
                .filter(({ q }) => q.kind === "EXPECTED")
                .map(({ q, index }) => (
                  <div key={q.id} className="space-y-1.5 rounded-lg border p-2">
                    <div className="flex gap-2">
                      <Input value={q.question} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === index ? { ...x, question: e.target.value } : x)))} placeholder="Question" />
                      <Button variant="ghost" size="icon" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== index))} aria-label="Remove">
                        <Trash2 />
                      </Button>
                    </div>
                    <Textarea value={q.answer ?? ""} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === index ? { ...x, answer: e.target.value } : x)))} rows={2} placeholder="Your answer (STAR: situation, task, action, result)…" />
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Questions to ask</Label>
                <Button size="xs" variant="outline" onClick={() => addQuestion("TO_ASK")}>
                  <Plus /> Question
                </Button>
              </div>
              {questions
                .map((q, index) => ({ q, index }))
                .filter(({ q }) => q.kind === "TO_ASK")
                .map(({ q, index }) => (
                  <div key={q.id} className="flex gap-2">
                    <Input value={q.question} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === index ? { ...x, question: e.target.value } : x)))} placeholder="What would you like to know?" />
                    <Button variant="ghost" size="icon" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== index))} aria-label="Remove">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
            </div>
            <FormField label="Preparation notes — projects to present, company & interviewer notes">
              <MarkdownEditor value={preparation} onChange={setPreparation} minRows={8} placeholder={"## Projects to present\n\n## About the company\n\n## About the interviewer"} />
            </FormField>
            <p className="text-xs text-muted-foreground">Tip: ask Claude Code “prépare mon entretien {INTERVIEW_KIND_LABEL[kind].toLowerCase()} chez {opp.organization?.name ?? "…"}” — it fills this section through MCP.</p>
          </TabsContent>
          <TabsContent value="debrief" className="space-y-4 pt-3">
            <FormField label="Notes taken during the interview">
              <MarkdownEditor value={notes} onChange={setNotes} minRows={5} />
            </FormField>
            <FormField label="Feedback received">
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Outcome">
                <Select value={outcome} onValueChange={(v) => setOutcome(v as InterviewOutcome)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {OUTCOME_LABEL[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <div className="flex items-end">
                {status !== "COMPLETED" && (
                  <Button variant="outline" className="w-full" onClick={() => setStatus("COMPLETED")}>
                    <CheckCircle2 /> Mark as done
                  </Button>
                )}
              </div>
            </div>
            {interview?.preparation && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">Preparation (read-only)</summary>
                <Markdown className="mt-2">{interview.preparation}</Markdown>
              </details>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter className="sm:justify-between">
          {interview ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (await confirm({ title: "Delete this interview?", destructive: true, confirmLabel: "Delete" })) run(() => deleteInterviewAction(interview.id), { success: "Interview deleted", onSuccess: onClose });
              }}
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {interview?.meetingUrl && (
              <Button variant="outline" asChild>
                <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Join
                </a>
              </Button>
            )}
            <Button onClick={save} disabled={pending}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
