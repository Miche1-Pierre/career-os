"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Info, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormField, DateInput, ListEditor, NumberInput, TagInput, TimeInput } from "@/components/app/fields";
import { EntityCombobox, type ComboOption } from "@/components/app/entity-combobox";
import { MarkdownEditor } from "@/components/app/markdown";
import { StageBadge } from "@/components/app/badges";
import { useAppData } from "@/components/app/app-data";
import { StageSelect } from "./stage-select";
import {
  CONTRACT_LABEL,
  CONTRACT_TYPES,
  EDUCATION_FORMATS,
  EDUCATION_FORMAT_LABEL,
  LINK_KINDS,
  LINK_KIND_LABEL,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_META,
  PRIORITIES,
  PRIORITY_META,
  RELATIONSHIPS,
  RELATIONSHIP_LABEL,
  REMOTE_LABEL,
  REMOTE_POLICIES,
  SALARY_PERIODS,
  SOURCES,
  SOURCE_LABEL,
  familyOf,
  type OpportunityType,
} from "@/lib/constants";
import type { OpportunityContactRef, OpportunityDetails, OpportunityInput, OpportunityLink, ProvenanceMap } from "@/lib/schemas";
import { checkDuplicatesAction, createOpportunityAction, updateOpportunityAction } from "@/app/actions/opportunities";
import { convertInboxToOpportunityAction } from "@/app/actions/inbox";
import type { DuplicateResult } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit" | "review";

export interface OpportunityFormProps {
  mode: Mode;
  initial: OpportunityInput;
  provenance?: ProvenanceMap;
  opportunityId?: string;
  captureId?: string;
  organizations: ComboOption[];
  detectedContacts?: OpportunityContactRef[];
  questionsToClarify?: string[];
  warnings?: string[];
  onCancelHref?: string;
}

const NONE = "__none__";

function Group({ title, description, children, defaultOpen = true }: { title: string; description?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="surface min-w-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="heading-sm text-foreground">{title}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-separator p-4 @lg/form:p-5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Two short fields side by side when there is room, stacked otherwise (sizes against their own width). */
function Pair({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("@container min-w-0", className)}>
      <div className="grid gap-4 @xs:grid-cols-2 @xs:gap-2">{children}</div>
    </div>
  );
}

const SALARY_PERIOD_LABEL = { YEAR: "Par an", MONTH: "Par mois", DAY: "Par jour", HOUR: "Par heure" } as const;

function OptionalSelect<T extends string>({ value, onChange, options, labels, placeholder = "Inconnu" }: { value: T | null | undefined; onChange: (v: T | null) => void; options: readonly T[]; labels: Record<T, string>; placeholder?: string }) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as T))}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{placeholder}</span>
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OpportunityForm({ mode, initial, provenance = {}, opportunityId, captureId, organizations, detectedContacts = [], questionsToClarify = [], warnings = [], onCancelHref }: OpportunityFormProps) {
  const router = useRouter();
  const { stages } = useAppData();
  const [draft, setDraft] = useState<OpportunityInput>(initial);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<(OpportunityContactRef & { include: boolean })[]>(detectedContacts.map((c) => ({ ...c, include: true })));
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult[] | null>(null);
  const family = familyOf(draft.type);
  const details = draft.details ?? {};

  const set = <K extends keyof OpportunityInput>(key: K, value: OpportunityInput[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setTouched((t) => new Set(t).add(key === "organizationName" || key === "organizationId" ? "organizationId" : String(key)));
  };
  const setDetail = <K extends keyof OpportunityDetails>(key: K, value: OpportunityDetails[K]) => {
    setDraft((d) => ({ ...d, details: { ...(d.details ?? {}), [key]: value } }));
    setTouched((t) => new Set(t).add(`details.${String(key)}`));
  };
  const prov = (key: string) => (touched.has(key) ? null : provenance[key]);

  const statusKey = draft.status ?? stages.find((s) => s.pipeline === family && s.isDefault)?.key ?? null;
  const submittedStage = stages.find((s) => s.pipeline === family && s.key === statusKey);
  const isSubmitted = submittedStage && ["APPLIED", "INTERVIEW", "OFFER", "WON"].includes(submittedStage.category);

  const finalProvenance = useMemo(() => {
    const out: ProvenanceMap = {};
    for (const [key, value] of Object.entries(provenance)) if (!touched.has(key)) out[key] = value;
    return out;
  }, [provenance, touched]);

  function buildInput(): OpportunityInput {
    const cleanDetails = Object.fromEntries(Object.entries(draft.details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))) as OpportunityDetails;
    return {
      ...draft,
      status: statusKey,
      details: cleanDetails,
      links: (draft.links ?? []).filter((l) => l.url.trim()),
      provenance: finalProvenance,
      contacts: contacts.filter((c) => c.include && (c.fullName?.trim() || c.email?.trim())).map(({ include: _i, ...c }) => (void _i, c)),
      captureId: captureId ?? draft.captureId ?? null,
    };
  }

  function buildPatch() {
    const input = buildInput();
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(input) as (keyof OpportunityInput)[]) {
      if (["contacts", "provenance", "captureId", "applyTemplate", "status"].includes(key)) continue;
      if (JSON.stringify(input[key] ?? null) !== JSON.stringify(initial[key] ?? null)) patch[key] = input[key] ?? null;
    }
    if (patch.organizationName !== undefined || patch.organizationId !== undefined) {
      patch.organizationId = input.organizationId ?? undefined;
      patch.organizationName = input.organizationId ? undefined : (input.organizationName ?? null);
    }
    if (input.status && input.status !== initial.status) patch.status = input.status;
    return patch;
  }

  async function submit(force = false) {
    if (!draft.title.trim()) return void toast.error("L’intitulé est obligatoire");
    setSaving(true);
    try {
      if (mode === "edit" && opportunityId) {
        const patch = buildPatch();
        if (!Object.keys(patch).length) {
          router.push(`/applications/${opportunityId}`);
          return;
        }
        const r = await updateOpportunityAction(opportunityId, patch);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Modifications enregistrées");
        router.push(`/applications/${opportunityId}`);
        return;
      }
      const input = buildInput();
      if (!force) {
        const dup = await checkDuplicatesAction({ title: input.title, organizationName: input.organizationName, organizationId: input.organizationId, url: input.url });
        if (dup.ok && dup.data.length) {
          setDuplicates(dup.data);
          return;
        }
      }
      const r = captureId ? await convertInboxToOpportunityAction(captureId, input, true) : await createOpportunityAction(input, true);
      if (!r.ok) return void toast.error(r.error);
      toast.success(captureId ? "Candidature créée à partir de la capture" : "Candidature créée");
      router.push(`/applications/${r.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  const links = draft.links ?? [];
  const setLink = (index: number, patch: Partial<OpportunityLink>) => set("links", links.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <div className="@container/form min-w-0 space-y-4">
      {(warnings.length > 0 || questionsToClarify.length > 0) && (
        <Alert>
          <Info />
          <AlertTitle>À vérifier avant d’enregistrer</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              {questionsToClarify.map((q) => (
                <li key={q} className="text-muted-foreground">
                  À clarifier : {q}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Group title="L’essentiel">
        <div className="grid gap-4 @xl/form:grid-cols-2">
          <FormField label="Type" htmlFor="type">
            <Select
              value={draft.type}
              onValueChange={(v) => {
                const nextType = v as OpportunityType;
                const nextFamily = familyOf(nextType);
                setDraft((d) => ({ ...d, type: nextType, status: nextFamily === family ? d.status : null }));
                setTouched((t) => new Set(t).add("type"));
              }}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPPORTUNITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {OPPORTUNITY_TYPE_META[t].label} <span className="text-xs text-muted-foreground">— {OPPORTUNITY_TYPE_META[t].description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={family === "EDUCATION" ? "Intitulé de la formation" : "Poste"} htmlFor="title" provenance={prov("title")} required>
            <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder={family === "EDUCATION" ? "Master Bioinformatique" : "Ingénieur logiciel senior"} />
          </FormField>
          <FormField label={family === "EDUCATION" ? "Établissement" : "Entreprise"} provenance={prov("organizationId")}>
            <EntityCombobox
              options={organizations}
              value={{ id: draft.organizationId, name: draft.organizationName }}
              onChange={(v) => {
                setDraft((d) => ({ ...d, organizationId: v.id, organizationName: v.name }));
                setTouched((t) => new Set(t).add("organizationId"));
              }}
              placeholder={family === "EDUCATION" ? "Choisir ou créer un établissement" : "Choisir ou créer une entreprise"}
            />
          </FormField>
          <FormField label="Statut">
            <StageSelect pipeline={family} value={statusKey} onChange={(v) => set("status", v)} className="w-full" />
          </FormField>
          <FormField label="Priorité">
            <Select value={draft.priority ?? "NORMAL"} onValueChange={(v) => set("priority", v as OpportunityInput["priority"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={cn("size-2 rounded-full", PRIORITY_META[p].dot)} /> {PRIORITY_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <Pair>
            <FormField label="Source" provenance={prov("source")}>
              <OptionalSelect value={draft.source as (typeof SOURCES)[number] | null} onChange={(v) => set("source", v)} options={SOURCES} labels={SOURCE_LABEL as Record<(typeof SOURCES)[number], string>} placeholder="—" />
            </FormField>
            <FormField label="Précision sur la source">
              <Input value={draft.sourceDetail ?? ""} onChange={(e) => set("sourceDetail", e.target.value || null)} placeholder="Recommandé par…" />
            </FormField>
          </Pair>
          <FormField label="Tags" className="@xl/form:col-span-2">
            <TagInput value={draft.tags ?? []} onChange={(v) => set("tags", v)} placeholder="Ajouter un tag…" />
          </FormField>
        </div>
      </Group>

      <Group title="Lieu et dates">
        <div className="grid gap-4 @lg/form:grid-cols-2 @3xl/form:grid-cols-3">
          <FormField label="Ville" provenance={prov("locationCity")}>
            <Input value={draft.locationCity ?? ""} onChange={(e) => set("locationCity", e.target.value || null)} />
          </FormField>
          <FormField label="Pays" provenance={prov("locationCountry")}>
            <Input value={draft.locationCountry ?? ""} onChange={(e) => set("locationCountry", e.target.value || null)} />
          </FormField>
          {family === "JOB" ? (
            <FormField label="Télétravail" provenance={prov("remotePolicy")}>
              <OptionalSelect value={draft.remotePolicy} onChange={(v) => set("remotePolicy", v)} options={REMOTE_POLICIES} labels={REMOTE_LABEL} />
            </FormField>
          ) : (
            <FormField label="Format" provenance={prov("details.format")}>
              <OptionalSelect value={details.format} onChange={(v) => setDetail("format", v)} options={EDUCATION_FORMATS} labels={EDUCATION_FORMAT_LABEL} />
            </FormField>
          )}
          <FormField label="Date limite de candidature" provenance={prov("deadline")}>
            <div className="@container min-w-0">
              <div className="flex flex-col gap-2 @2xs:flex-row">
                <div className="min-w-0 flex-1">
                  <DateInput value={draft.deadline} onChange={(v) => set("deadline", v)} />
                </div>
                <TimeInput value={draft.deadlineTime} onChange={(v) => set("deadlineTime", v)} className="@2xs:w-28 @2xs:shrink-0" />
              </div>
            </div>
          </FormField>
          {family === "EDUCATION" && (
            <FormField label="Ouverture des candidatures" provenance={prov("applicationOpensAt")}>
              <DateInput value={draft.applicationOpensAt} onChange={(v) => set("applicationOpensAt", v)} />
            </FormField>
          )}
          {(mode !== "review" || isSubmitted) && (
            <FormField label="Candidature envoyée le" hint={isSubmitted && !draft.appliedAt ? "Par défaut : aujourd’hui" : undefined}>
              <DateInput value={draft.appliedAt} onChange={(v) => set("appliedAt", v)} />
            </FormField>
          )}
          <FormField label="Réponse attendue avant le" hint="Les relances attendent que cette date soit passée.">
            <DateInput value={draft.expectedResponseAt} onChange={(v) => set("expectedResponseAt", v)} />
          </FormField>
        </div>
      </Group>

      {family === "JOB" ? (
        <Group title="Contrat et rémunération">
          <div className="grid gap-4 @lg/form:grid-cols-2 @3xl/form:grid-cols-3">
            <FormField label="Contrat" provenance={prov("details.contractType")}>
              <OptionalSelect value={details.contractType} onChange={(v) => setDetail("contractType", v)} options={CONTRACT_TYPES} labels={CONTRACT_LABEL} />
            </FormField>
            <FormField label="Séniorité" provenance={prov("details.seniority")}>
              <Input value={details.seniority ?? ""} onChange={(e) => setDetail("seniority", e.target.value || null)} placeholder="Junior, senior, lead…" />
            </FormField>
            <FormField label="Expérience (années)" provenance={prov("details.experienceYears")}>
              <NumberInput value={details.experienceYears} onChange={(v) => setDetail("experienceYears", v)} />
            </FormField>
            <FormField label="Salaire min." provenance={prov("details.salaryMin")}>
              <NumberInput value={details.salaryMin} onChange={(v) => setDetail("salaryMin", v)} placeholder="55000" step={1000} />
            </FormField>
            <FormField label="Salaire max." provenance={prov("details.salaryMax")}>
              <NumberInput value={details.salaryMax} onChange={(v) => setDetail("salaryMax", v)} placeholder="68000" step={1000} />
            </FormField>
            <Pair>
              <FormField label="Devise" provenance={prov("details.salaryCurrency")}>
                <Input value={details.salaryCurrency ?? ""} onChange={(e) => setDetail("salaryCurrency", e.target.value.toUpperCase() || null)} placeholder="EUR" />
              </FormField>
              <FormField label="Période">
                <OptionalSelect value={details.salaryPeriod} onChange={(v) => setDetail("salaryPeriod", v)} options={SALARY_PERIODS} labels={SALARY_PERIOD_LABEL} placeholder="—" />
              </FormField>
            </Pair>
            <FormField label="Salaire (tel qu’indiqué)" provenance={prov("details.salaryText")} className="@lg/form:col-span-2">
              <Input value={details.salaryText ?? ""} onChange={(e) => setDetail("salaryText", e.target.value || null)} />
            </FormField>
            <FormField label="Équipe / service" provenance={prov("details.department")}>
              <Input value={details.department ?? ""} onChange={(e) => setDetail("department", e.target.value || null)} />
            </FormField>
            <FormField label="Date de début" provenance={prov("details.startDate")}>
              <Input value={details.startDate ?? ""} onChange={(e) => setDetail("startDate", e.target.value || null)} placeholder="Dès que possible, janvier 2027…" />
            </FormField>
            {(draft.type === "INTERNSHIP" || draft.type === "VIE" || draft.type === "ALTERNANCE") && (
              <FormField label="Durée" provenance={prov("details.duration")}>
                <Input value={details.duration ?? ""} onChange={(e) => setDetail("duration", e.target.value || null)} placeholder="6 mois" />
              </FormField>
            )}
          </div>
        </Group>
      ) : (
        <Group title="Détails du programme">
          <div className="grid gap-4 @lg/form:grid-cols-2 @3xl/form:grid-cols-3">
            <FormField label="Faculté / département" provenance={prov("details.department")}>
              <Input value={details.department ?? ""} onChange={(e) => setDetail("department", e.target.value || null)} />
            </FormField>
            <FormField label="Niveau" provenance={prov("details.level")}>
              <Input value={details.level ?? ""} onChange={(e) => setDetail("level", e.target.value || null)} placeholder="Master 2, MSc, doctorat…" />
            </FormField>
            <FormField label="Rentrée" provenance={prov("details.entryYear")}>
              <Input value={details.entryYear ?? ""} onChange={(e) => setDetail("entryYear", e.target.value || null)} placeholder="Septembre 2027" />
            </FormField>
            <FormField label="Durée" provenance={prov("details.duration")}>
              <Input value={details.duration ?? ""} onChange={(e) => setDetail("duration", e.target.value || null)} placeholder="2 ans" />
            </FormField>
            <FormField label="Langue d’enseignement" provenance={prov("details.teachingLanguage")}>
              <Input value={details.teachingLanguage ?? ""} onChange={(e) => setDetail("teachingLanguage", e.target.value || null)} />
            </FormField>
            <FormField label="Niveau de langue exigé" provenance={prov("details.languageRequirement")}>
              <Input value={details.languageRequirement ?? ""} onChange={(e) => setDetail("languageRequirement", e.target.value || null)} placeholder="IELTS 6.5, B2…" />
            </FormField>
            <FormField label="Frais de scolarité" provenance={prov("details.tuitionFees")}>
              <Input value={details.tuitionFees ?? ""} onChange={(e) => setDetail("tuitionFees", e.target.value || null)} />
            </FormField>
            <FormField label="Frais de dossier" provenance={prov("details.applicationFee")}>
              <Input value={details.applicationFee ?? ""} onChange={(e) => setDetail("applicationFee", e.target.value || null)} />
            </FormField>
            <FormField label="Alternance" provenance={prov("details.alternance")}>
              <Select value={details.alternance == null ? NONE : details.alternance ? "yes" : "no"} onValueChange={(v) => setDetail("alternance", v === NONE ? null : v === "yes")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Inconnu</SelectItem>
                  <SelectItem value="yes">Possible</SelectItem>
                  <SelectItem value="no">Non</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Matières" provenance={prov("details.subjects")}>
              <ListEditor value={details.subjects ?? []} onChange={(v) => setDetail("subjects", v)} rows={3} />
            </FormField>
            <FormField label="Débouchés" provenance={prov("details.careerOutcomes")} className="@lg/form:col-span-2">
              <ListEditor value={details.careerOutcomes ?? []} onChange={(v) => setDetail("careerOutcomes", v)} rows={3} />
            </FormField>
          </div>
        </Group>
      )}

      <Group title="Contenu" description="Un élément par ligne : vous pouvez coller une liste à puces.">
        <div className="grid gap-4 @xl/form:grid-cols-2">
          <FormField label="Résumé" provenance={prov("summary")} className="@xl/form:col-span-2">
            <Textarea value={draft.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} rows={2} />
          </FormField>
          <FormField label={family === "EDUCATION" ? "Contenu / objectifs du programme" : "Missions"} provenance={prov("responsibilities")}>
            <ListEditor value={draft.responsibilities ?? []} onChange={(v) => set("responsibilities", v)} />
          </FormField>
          <FormField label="Profil recherché / prérequis" provenance={prov("requirements")}>
            <ListEditor value={draft.requirements ?? []} onChange={(v) => set("requirements", v)} />
          </FormField>
          <FormField label="Compétences" provenance={prov("skills")}>
            <ListEditor value={draft.skills ?? []} onChange={(v) => set("skills", v)} rows={3} />
          </FormField>
          <FormField label="Technologies" provenance={prov("technologies")}>
            <ListEditor value={draft.technologies ?? []} onChange={(v) => set("technologies", v)} rows={3} />
          </FormField>
          <FormField label="Atouts appréciés" provenance={prov("niceToHave")}>
            <ListEditor value={draft.niceToHave ?? []} onChange={(v) => set("niceToHave", v)} rows={3} />
          </FormField>
          <FormField label="Avantages" provenance={prov("benefits")}>
            <ListEditor value={draft.benefits ?? []} onChange={(v) => set("benefits", v)} rows={3} />
          </FormField>
          <FormField label="Documents demandés pour la candidature" provenance={prov("requiredDocuments")} hint="Chacun devient un élément de la checklist (CV, lettres, relevés de notes…)." className="@xl/form:col-span-2">
            <ListEditor value={draft.requiredDocuments ?? []} onChange={(v) => set("requiredDocuments", v)} rows={3} />
          </FormField>
        </div>
      </Group>

      <Group title="Liens">
        <div className="space-y-3">
          <FormField label={family === "EDUCATION" ? "Page de la formation" : "URL de l’offre"} provenance={prov("url")}>
            <Input value={draft.url ?? ""} onChange={(e) => set("url", e.target.value || null)} placeholder="https://…" />
          </FormField>
          {links.map((link, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @lg/form:grid-cols-[12rem_minmax(0,1fr)_auto]">
              <Select value={link.kind} onValueChange={(v) => setLink(i, { kind: v as OpportunityLink["kind"] })}>
                <SelectTrigger className="w-full" aria-label="Type de lien">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {LINK_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={link.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://…" aria-label="URL du lien" className="order-last col-span-2 @lg/form:order-none @lg/form:col-span-1" />
              <Button variant="ghost" size="icon" onClick={() => set("links", links.filter((_, j) => j !== i))} aria-label="Supprimer le lien">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => set("links", [...links, { kind: "APPLICATION", url: "", label: null }])}>
            <Plus /> Ajouter un lien
          </Button>
        </div>
      </Group>

      {mode !== "edit" && (
        <Group title="Contacts" description={contacts.length ? "Personnes détectées : décochez celles que vous ne voulez pas enregistrer." : "Recruteur, manager, responsable de formation…"}>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl border border-separator p-2 @3xl/form:rounded-none @3xl/form:border-0 @3xl/form:p-0">
                <Checkbox className="mt-2" checked={c.include} onCheckedChange={(v) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, include: !!v } : x)))} aria-label="Enregistrer ce contact" />
                <div className="grid min-w-0 flex-1 gap-2 @lg/form:grid-cols-2 @3xl/form:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10rem]">
                  <Input value={c.fullName ?? ""} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))} placeholder="Nom complet" />
                  <Input value={c.role ?? ""} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, role: e.target.value, opportunityRole: e.target.value } : x)))} placeholder="Fonction" />
                  <Input value={c.email ?? ""} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="E-mail" />
                  <Select value={c.relationship ?? NONE} onValueChange={(v) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, relationship: v === NONE ? null : (v as never) } : x)))}>
                    <SelectTrigger className="w-full" aria-label="Relation">
                      <SelectValue placeholder="Relation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {RELATIONSHIPS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {RELATIONSHIP_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} aria-label="Retirer le contact">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setContacts((cs) => [...cs, { fullName: "", include: true }])}>
              <UserPlus /> Ajouter un contact
            </Button>
          </div>
        </Group>
      )}

      <Group title="Description" description={mode === "review" ? "Texte original de la capture (conservé pour référence)." : undefined} defaultOpen={mode !== "review"}>
        <MarkdownEditor value={draft.description ?? ""} onChange={(v) => set("description", v || null)} minRows={10} />
      </Group>

      <Group title="Règles de relance" defaultOpen={false} description="Laissez vide pour utiliser vos réglages par défaut (Réglages → Relances).">
        <div className="grid gap-4 @lg/form:grid-cols-2 @3xl/form:grid-cols-3">
          <FormField label="Intervalle de relance (jours)" hint="0 désactive les relances automatiques pour cette candidature.">
            <NumberInput value={draft.followUpIntervalDays} onChange={(v) => set("followUpIntervalDays", v == null ? null : Math.max(0, Math.round(v)))} placeholder="Par défaut" />
          </FormField>
          <FormField label="Jours ouvrés uniquement">
            <Select value={draft.followUpBusinessDays == null ? NONE : draft.followUpBusinessDays ? "yes" : "no"} onValueChange={(v) => set("followUpBusinessDays", v === NONE ? null : v === "yes")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Par défaut</SelectItem>
                <SelectItem value="yes">Oui</SelectItem>
                <SelectItem value="no">Non</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Prochaine relance (manuelle)">
            <DateInput value={draft.nextFollowUpAt} onChange={(v) => set("nextFollowUpAt", v)} />
          </FormField>
        </div>
      </Group>

      {duplicates && duplicates.length > 0 && (
        <Alert variant="destructive" className="border-info-200 bg-info-50 text-info-900">
          <AlertTriangle />
          <AlertTitle>Doublon possible</AlertTitle>
          <AlertDescription className="text-inherit">
            <ul className="mt-1 space-y-1">
              {duplicates.map((d) => (
                <li key={d.id} className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link href={`/applications/${d.id}`} className="min-w-0 font-medium break-words underline underline-offset-2">
                    {d.organizationName ? `${d.organizationName} — ` : ""}
                    {d.title}
                  </Link>
                  <span className="text-xs opacity-80">
                    {d.reason} · {Math.round(d.score * 100)} % · {d.stageLabel}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/applications/${duplicates[0].id}`}>Ouvrir l’existante</Link>
              </Button>
              <Button size="sm" onClick={() => submit(true)} disabled={saving}>
                Créer quand même
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
          {submittedStage && <StageBadge label={submittedStage.label} category={submittedStage.category} />}
          {mode === "review" && Object.keys(finalProvenance).length > 0 && (
            <span className="truncate">{Object.keys(finalProvenance).length} champs remplis par l’IA ; ceux que vous modifiez deviennent les vôtres.</span>
          )}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button variant="ghost" asChild>
            <Link href={onCancelHref ?? (opportunityId ? `/applications/${opportunityId}` : "/applications")}>Annuler</Link>
          </Button>
          <Button onClick={() => submit(false)} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {mode === "edit" ? "Enregistrer" : mode === "review" ? "Créer la candidature" : "Créer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
