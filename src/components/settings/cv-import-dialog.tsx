"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, FileUp, RotateCcw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { importProfileFromCvAction } from "@/app/actions/profile-import";
import type { Profile } from "@/lib/schemas";
import {
  CV_MAX_BYTES,
  PROFILE_FIELD_LABELS,
  PROFILE_LIST_FIELDS,
  PROFILE_TEXT_FIELDS,
  applyCvChoices,
  countProfileChanges,
  initialCvChoices,
  sameItem,
  type CvChoices,
  type CvListChoice,
  type CvProposal,
} from "@/lib/cv-import";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TEXT_KEYS = PROFILE_TEXT_FIELDS;
const LIST_KEYS = PROFILE_LIST_FIELDS;

export function CvImportDialog({ open, onOpenChange, current, onApply, saving }: { open: boolean; onOpenChange: (open: boolean) => void; current: Profile; onApply: (next: Profile) => void; saving: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CvProposal | null>(null);
  const [choices, setChoices] = useState<CvChoices | null>(null);

  const pick = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) return void setError("Format non pris en charge : choisissez un fichier PDF ou DOCX.");
    if (f.size > CV_MAX_BYTES) return void setError("Fichier trop volumineux (4 Mo maximum).");
    setFile(f);
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const result = await importProfileFromCvAction(form);
      if (!result.ok) setError(result.error);
      else {
        setProposal(result.data);
        setChoices(initialCvChoices(current, result.data));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "L’analyse a échoué. Réessayez.");
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setProposal(null);
    setChoices(null);
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const next = useMemo(() => (proposal && choices ? applyCvChoices(current, proposal, choices) : null), [current, proposal, choices]);
  const changes = next ? countProfileChanges(current, next) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && analyzing) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{proposal ? "Vérifiez les valeurs proposées" : "Importer depuis un CV"}</DialogTitle>
          <DialogDescription>
            {proposal
              ? "Cochez les champs à reprendre. Les valeurs actuelles sont celles du formulaire ; rien n’est enregistré avant votre validation."
              : "Votre CV (PDF ou DOCX, 4 Mo maximum) est lu sur ce serveur, puis son texte est envoyé au fournisseur d’IA configuré pour préremplir le profil. Seules les informations présentes dans le CV sont proposées."}
          </DialogDescription>
        </DialogHeader>

        {!proposal && (
          <div className="space-y-3">
            <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              disabled={analyzing}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary-300 bg-muted-background px-4 py-8 dark:border-stone-700 text-center transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                dragging && "border-highlight-400 bg-highlight-50",
              )}
            >
              {file ? <FileText className="size-6 text-muted-foreground" /> : <FileUp className="size-6 text-muted-foreground" />}
              {file ? (
                <span className="flex max-w-full min-w-0 flex-col items-center">
                  <span className="max-w-full truncate text-sm font-medium text-foreground" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatSize(file.size)} · cliquez pour changer de fichier</span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Choisissez un fichier</span> ou déposez-le ici
                </span>
              )}
            </button>
            {analyzing && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner className="size-4" /> Lecture du CV et extraction des champs… (de quelques secondes à une minute)
              </p>
            )}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Import impossible</AlertTitle>
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        )}

        {proposal && choices && (
          <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
            {proposal.warnings.map((w) => (
              <Alert key={w}>
                <AlertTriangle />
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0 text-warning-500" /> Valeur non retrouvée telle quelle dans le CV : vérifiez-la avant de l’accepter.
            </p>
            <ul className="surface-list">
              <li aria-hidden className="hidden px-3 py-2 text-[11px] font-medium text-faint uppercase sm:grid sm:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                <span className="pl-6">Champ</span>
                <span>Actuel</span>
                <span>Proposé</span>
              </li>
              {TEXT_KEYS.map((key) => (
                <ReviewRow
                  key={key}
                  label={PROFILE_FIELD_LABELS[key]}
                  checked={choices.text[key]}
                  disabled={!proposal.proposed[key]}
                  onCheckedChange={(b) => setChoices({ ...choices, text: { ...choices.text, [key]: b } })}
                  current={current[key] ? <p className={cn("text-sm break-words", key === "summary" && "line-clamp-4")}>{current[key]}</p> : null}
                  proposed={
                    proposal.proposed[key] ? (
                      <p className={cn("text-sm break-words", key === "summary" && "line-clamp-6")}>
                        {proposal.unverified.text.includes(key) && <Unverified />}
                        {proposal.proposed[key]}
                      </p>
                    ) : null
                  }
                />
              ))}
              <ReviewRow
                label={PROFILE_FIELD_LABELS.yearsOfExperience}
                checked={choices.years}
                disabled={proposal.proposed.yearsOfExperience == null}
                onCheckedChange={(b) => setChoices({ ...choices, years: b })}
                current={current.yearsOfExperience != null ? <p className="text-sm tabular-nums">{current.yearsOfExperience}</p> : null}
                proposed={
                  proposal.proposed.yearsOfExperience != null ? (
                    <p className="text-sm tabular-nums">
                      {proposal.unverified.yearsOfExperience && <Unverified />}
                      {proposal.proposed.yearsOfExperience}
                    </p>
                  ) : null
                }
              />
              {LIST_KEYS.map((key) => {
                const c = choices.lists[key];
                const items = proposal.proposed[key];
                const flagged = proposal.unverified.items[key] ?? [];
                const setList = (patch: Partial<CvListChoice>) => setChoices({ ...choices, lists: { ...choices.lists, [key]: { ...c, ...patch } } });
                return (
                  <ReviewRow
                    key={key}
                    label={PROFILE_FIELD_LABELS[key]}
                    checked={c.accept}
                    disabled={!items.length}
                    onCheckedChange={(b) => setList({ accept: b })}
                    current={current[key].length ? <Chips items={current[key]} /> : null}
                    proposed={
                      items.length ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {items.map((item) => {
                              const on = c.included.includes(item);
                              const isNew = !current[key].some((x) => sameItem(x, item));
                              return (
                                <button
                                  key={item}
                                  type="button"
                                  aria-pressed={on}
                                  title={on ? "Cliquez pour exclure" : "Cliquez pour inclure"}
                                  onClick={() => setList({ included: on ? c.included.filter((x) => x !== item) : [...c.included, item], accept: on ? c.accept : true })}
                                  className={cn(
                                    "inline-flex max-w-full min-w-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs transition-colors",
                                    on ? "border-transparent bg-highlight-50 text-highlight-700" : "border-dashed border-border text-muted-foreground line-through",
                                  )}
                                >
                                  {flagged.includes(item) && <AlertTriangle className="size-3 shrink-0 text-warning-500" aria-label="Non retrouvé dans le CV" />}
                                  <span className="truncate">{item}</span>
                                  {on && !isNew && <span className="shrink-0 text-[10px] text-muted-foreground">(déjà présent)</span>}
                                </button>
                              );
                            })}
                          </div>
                          {current[key].length > 0 && (
                            <ToggleGroup
                              type="single"
                              size="sm"
                              variant="outline"
                              spacing={0}
                              value={c.mode}
                              onValueChange={(m) => m && setList({ mode: m as CvListChoice["mode"] })}
                              aria-label={`Mode d’import pour ${PROFILE_FIELD_LABELS[key]}`}
                            >
                              <ToggleGroupItem value="merge" className="whitespace-nowrap" title="Garder les valeurs actuelles et ajouter les nouvelles">
                                Ajouter
                              </ToggleGroupItem>
                              <ToggleGroupItem value="replace" className="whitespace-nowrap">
                                Remplacer
                              </ToggleGroupItem>
                            </ToggleGroup>
                          )}
                        </div>
                      ) : null
                    }
                  />
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Analyse : {proposal.meta.provider}
              {proposal.meta.model ? ` · ${proposal.meta.model}` : ""} · {Math.max(1, Math.round(proposal.meta.durationMs / 1000))} s
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {proposal ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={saving} className="sm:mr-auto">
                <RotateCcw /> Autre fichier
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Annuler
              </Button>
              <Button variant="highlight" disabled={!next || changes === 0 || saving} onClick={() => next && onApply(next)}>
                {saving ? <Spinner /> : null}
                {changes ? `Enregistrer ${changes} champ${changes > 1 ? "s" : ""}` : "Aucune modification"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={analyzing}>
                Annuler
              </Button>
              <Button variant="highlight" onClick={analyze} disabled={!file || analyzing}>
                {analyzing ? <Spinner /> : <Sparkles />} Analyser le CV
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

function Unverified() {
  return <AlertTriangle className="mr-1 inline size-3.5 -translate-y-px text-warning-500" aria-label="Non retrouvé dans le CV" />;
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="inline-flex max-w-full min-w-0 rounded-lg bg-primary-100 px-1.5 py-0.5 text-xs text-primary-700 dark:bg-stone-800 dark:text-stone-300">
          <span className="truncate">{item}</span>
        </span>
      ))}
    </div>
  );
}

function ReviewRow({
  label,
  checked,
  disabled,
  onCheckedChange,
  current,
  proposed,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  current: React.ReactNode;
  proposed: React.ReactNode;
}) {
  const id = `cv-${label.replace(/\W+/g, "-")}`;
  return (
    <li className={cn("grid gap-2 px-3 py-3 sm:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4", disabled && "opacity-60")}>
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={checked && !disabled} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)} className="mt-0.5" />
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium text-faint uppercase sm:hidden">Actuel</p>
        {current ?? <p className="text-sm text-faint">Vide</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium text-faint uppercase sm:hidden">Proposé</p>
        {proposed ?? <p className="text-sm text-faint">Absent du CV</p>}
      </div>
    </li>
  );
}
