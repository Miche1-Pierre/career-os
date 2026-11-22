"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  FileText,
  GraduationCap,
  Loader2,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageContainer } from "@/components/app/page-header";
import { EntityCombobox, type ComboOption } from "@/components/app/entity-combobox";
import { DateInput, FormField, TimeInput } from "@/components/app/fields";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { analyzeInboxAction, applyInboxActionsAction, archiveInboxAction, convertInboxToContactAction, convertInboxToNoteAction, deleteInboxAction } from "@/app/actions/inbox";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { InboxKindBadge, InboxStatusBadge } from "./inbox-bits";
import { INBOX_KIND_LABEL, INTERVIEW_KINDS, INTERVIEW_KIND_LABEL, STAGE_CATEGORY_META, type InboxKind, type InterviewKind, type OpportunityType } from "@/lib/constants";
import { coerceISODate, formatRelativeInstant, instantToZonedParts } from "@/lib/dates";
import { emptyOpportunityInput } from "@/lib/opportunity-input";
import type { OpportunityDraft } from "@/lib/capture-mapping";
import type { StoredCaptureResult } from "@/lib/capture-schema";
import type { InboxItem } from "@/server/db/schema";
import { cn } from "@/lib/utils";

const CAPTURE_SOURCE_LABEL: Record<string, string> = { PASTE: "collage", URL: "URL", FILE: "fichier", MCP: "MCP", EXTENSION: "extension", EMAIL: "e-mail", API: "API" };
const CONFIDENCE_LABEL: Record<string, string> = { HIGH: "élevée", MEDIUM: "moyenne", LOW: "faible" };

interface Props {
  item: InboxItem;
  result: StoredCaptureResult | null;
  draft: OpportunityDraft | null;
  organizations: ComboOption[];
  opportunities: ComboOption[];
}

export function CaptureReview({ item, result, draft, organizations, opportunities }: Props) {
  const router = useRouter();
  const { ai } = useAppData();
  const confirm = useConfirm();
  const { run, pending } = useAction();
  const [manual, setManual] = useState<OpportunityType | null>(null);
  const [forceOpportunity, setForceOpportunity] = useState(false);
  const busy = item.status === "QUEUED" || item.status === "PROCESSING";

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [busy, router]);

  const showOpportunityForm = (result?.opportunity && (result.kind === "JOB_POSTING" || result.kind === "PROGRAM" || forceOpportunity)) || manual;
  const manualDraft = manual
    ? { ...emptyOpportunityInput(manual), title: item.title ?? "", description: item.rawText, url: item.sourceUrl, captureId: item.id }
    : null;

  return (
    <PageContainer wide className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href="/inbox" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> À trier
          </Link>
          <h1 className="truncate heading-2xl text-foreground">{item.title || "Capture sans titre"}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <InboxKindBadge kind={item.kind} />
            <InboxStatusBadge status={item.status} />
            <span>
              Capturé {formatRelativeInstant(item.createdAt)} via {CAPTURE_SOURCE_LABEL[item.sourceType] ?? item.sourceType.toLowerCase()}
              {item.fileName ? ` · ${item.fileName}` : ""}
            </span>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="max-w-80 truncate text-primary hover:underline">
                {item.sourceUrl}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {ai.available && !busy && item.status !== "CONVERTED" && (
            <Button variant="outline" size="sm" onClick={() => run(() => analyzeInboxAction(item.id), { success: "Analyse lancée" })} disabled={pending}>
              <RefreshCw /> {result ? "Réanalyser" : "Analyser"}
            </Button>
          )}
          {item.status !== "ARCHIVED" && (
            <Button variant="outline" size="sm" onClick={() => run(() => archiveInboxAction(item.id), { success: "Archivé", onSuccess: () => router.push("/inbox") })}>
              <Archive /> Archiver
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Supprimer"
            onClick={async () => {
              if (await confirm({ title: "Supprimer cette capture ?", description: "Le texte brut est supprimé définitivement.", destructive: true, confirmLabel: "Supprimer" })) run(() => deleteInboxAction(item.id), { success: "Supprimé", onSuccess: () => router.push("/inbox") });
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          {busy && (
            <div className="flex items-center gap-3 rounded-xl border border-transparent bg-highlight-50 p-4 text-sm">
              <Loader2 className="size-5 animate-spin text-highlight-500" />
              <div>
                <p className="font-medium">Claude analyse cette capture…</p>
                <p className="text-xs text-muted-foreground">En général 15 à 60 secondes. Vous pouvez quitter la page : « À trier » l’affichera comme « Prêt à vérifier » une fois terminé.</p>
              </div>
            </div>
          )}
          {item.status === "FAILED" && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Échec de l’analyse</AlertTitle>
              <AlertDescription>{item.error}</AlertDescription>
            </Alert>
          )}
          {item.status === "CONVERTED" && (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Déjà traité</AlertTitle>
              <AlertDescription>
                {item.convertedType === "opportunity" && item.convertedId ? (
                  <Link href={`/applications/${item.convertedId}`} className="text-primary underline underline-offset-2">
                    Ouvrir l’opportunité
                  </Link>
                ) : item.convertedType === "contact" && item.convertedId ? (
                  <Link href={`/contacts/${item.convertedId}`} className="text-primary underline underline-offset-2">
                    Ouvrir le contact
                  </Link>
                ) : (
                  "Cette capture a été convertie."
                )}
              </AlertDescription>
            </Alert>
          )}

          {result && item.status !== "CONVERTED" && <AnalysisSummary result={result} meta={item.resultMeta} />}

          {showOpportunityForm && item.status !== "CONVERTED" ? (
            <OpportunityForm
              mode="review"
              captureId={item.id}
              initial={manualDraft ?? draft!.input}
              provenance={manual ? {} : draft!.provenance}
              detectedContacts={manual ? [] : draft!.contacts}
              questionsToClarify={manual ? [] : draft!.questionsToClarify}
              warnings={manual ? [] : result?.warnings ?? []}
              organizations={organizations}
              onCancelHref="/inbox"
            />
          ) : result && item.status === "READY" && (result.kind === "EMAIL" || result.kind === "MESSAGE") && result.communication ? (
            <CommunicationReview item={item} result={result} opportunities={opportunities} onCreateOpportunity={result.opportunity ? () => setForceOpportunity(true) : undefined} />
          ) : result && item.status === "READY" && result.kind === "NOTE" && result.note ? (
            <NoteReview item={item} result={result} opportunities={opportunities} />
          ) : (
            item.status !== "CONVERTED" &&
            !busy && <ManualConversion item={item} opportunities={opportunities} onManual={setManual} aiAvailable={ai.available} />
          )}
        </div>
        <RawCapture item={item} />
      </div>
    </PageContainer>
  );
}

function AnalysisSummary({ result, meta }: { result: StoredCaptureResult; meta: InboxItem["resultMeta"] }) {
  const unverified = result.fieldSources.filter((f) => !f.verified);
  return (
    <div className="surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-highlight-500" /> Détecté : {(INBOX_KIND_LABEL[result.kind as InboxKind] ?? result.kind.replace("_", " ")).toLowerCase()}
          <span className="text-xs font-normal text-muted-foreground">(confiance {CONFIDENCE_LABEL[result.kindConfidence] ?? result.kindConfidence.toLowerCase()})</span>
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Bot className="size-3" />
          {meta?.by === "CLAUDE" ? "Claude Code (MCP)" : meta?.provider ?? "IA"}
          {meta?.model ? ` · ${meta.model}` : ""} · {result.version}
          {meta?.durationMs ? ` · ${Math.round(meta.durationMs / 1000)} s` : ""}
        </p>
      </div>
      {result.summary && <p className="mt-2 text-sm text-muted-foreground">{result.summary}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {result.fieldSources.length} champ(s) rattaché(s) à la source · {unverified.length ? <span className="text-info-800">{unverified.length} non vérifiable(s) (marqué(s) comme déduit(s))</span> : "toutes les citations vérifiées"}. Rien n’est créé avant votre confirmation.
      </p>
    </div>
  );
}

function RawCapture({ item }: { item: InboxItem }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className="h-fit surface xl:sticky xl:top-16">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" /> Capture d’origine
        </span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {item.rawText.length.toLocaleString()} caractères
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="border-t">
          {(item.extras?.jsonLd?.length || item.extras?.warnings?.length) && (
            <div className="space-y-1 border-b border-separator px-4 py-2 text-xs">
              {item.extras?.jsonLd?.length ? <p className="text-emerald-700 dark:text-emerald-300">Données structurées (JSON-LD) trouvées dans la page — utilisées comme faits fiables.</p> : null}
              {item.extras?.warnings?.map((w) => (
                <p key={w} className="text-info-800">
                  {w}
                </p>
              ))}
            </div>
          )}
          <pre className="max-h-[70vh] overflow-y-auto px-4 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{item.rawText}</pre>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Emails & messages → proposed actions
// ---------------------------------------------------------------------------

function ActionRow({ checked, onChange, title, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: React.ReactNode; children?: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", checked && !disabled ? "border-primary/40 bg-primary/5" : "", disabled && "opacity-50")}>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox checked={checked && !disabled} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />
        {title}
      </label>
      {checked && !disabled && children && <div className="mt-3 pl-6">{children}</div>}
    </div>
  );
}

function CommunicationReview({ item, result, opportunities, onCreateOpportunity }: { item: InboxItem; result: StoredCaptureResult; opportunities: ComboOption[]; onCreateOpportunity?: () => void }) {
  const router = useRouter();
  const { stages, timezone } = useAppData();
  const { run, pending } = useAction();
  const c = result.communication!;
  const [target, setTarget] = useState<{ id: string | null; name: string | null }>({ id: c.matchedOpportunityId, name: opportunities.find((o) => o.id === c.matchedOpportunityId)?.label ?? null });
  const sentAt = c.sentAt ? new Date(c.sentAt) : null;
  const [log, setLog] = useState({ enabled: true, title: c.subject ?? result.title ?? "Message", date: sentAt && !Number.isNaN(sentAt.getTime()) ? instantToZonedParts(sentAt, timezone).date : coerceISODate(c.sentAt) });
  const [contact, setContact] = useState({ enabled: !!(c.senderName || c.senderEmail), fullName: c.senderName ?? "", email: c.senderEmail ?? "", role: c.senderRole ?? "" });
  const [status, setStatus] = useState({ enabled: !!c.suggestedStatus, key: c.suggestedStatus ?? "" });
  const [interview, setInterview] = useState({
    enabled: !!c.interview,
    kind: (c.interview?.kind ?? "HR") as InterviewKind,
    date: c.interview?.date ?? null,
    time: c.interview?.time ?? null,
    duration: c.interview?.durationMinutes ?? null,
    meetingUrl: c.interview?.meetingUrl ?? "",
    location: c.interview?.location ?? "",
  });
  const [task, setTask] = useState({ enabled: !!(c.nextAction || c.deadline), title: c.deadline?.description || c.nextAction || "", dueDate: c.deadline?.date ?? null });
  const hasTarget = !!target.id;
  const allStageKeys = [...new Set(stages.map((s) => s.key))];

  const apply = () => {
    const actions: Record<string, unknown>[] = [];
    if (contact.enabled && (contact.fullName || contact.email)) actions.push({ type: "UPSERT_CONTACT", opportunityId: target.id, ref: { fullName: contact.fullName || null, email: contact.email || null, role: contact.role || null, opportunityRole: contact.role || null, relationship: "RECRUITER" } });
    if (log.enabled)
      actions.push({
        type: "LOG_EVENT",
        opportunityId: target.id,
        contactRef: contact.enabled && (contact.fullName || contact.email) ? { fullName: contact.fullName || null, email: contact.email || null } : null,
        eventType: c.channel === "EMAIL" ? "EMAIL" : "MESSAGE",
        title: log.title,
        body: item.rawText,
        occurredAt: log.date,
        direction: c.direction ?? "INBOUND",
        channel: c.channel === "LINKEDIN" ? "LINKEDIN" : c.channel === "PHONE" ? "PHONE" : c.channel === "EMAIL" ? "EMAIL" : null,
      });
    if (hasTarget && status.enabled && status.key) actions.push({ type: "SET_STATUS", opportunityId: target.id, status: status.key, date: log.date });
    if (hasTarget && interview.enabled)
      actions.push({ type: "ADD_INTERVIEW", opportunityId: target.id, kind: interview.kind, date: interview.date, time: interview.time, timezone: c.interview?.timezone ?? null, durationMinutes: interview.duration, meetingUrl: interview.meetingUrl || null, location: interview.location || null, participants: c.interview?.participants ?? [] });
    if (task.enabled && task.title) actions.push({ type: "ADD_TASK", opportunityId: target.id, title: task.title, dueDate: task.dueDate });
    run(() => applyInboxActionsAction(item.id, actions), {
      success: (outcomes) => `${outcomes.filter((o) => o.ok).length}/${outcomes.length} action(s) appliquée(s)`,
      onSuccess: (outcomes) => {
        const failed = outcomes.filter((o) => !o.ok);
        if (!failed.length) router.push(target.id ? `/applications/${target.id}?tab=timeline` : "/inbox");
      },
    });
  };

  return (
    <div className="space-y-3 surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-sm text-foreground">Actions proposées</h2>
        {onCreateOpportunity && (
          <Button size="sm" variant="outline" onClick={onCreateOpportunity}>
            <Briefcase /> C’est une nouvelle opportunité — la créer
          </Button>
        )}
      </div>
      {c.summary && <p className="text-sm text-muted-foreground">{c.summary}</p>}
      <FormField label="Candidature concernée" hint={c.matchedOpportunityId ? "Associée automatiquement — à modifier si besoin." : "Aucune correspondance — en choisir une, ou n’appliquer que le contact / l’historique."}>
        <EntityCombobox options={opportunities} value={target} onChange={setTarget} placeholder="Choisir la candidature" allowCreate={false} />
      </FormField>
      <ActionRow checked={log.enabled} onChange={(v) => setLog((s) => ({ ...s, enabled: v }))} title={`Ajouter ${c.channel === "EMAIL" ? "l’e-mail" : "le message"} à l’historique`}>
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <Input value={log.title} onChange={(e) => setLog((s) => ({ ...s, title: e.target.value }))} />
          <DateInput value={log.date} onChange={(v) => setLog((s) => ({ ...s, date: v }))} />
        </div>
      </ActionRow>
      <ActionRow checked={contact.enabled} onChange={(v) => setContact((s) => ({ ...s, enabled: v }))} title={<span className="flex items-center gap-1.5"><UserPlus className="size-4" /> Enregistrer l’expéditeur comme contact</span>}>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={contact.fullName} onChange={(e) => setContact((s) => ({ ...s, fullName: e.target.value }))} placeholder="Nom" />
          <Input value={contact.email} onChange={(e) => setContact((s) => ({ ...s, email: e.target.value }))} placeholder="E-mail" />
          <Input value={contact.role} onChange={(e) => setContact((s) => ({ ...s, role: e.target.value }))} placeholder="Fonction" />
        </div>
      </ActionRow>
      <ActionRow checked={status.enabled} onChange={(v) => setStatus((s) => ({ ...s, enabled: v }))} disabled={!hasTarget} title="Changer le statut">
        <Select value={status.key || undefined} onValueChange={(v) => setStatus((s) => ({ ...s, key: v }))}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Nouveau statut" />
          </SelectTrigger>
          <SelectContent>
            {allStageKeys.map((key) => {
              const st = stages.find((s) => s.key === key)!;
              return (
                <SelectItem key={key} value={key}>
                  <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[st.category].dot)} />
                  {st.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </ActionRow>
      <ActionRow checked={interview.enabled} onChange={(v) => setInterview((s) => ({ ...s, enabled: v }))} disabled={!hasTarget} title="Créer l’entretien">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={interview.kind} onValueChange={(v) => setInterview((s) => ({ ...s, kind: v as InterviewKind }))}>
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
          <div className="flex gap-2">
            <DateInput value={interview.date} onChange={(v) => setInterview((s) => ({ ...s, date: v }))} />
            <TimeInput value={interview.time} onChange={(v) => setInterview((s) => ({ ...s, time: v }))} className="w-28" />
          </div>
          <Input value={interview.meetingUrl} onChange={(e) => setInterview((s) => ({ ...s, meetingUrl: e.target.value }))} placeholder="Lien de la réunion" />
          <Input value={interview.location} onChange={(e) => setInterview((s) => ({ ...s, location: e.target.value }))} placeholder="Lieu" />
        </div>
        {c.interview?.timezone && c.interview.timezone !== timezone && <p className="mt-1 text-xs text-info-800">Heure indiquée en {c.interview.timezone} — elle sera convertie en {timezone}.</p>}
      </ActionRow>
      <ActionRow checked={task.enabled} onChange={(v) => setTask((s) => ({ ...s, enabled: v }))} title="Créer une tâche">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <Input value={task.title} onChange={(e) => setTask((s) => ({ ...s, title: e.target.value }))} placeholder="Prochaine action" />
          <DateInput value={task.dueDate} onChange={(v) => setTask((s) => ({ ...s, dueDate: v }))} />
        </div>
      </ActionRow>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" asChild>
          <Link href="/inbox">Plus tard</Link>
        </Button>
        <Button onClick={apply} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Appliquer les actions sélectionnées
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free notes → note + contacts + tasks
// ---------------------------------------------------------------------------

function NoteReview({ item, result, opportunities }: { item: InboxItem; result: StoredCaptureResult; opportunities: ComboOption[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const n = result.note!;
  const [target, setTarget] = useState<{ id: string | null; name: string | null }>({ id: n.matchedOpportunityId, name: opportunities.find((o) => o.id === n.matchedOpportunityId)?.label ?? null });
  const [logNote, setLogNote] = useState(true);
  const [contacts, setContacts] = useState(result.contacts.map((c) => ({ ...c, enabled: true })));
  const [tasks, setTasks] = useState(n.tasks.map((t) => ({ ...t, enabled: true })));
  const [followUp, setFollowUp] = useState({ enabled: !!n.followUpDate, date: n.followUpDate });

  const apply = () => {
    const body = [n.summary, n.facts.length ? n.facts.map((f) => `- ${f}`).join("\n") : null, "---", item.rawText].filter(Boolean).join("\n\n");
    const actions: Record<string, unknown>[] = [];
    for (const c of contacts.filter((x) => x.enabled)) actions.push({ type: "UPSERT_CONTACT", opportunityId: target.id, ref: { fullName: c.fullName, email: c.email, role: c.role, relationship: c.relationship, opportunityRole: c.role } });
    if (logNote) actions.push({ type: "LOG_EVENT", opportunityId: target.id, eventType: "NOTE", title: result.title ?? "Note", body, occurredAt: n.occurredAt });
    for (const t of tasks.filter((x) => x.enabled && x.title.trim())) actions.push({ type: "ADD_TASK", opportunityId: target.id, title: t.title, dueDate: t.dueDate });
    if (target.id && followUp.enabled && followUp.date) actions.push({ type: "SCHEDULE_FOLLOW_UP", opportunityId: target.id, date: followUp.date });
    run(() => applyInboxActionsAction(item.id, actions), {
      success: (o) => `${o.filter((x) => x.ok).length}/${o.length} action(s) appliquée(s)`,
      onSuccess: () => router.push(target.id ? `/applications/${target.id}?tab=timeline` : "/inbox"),
    });
  };

  return (
    <div className="space-y-3 surface p-4">
      <h2 className="flex items-center gap-2 heading-sm text-foreground">
        <NotebookPen className="size-4" /> Structurer cette note
      </h2>
      {n.summary && <p className="text-sm text-muted-foreground">{n.summary}</p>}
      {n.facts.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {n.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <FormField label="Candidature concernée">
        <EntityCombobox options={opportunities} value={target} onChange={setTarget} placeholder="Choisir la candidature (facultatif)" allowCreate={false} />
      </FormField>
      <ActionRow checked={logNote} onChange={setLogNote} title="Ajouter la note à l’historique" />
      {contacts.map((c, i) => (
        <ActionRow key={i} checked={c.enabled} onChange={(v) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} title={`Enregistrer le contact : ${c.fullName}${c.role ? ` (${c.role})` : ""}${c.organizationName ? ` — ${c.organizationName}` : ""}`} />
      ))}
      {tasks.map((t, i) => (
        <ActionRow key={i} checked={t.enabled} onChange={(v) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} title="Créer une tâche">
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <Input value={t.title} onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <DateInput value={t.dueDate} onChange={(v) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, dueDate: v } : x)))} />
          </div>
        </ActionRow>
      ))}
      {n.followUpDate && (
        <ActionRow checked={followUp.enabled} onChange={(v) => setFollowUp((s) => ({ ...s, enabled: v }))} disabled={!target.id} title="Planifier la prochaine relance">
          <DateInput value={followUp.date} onChange={(v) => setFollowUp((s) => ({ ...s, date: v }))} className="w-48" />
        </ActionRow>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={apply} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Appliquer
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No analysis (AI off / failed / other) → manual conversion
// ---------------------------------------------------------------------------

function ManualConversion({ item, opportunities, onManual, aiAvailable }: { item: InboxItem; opportunities: ComboOption[]; onManual: (type: OpportunityType) => void; aiAvailable: boolean }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [target, setTarget] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [contactName, setContactName] = useState("");
  return (
    <div className="space-y-4">
      {item.status === "NEW" && (
        <div className="rounded-2xl border border-separator bg-muted-background p-4 text-sm">
          <p className="font-medium">Pas encore analysé</p>
          <p className="mt-1 text-muted-foreground">
            {aiAvailable ? "Cliquez sur Analyser pour que Claude la structure, ou convertissez-la manuellement ci-dessous." : "L’IA intégrée est désactivée. Demandez à Claude Code « traite mon inbox Career OS », ou convertissez-la manuellement ci-dessous."}
          </p>
          {aiAvailable && (
            <Button className="mt-3" size="sm" onClick={() => run(() => analyzeInboxAction(item.id), { success: "Analyse lancée" })} disabled={pending}>
              <Sparkles /> Analyser avec l’IA
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => onManual("JOB")} className="surface p-4 text-left hover:bg-muted-background">
          <Briefcase className="mb-2 size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Convertir en emploi</p>
          <p className="text-xs text-muted-foreground">Ouvre un formulaire prérempli (la capture devient la description).</p>
        </button>
        <button type="button" onClick={() => onManual("FORMATION")} className="surface p-4 text-left hover:bg-muted-background">
          <GraduationCap className="mb-2 size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Convertir en formation</p>
          <p className="text-xs text-muted-foreground">Master, école, doctorat, programme…</p>
        </button>
      </div>
      <div className="surface p-4">
        <p className="mb-2 text-sm font-medium">Joindre comme note à une candidature</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <EntityCombobox options={opportunities} value={target} onChange={setTarget} placeholder="Choisir la candidature" allowCreate={false} />
          <Button disabled={!target.id || pending} onClick={() => target.id && run(() => convertInboxToNoteAction(item.id, { opportunityId: target.id }), { success: "Enregistré comme note", onSuccess: () => router.push(`/applications/${target.id}?tab=timeline`) })}>
            Enregistrer la note
          </Button>
        </div>
      </div>
      <div className="surface p-4">
        <p className="mb-2 text-sm font-medium">En faire un contact</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nom complet" />
          <Button disabled={!contactName.trim() || pending} onClick={() => run(() => convertInboxToContactAction(item.id, { fullName: contactName.trim(), notes: item.rawText.slice(0, 20000) }), { success: "Contact créé", onSuccess: (d) => router.push(`/contacts/${d.id}`) })}>
            Créer le contact
          </Button>
        </div>
      </div>
    </div>
  );
}
