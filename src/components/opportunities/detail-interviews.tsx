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
import { INTERVIEW_KINDS, INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOMES, INTERVIEW_STATUSES, INTERVIEW_STATUS_LABEL, interviewKindTitle, type InterviewKind, type InterviewOutcome, type InterviewStatus } from "@/lib/constants";
import { formatInstant, instantToZonedParts, zonedTimeToInstant } from "@/lib/dates";
import type { InterviewQuestion } from "@/lib/schemas";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

type InterviewRow = OpportunityDetail["interviews"][number];

const OUTCOME_LABEL: Record<InterviewOutcome, string> = { PENDING: "En attente", PASSED: "Réussi", FAILED: "Non retenu", UNKNOWN: "Inconnu" };
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function DetailInterviews({ opp }: { opp: OpportunityDetail }) {
  const { timezone, dateLocale } = useAppData();
  const [editing, setEditing] = useState<InterviewRow | "new" | null>(null);
  const upcoming = opp.interviews.filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED");
  const past = opp.interviews.filter((i) => i.status === "COMPLETED" || i.status === "CANCELLED");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{opp.interviews.length ? `${opp.interviews.length} entretien${opp.interviews.length > 1 ? "s" : ""}` : "Aucun entretien pour l’instant."}</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Ajouter un entretien
        </Button>
      </div>
      {[...upcoming, ...past].map((iv) => (
        <button key={iv.id} type="button" onClick={() => setEditing(iv)} className="block w-full surface p-4 text-left transition-colors hover:bg-muted-background">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{iv.title || interviewKindTitle(iv.kind)}</span>
                <span className={cn("rounded-lg px-1.5 text-xs font-medium", iv.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : iv.status === "CANCELLED" ? "bg-muted text-muted-foreground line-through" : "bg-info-50 text-info-800")}>
                  {INTERVIEW_STATUS_LABEL[iv.status]}
                </span>
                {iv.status === "COMPLETED" && iv.outcome !== "PENDING" && <span className="text-xs text-muted-foreground">{OUTCOME_LABEL[iv.outcome]}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {iv.scheduledAt ? formatInstant(iv.scheduledAt, { timeZone: timezone, locale: dateLocale, style: "weekday" }) : "Date à planifier"}
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
                  <Video /> Rejoindre
                </a>
              </Button>
            )}
          </div>
          {(iv.preparation || iv.questions.length > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Préparation : {iv.questions.length} question{iv.questions.length > 1 ? "s" : ""}
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
      success: interview ? "Entretien mis à jour" : "Entretien ajouté — tâche de préparation créée",
      onSuccess: onClose,
    });

  const addQuestion = (kindQ: "EXPECTED" | "TO_ASK") => setQuestions((qs) => [...qs, { id: crypto.randomUUID(), kind: kindQ, question: "", answer: null }]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{interview ? "Entretien" : "Nouvel entretien"}</DialogTitle>
          <DialogDescription>
            {opp.title}
            {opp.organization ? ` — ${opp.organization.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={interview?.status === "COMPLETED" ? "debrief" : "details"}>
          <TabsList>
            <TabsTrigger value="details">Détails</TabsTrigger>
            <TabsTrigger value="prep">Préparation</TabsTrigger>
            <TabsTrigger value="debrief">Notes et résultat</TabsTrigger>
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
              <FormField label="Titre (facultatif)">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={interviewKindTitle(kind)} />
              </FormField>
              <FormField label="Date" hint={`Heures exprimées en ${timezone}`}>
                <div className="flex gap-2">
                  <DateInput value={date} onChange={setDate} />
                  <TimeInput value={time} onChange={setTime} className="w-28" />
                </div>
              </FormField>
              <FormField label="Durée (minutes)">
                <NumberInput value={duration} onChange={setDuration} step={15} />
              </FormField>
              <FormField label="Lien de la réunion">
                <Input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" />
              </FormField>
              <FormField label="Lieu">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse du bureau, téléphone…" />
              </FormField>
              <FormField label="Participants" hint="Un par ligne — « Nom (fonction) »" className="sm:col-span-2">
                <Textarea value={participants} onChange={(e) => setParticipants(e.target.value)} rows={2} />
              </FormField>
              <FormField label="Statut">
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
                <Label className="text-xs text-muted-foreground">Questions probables et réponses préparées</Label>
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
                      <Button variant="ghost" size="icon" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== index))} aria-label="Retirer">
                        <Trash2 />
                      </Button>
                    </div>
                    <Textarea value={q.answer ?? ""} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === index ? { ...x, answer: e.target.value } : x)))} rows={2} placeholder="Votre réponse (STAR : situation, tâche, action, résultat)…" />
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Questions à poser</Label>
                <Button size="xs" variant="outline" onClick={() => addQuestion("TO_ASK")}>
                  <Plus /> Question
                </Button>
              </div>
              {questions
                .map((q, index) => ({ q, index }))
                .filter(({ q }) => q.kind === "TO_ASK")
                .map(({ q, index }) => (
                  <div key={q.id} className="flex gap-2">
                    <Input value={q.question} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === index ? { ...x, question: e.target.value } : x)))} placeholder="Que souhaitez-vous savoir ?" />
                    <Button variant="ghost" size="icon" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== index))} aria-label="Retirer">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
            </div>
            <FormField label="Notes de préparation — projets à présenter, notes sur l’entreprise et le recruteur">
              <MarkdownEditor value={preparation} onChange={setPreparation} minRows={8} placeholder={"## Projets à présenter\n\n## À propos de l’entreprise\n\n## À propos du recruteur"} />
            </FormField>
            <p className="text-xs text-muted-foreground">Astuce : demandez à Claude Code « prépare mon {lowerFirst(interviewKindTitle(kind))} chez {opp.organization?.name ?? "…"} » — il remplit cette section via MCP.</p>
          </TabsContent>
          <TabsContent value="debrief" className="space-y-4 pt-3">
            <FormField label="Notes prises pendant l’entretien">
              <MarkdownEditor value={notes} onChange={setNotes} minRows={5} />
            </FormField>
            <FormField label="Retour reçu">
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Résultat">
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
                    <CheckCircle2 /> Marquer comme passé
                  </Button>
                )}
              </div>
            </div>
            {interview?.preparation && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">Préparation (lecture seule)</summary>
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
                if (await confirm({ title: "Supprimer cet entretien ?", destructive: true, confirmLabel: "Supprimer" })) run(() => deleteInterviewAction(interview.id), { success: "Entretien supprimé", onSuccess: onClose });
              }}
            >
              <Trash2 /> Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {interview?.meetingUrl && (
              <Button variant="outline" asChild>
                <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Rejoindre
                </a>
              </Button>
            )}
            <Button onClick={save} disabled={pending}>
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
