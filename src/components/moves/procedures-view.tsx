"use client";

import { useState } from "react";
import { BadgeCheck, Building2, ChevronDown, ExternalLink, FileText, HeartPulse, Landmark, Plus, Receipt, ShieldCheck, Sparkles, Stamp, TramFront, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DueBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/sparkle";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { addProcedureAction, addStepAction, addTemplateProceduresAction, deleteProcedureAction, deleteStepAction, researchProceduresAction, updateProcedureAction, updateStepAction } from "@/app/actions/moves";
import { OPEN_PROCEDURE_STATUSES, PROCEDURE_CATEGORIES, PROCEDURE_CATEGORY_LABEL, PROCEDURE_STATUSES, PROCEDURE_STATUS_LABEL, type ProcedureCategory, type ProcedureStatus } from "@/lib/procedures";
import { formatISODate } from "@/lib/dates";
import type { ProcedureView } from "@/server/services/procedures";
import { cn } from "@/lib/utils";

export interface ProcedureTemplatesInfo {
  countryCode: string | null;
  suggested: string[];
  all: { key: string; title: string; checkedAt: string; count: number; applied: boolean; caveats: string[] }[];
}

const CATEGORY_ICON: Record<ProcedureCategory, React.ComponentType<{ className?: string }>> = {
  VISA: Stamp,
  RESIDENCE: Building2,
  HEALTH: HeartPulse,
  TAX: Receipt,
  BANK: Landmark,
  TRANSPORT: TramFront,
  INSURANCE: ShieldCheck,
  OTHER: FileText,
};

/** Procedures tab of a move: templates, Claude research, steps to tick, official links. */
export function ProceduresView({ moveId, country, procedures, templates }: { moveId: string; country: string | null; procedures: ProcedureView[]; templates: ProcedureTemplatesInfo }) {
  const { run, pending } = useAction();
  const [researching, setResearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const open = procedures.filter((p) => OPEN_PROCEDURE_STATUSES.includes(p.status));
  const closed = procedures.filter((p) => !OPEN_PROCEDURE_STATUSES.includes(p.status));
  const toApply = templates.all.filter((t) => templates.suggested.includes(t.key) && !t.applied);
  const toCheck = procedures.filter((p) => p.toCheck).length;
  const steps = procedures.flatMap((p) => p.steps);

  const applyTemplates = (keys?: string[]) => run(() => addTemplateProceduresAction(moveId, keys), { success: (d) => (d.added ? `${d.added} démarche${d.added > 1 ? "s" : ""} ajoutée${d.added > 1 ? "s" : ""}` : "Déjà toutes présentes") });
  const research = () => {
    setResearching(true);
    run(() => researchProceduresAction(moveId), {
      success: (d) => (d.added ? `${d.added} démarche${d.added > 1 ? "s" : ""} trouvée${d.added > 1 ? "s" : ""}, à vérifier` : "Rien de nouveau trouvé"),
      onSuccess: () => setResearching(false),
      onError: () => setResearching(false),
    });
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {toApply.length > 0 && (
        <Button variant="outline" onClick={() => applyTemplates(toApply.map((t) => t.key))} disabled={pending}>
          <Plus /> Ajouter : {toApply.map((t) => t.title).join(" + ")}
        </Button>
      )}
      <Button variant="highlight" onClick={research} disabled={researching}>
        {researching ? <Spinner /> : <Sparkles />} Rechercher avec Claude
      </Button>
      <Button variant="ghost" onClick={() => setAdding((v) => !v)}>
        <Plus /> Démarche
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {procedures.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title="Aucune démarche pour l’instant"
          description={
            toApply.length
              ? `Ajoute les modèles ${toApply.map((t) => t.title).join(" et ")} (sources officielles, vérifiés le ${formatISODate(toApply[0].checkedAt, "medium")}), puis complète avec Claude.`
              : `Pas de modèle pour ${country ?? "ce pays"} : Claude peut chercher les démarches sur les sites officiels.`
          }
        >
          {actions}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="copy-sm text-muted-foreground">
            {open.length} à faire · {steps.filter((s) => s.done).length}/{steps.length} étapes cochées
            {toCheck ? ` · ${toCheck} à vérifier` : ""}
          </p>
          {actions}
        </div>
      )}

      {researching && <p className="copy-sm text-muted-foreground">Claude consulte les sites officiels (plusieurs minutes). Tu peux continuer ailleurs, les démarches apparaîtront ici.</p>}
      {adding && <NewProcedureForm moveId={moveId} onDone={() => setAdding(false)} />}

      {open.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="À faire" count={open.length} />
          {open.map((p) => (
            <ProcedureCard key={p.id} p={p} />
          ))}
        </section>
      )}
      {closed.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="Faites ou pas nécessaires" count={closed.length} />
          {closed.map((p) => (
            <ProcedureCard key={p.id} p={p} />
          ))}
        </section>
      )}
      {templates.all.some((t) => t.applied && t.caveats.length > 0) && (
        <details className="surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Points à vérifier pour ta situation</summary>
          <ul className="mt-2 space-y-1.5">
            {templates.all
              .filter((t) => t.applied)
              .flatMap((t) => t.caveats.map((c) => ({ key: `${t.key}:${c}`, text: c })))
              .map((c) => (
                <li key={c.key} className="copy-sm text-muted-foreground">
                  · {c.text}
                </li>
              ))}
          </ul>
        </details>
      )}
      {procedures.length > 0 && <p className="text-xs text-faint">Les règles changent : chaque démarche indique sa source et la date de vérification. Ce n’est pas un avis juridique.</p>}
    </div>
  );
}

function ProcedureCard({ p }: { p: ProcedureView }) {
  const { dateLocale } = useAppData();
  const { run } = useAction();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(p.notes ?? "");
  const [step, setStep] = useState("");
  const Icon = CATEGORY_ICON[p.category];
  const doneSteps = p.steps.filter((s) => s.done).length;
  const closed = !OPEN_PROCEDURE_STATUSES.includes(p.status);
  const update = (patch: Record<string, unknown>, success?: string) => run(() => updateProcedureAction(p.id, patch), { success });

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-background", closed && "opacity-70")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted-background text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("text-sm font-medium text-foreground", p.status === "DONE" && "line-through")}>{p.title}</span>
            {p.dueDate && !closed && <DueBadge date={p.dueDate} />}
            {p.toCheck && (
              <Badge size="sm" variant="destructive">
                À vérifier
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {PROCEDURE_CATEGORY_LABEL[p.category]}
            {p.steps.length ? ` · ${doneSteps}/${p.steps.length} étapes` : ""}
            {p.appliesIf ? ` · ${/^(si|en|tant|pour|lors)\b/i.test(p.appliesIf) ? p.appliesIf : `si ${p.appliesIf}`}` : ""}
          </p>
        </button>
        <Select value={p.status} onValueChange={(s) => update({ status: s as ProcedureStatus })}>
          <SelectTrigger size="sm" className="w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROCEDURE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PROCEDURE_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-sm" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Replier" : "Déplier"}>
          <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-separator px-4 py-4">
          {p.summary && <p className="copy-sm text-foreground">{p.summary}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {p.officialUrl && (
              <Button size="xs" variant="outline" asChild>
                <a href={p.officialUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Page officielle
                </a>
              </Button>
            )}
            {p.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
                {s.label}
              </a>
            ))}
            <span className="text-xs text-faint">
              {p.source === "TEMPLATE" ? `Modèle ${p.templateKey ?? ""}` : p.source === "AI" ? "Recherche Claude" : "Ajoutée à la main"}
              {p.checkedAt ? `, vérifié le ${formatISODate(p.checkedAt, "medium", dateLocale)}` : ""}
            </span>
          </div>

          {p.steps.length > 0 && (
            <ul className="space-y-2">
              {p.steps.map((s) => (
                <li key={s.id} className="group/step flex items-start gap-2.5">
                  <Checkbox className="mt-0.5" checked={s.done} onCheckedChange={(v) => run(() => updateStepAction(s.id, { done: !!v }))} aria-label={s.title} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className={cn("text-sm text-foreground", s.done && "text-muted-foreground line-through")}>
                      {s.title}
                      {s.officialUrl && (
                        <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground" aria-label="Lien officiel">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </p>
                    {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
                    {s.requiredDocuments.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {s.requiredDocuments.map((d) => (
                          <span key={d} className="rounded-md bg-muted-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => run(() => deleteStepAction(s.id))} className="rounded p-0.5 text-faint opacity-0 hover:text-foreground group-hover/step:opacity-100" aria-label={`Retirer l’étape ${s.title}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={step}
            onChange={(e) => setStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && step.trim()) {
                run(() => addStepAction(p.id, { title: step.trim() }), { onSuccess: () => setStep("") });
              }
            }}
            placeholder="Ajouter une étape…"
            className="h-8 w-full rounded-lg border border-dashed border-border bg-transparent px-2 text-sm outline-none placeholder:text-faint focus:border-solid focus:border-border-form-active"
            aria-label="Ajouter une étape"
          />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (p.notes ?? "") && update({ notes: notes.trim() || null }, "Note enregistrée")} rows={2} placeholder="Notes (numéro de dossier, rendez-vous…)" className="text-sm" />
          <div className="flex flex-wrap items-center gap-2">
            {p.toCheck && (
              <Button size="xs" variant="outline" onClick={() => update({ verified: true }, "Marquée comme vérifiée")}>
                <BadgeCheck /> J’ai vérifié les liens
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Échéance</span>
              <Input type="date" value={p.dueDate ?? ""} onChange={(e) => update({ dueDate: e.target.value || null })} className="h-7 w-36 text-xs" aria-label="Échéance" />
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ title: "Retirer cette démarche ?", description: p.title, confirmLabel: "Retirer", destructive: true })) run(() => deleteProcedureAction(p.id), { success: "Démarche retirée" });
                }}
                aria-label="Retirer la démarche"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewProcedureForm({ moveId, onDone }: { moveId: string; onDone: () => void }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProcedureCategory>("OTHER");
  const [dueDate, setDueDate] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const submit = () =>
    run(() => addProcedureAction(moveId, { title: title.trim(), category, dueDate: dueDate || null, officialUrl: officialUrl.trim() || null }), { success: "Démarche ajoutée", onSuccess: onDone });
  return (
    <div className="surface grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Démarche (ex. Ouvrir un compte bancaire)" aria-label="Titre de la démarche" />
      <Select value={category} onValueChange={(c) => setCategory(c as ProcedureCategory)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROCEDURE_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {PROCEDURE_CATEGORY_LABEL[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Échéance" />
      <Input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="Lien officiel (https://…)" className="sm:col-span-2" aria-label="Lien officiel" />
      <Button onClick={submit} disabled={!title.trim() || pending}>
        Ajouter
      </Button>
    </div>
  );
}
