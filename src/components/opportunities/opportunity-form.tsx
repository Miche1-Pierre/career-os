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
    <Collapsible open={open} onOpenChange={setOpen} className="surface">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div>
          <div className="heading-sm text-foreground">{title}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-separator px-5 py-5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function OptionalSelect<T extends string>({ value, onChange, options, labels, placeholder = "Unknown" }: { value: T | null | undefined; onChange: (v: T | null) => void; options: readonly T[]; labels: Record<T, string>; placeholder?: string }) {
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
    if (!draft.title.trim()) return void toast.error("A title is required");
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
        toast.success("Saved");
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
      toast.success(captureId ? "Opportunity created from the capture" : "Opportunity created");
      router.push(`/applications/${r.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  const links = draft.links ?? [];
  const setLink = (index: number, patch: Partial<OpportunityLink>) => set("links", links.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      {(warnings.length > 0 || questionsToClarify.length > 0) && (
        <Alert>
          <Info />
          <AlertTitle>Review before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              {questionsToClarify.map((q) => (
                <li key={q} className="text-muted-foreground">
                  To clarify: {q}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Group title="Basics">
        <div className="grid gap-4 md:grid-cols-2">
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
          <FormField label={family === "EDUCATION" ? "Program name" : "Position"} htmlFor="title" provenance={prov("title")} required>
            <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder={family === "EDUCATION" ? "Master Bioinformatics" : "Senior Software Engineer"} />
          </FormField>
          <FormField label={family === "EDUCATION" ? "Institution" : "Company"} provenance={prov("organizationId")}>
            <EntityCombobox
              options={organizations}
              value={{ id: draft.organizationId, name: draft.organizationName }}
              onChange={(v) => {
                setDraft((d) => ({ ...d, organizationId: v.id, organizationName: v.name }));
                setTouched((t) => new Set(t).add("organizationId"));
              }}
              placeholder={family === "EDUCATION" ? "Select or create an institution" : "Select or create a company"}
            />
          </FormField>
          <FormField label="Status">
            <StageSelect pipeline={family} value={statusKey} onChange={(v) => set("status", v)} className="w-full" />
          </FormField>
          <FormField label="Priority">
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
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Source" provenance={prov("source")}>
              <OptionalSelect value={draft.source as (typeof SOURCES)[number] | null} onChange={(v) => set("source", v)} options={SOURCES} labels={SOURCE_LABEL as Record<(typeof SOURCES)[number], string>} placeholder="—" />
            </FormField>
            <FormField label="Source detail">
              <Input value={draft.sourceDetail ?? ""} onChange={(e) => set("sourceDetail", e.target.value || null)} placeholder="Referred by…" />
            </FormField>
          </div>
          <FormField label="Tags" className="md:col-span-2">
            <TagInput value={draft.tags ?? []} onChange={(v) => set("tags", v)} />
          </FormField>
        </div>
      </Group>

      <Group title="Where & when">
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="City" provenance={prov("locationCity")}>
            <Input value={draft.locationCity ?? ""} onChange={(e) => set("locationCity", e.target.value || null)} />
          </FormField>
          <FormField label="Country" provenance={prov("locationCountry")}>
            <Input value={draft.locationCountry ?? ""} onChange={(e) => set("locationCountry", e.target.value || null)} />
          </FormField>
          {family === "JOB" ? (
            <FormField label="Remote policy" provenance={prov("remotePolicy")}>
              <OptionalSelect value={draft.remotePolicy} onChange={(v) => set("remotePolicy", v)} options={REMOTE_POLICIES} labels={REMOTE_LABEL} />
            </FormField>
          ) : (
            <FormField label="Format" provenance={prov("details.format")}>
              <OptionalSelect value={details.format} onChange={(v) => setDetail("format", v)} options={EDUCATION_FORMATS} labels={EDUCATION_FORMAT_LABEL} />
            </FormField>
          )}
          <FormField label="Application deadline" provenance={prov("deadline")}>
            <div className="flex gap-2">
              <DateInput value={draft.deadline} onChange={(v) => set("deadline", v)} />
              <TimeInput value={draft.deadlineTime} onChange={(v) => set("deadlineTime", v)} className="w-28" />
            </div>
          </FormField>
          {family === "EDUCATION" && (
            <FormField label="Applications open" provenance={prov("applicationOpensAt")}>
              <DateInput value={draft.applicationOpensAt} onChange={(v) => set("applicationOpensAt", v)} />
            </FormField>
          )}
          {(mode !== "review" || isSubmitted) && (
            <FormField label="Applied on" hint={isSubmitted && !draft.appliedAt ? "Defaults to today" : undefined}>
              <DateInput value={draft.appliedAt} onChange={(v) => set("appliedAt", v)} />
            </FormField>
          )}
          <FormField label="Answer expected by" hint="Follow-ups wait until after this date">
            <DateInput value={draft.expectedResponseAt} onChange={(v) => set("expectedResponseAt", v)} />
          </FormField>
        </div>
      </Group>

      {family === "JOB" ? (
        <Group title="Contract & compensation">
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Contract" provenance={prov("details.contractType")}>
              <OptionalSelect value={details.contractType} onChange={(v) => setDetail("contractType", v)} options={CONTRACT_TYPES} labels={CONTRACT_LABEL} />
            </FormField>
            <FormField label="Seniority" provenance={prov("details.seniority")}>
              <Input value={details.seniority ?? ""} onChange={(e) => setDetail("seniority", e.target.value || null)} placeholder="Junior, Senior, Lead…" />
            </FormField>
            <FormField label="Experience (years)" provenance={prov("details.experienceYears")}>
              <NumberInput value={details.experienceYears} onChange={(v) => setDetail("experienceYears", v)} />
            </FormField>
            <FormField label="Salary min" provenance={prov("details.salaryMin")}>
              <NumberInput value={details.salaryMin} onChange={(v) => setDetail("salaryMin", v)} placeholder="55000" step={1000} />
            </FormField>
            <FormField label="Salary max" provenance={prov("details.salaryMax")}>
              <NumberInput value={details.salaryMax} onChange={(v) => setDetail("salaryMax", v)} placeholder="68000" step={1000} />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Currency" provenance={prov("details.salaryCurrency")}>
                <Input value={details.salaryCurrency ?? ""} onChange={(e) => setDetail("salaryCurrency", e.target.value.toUpperCase() || null)} placeholder="EUR" />
              </FormField>
              <FormField label="Per">
                <OptionalSelect value={details.salaryPeriod} onChange={(v) => setDetail("salaryPeriod", v)} options={SALARY_PERIODS} labels={{ YEAR: "Year", MONTH: "Month", DAY: "Day", HOUR: "Hour" }} placeholder="—" />
              </FormField>
            </div>
            <FormField label="Salary (as written)" provenance={prov("details.salaryText")} className="md:col-span-2">
              <Input value={details.salaryText ?? ""} onChange={(e) => setDetail("salaryText", e.target.value || null)} />
            </FormField>
            <FormField label="Team / department" provenance={prov("details.department")}>
              <Input value={details.department ?? ""} onChange={(e) => setDetail("department", e.target.value || null)} />
            </FormField>
            <FormField label="Start date" provenance={prov("details.startDate")}>
              <Input value={details.startDate ?? ""} onChange={(e) => setDetail("startDate", e.target.value || null)} placeholder="ASAP, January 2027…" />
            </FormField>
            {(draft.type === "INTERNSHIP" || draft.type === "VIE" || draft.type === "ALTERNANCE") && (
              <FormField label="Duration" provenance={prov("details.duration")}>
                <Input value={details.duration ?? ""} onChange={(e) => setDetail("duration", e.target.value || null)} placeholder="6 months" />
              </FormField>
            )}
          </div>
        </Group>
      ) : (
        <Group title="Program details">
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Faculty / department" provenance={prov("details.department")}>
              <Input value={details.department ?? ""} onChange={(e) => setDetail("department", e.target.value || null)} />
            </FormField>
            <FormField label="Level" provenance={prov("details.level")}>
              <Input value={details.level ?? ""} onChange={(e) => setDetail("level", e.target.value || null)} placeholder="Master 2, MSc, PhD…" />
            </FormField>
            <FormField label="Intake / entry year" provenance={prov("details.entryYear")}>
              <Input value={details.entryYear ?? ""} onChange={(e) => setDetail("entryYear", e.target.value || null)} placeholder="September 2027" />
            </FormField>
            <FormField label="Duration" provenance={prov("details.duration")}>
              <Input value={details.duration ?? ""} onChange={(e) => setDetail("duration", e.target.value || null)} placeholder="2 years" />
            </FormField>
            <FormField label="Teaching language" provenance={prov("details.teachingLanguage")}>
              <Input value={details.teachingLanguage ?? ""} onChange={(e) => setDetail("teachingLanguage", e.target.value || null)} />
            </FormField>
            <FormField label="Language requirement" provenance={prov("details.languageRequirement")}>
              <Input value={details.languageRequirement ?? ""} onChange={(e) => setDetail("languageRequirement", e.target.value || null)} placeholder="IELTS 6.5, B2…" />
            </FormField>
            <FormField label="Tuition fees" provenance={prov("details.tuitionFees")}>
              <Input value={details.tuitionFees ?? ""} onChange={(e) => setDetail("tuitionFees", e.target.value || null)} />
            </FormField>
            <FormField label="Application fee" provenance={prov("details.applicationFee")}>
              <Input value={details.applicationFee ?? ""} onChange={(e) => setDetail("applicationFee", e.target.value || null)} />
            </FormField>
            <FormField label="Work-study (alternance)" provenance={prov("details.alternance")}>
              <Select value={details.alternance == null ? NONE : details.alternance ? "yes" : "no"} onValueChange={(v) => setDetail("alternance", v === NONE ? null : v === "yes")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unknown</SelectItem>
                  <SelectItem value="yes">Possible</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Subjects" provenance={prov("details.subjects")} className="md:col-span-3 lg:col-span-1">
              <ListEditor value={details.subjects ?? []} onChange={(v) => setDetail("subjects", v)} rows={3} />
            </FormField>
            <FormField label="Career outcomes" provenance={prov("details.careerOutcomes")} className="lg:col-span-2">
              <ListEditor value={details.careerOutcomes ?? []} onChange={(v) => setDetail("careerOutcomes", v)} rows={3} />
            </FormField>
          </div>
        </Group>
      )}

      <Group title="Content" description="One item per line — pasting a bulleted list works.">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Summary" provenance={prov("summary")} className="md:col-span-2">
            <Textarea value={draft.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} rows={2} />
          </FormField>
          <FormField label={family === "EDUCATION" ? "Program content / objectives" : "Responsibilities"} provenance={prov("responsibilities")}>
            <ListEditor value={draft.responsibilities ?? []} onChange={(v) => set("responsibilities", v)} />
          </FormField>
          <FormField label="Requirements / prerequisites" provenance={prov("requirements")}>
            <ListEditor value={draft.requirements ?? []} onChange={(v) => set("requirements", v)} />
          </FormField>
          <FormField label="Skills" provenance={prov("skills")}>
            <ListEditor value={draft.skills ?? []} onChange={(v) => set("skills", v)} rows={3} />
          </FormField>
          <FormField label="Technologies" provenance={prov("technologies")}>
            <ListEditor value={draft.technologies ?? []} onChange={(v) => set("technologies", v)} rows={3} />
          </FormField>
          <FormField label="Nice to have" provenance={prov("niceToHave")}>
            <ListEditor value={draft.niceToHave ?? []} onChange={(v) => set("niceToHave", v)} rows={3} />
          </FormField>
          <FormField label="Benefits" provenance={prov("benefits")}>
            <ListEditor value={draft.benefits ?? []} onChange={(v) => set("benefits", v)} rows={3} />
          </FormField>
          <FormField label="Documents required for the application" provenance={prov("requiredDocuments")} hint="Each one becomes a checklist item (CV, letters, transcripts…)." className="md:col-span-2">
            <ListEditor value={draft.requiredDocuments ?? []} onChange={(v) => set("requiredDocuments", v)} rows={3} />
          </FormField>
        </div>
      </Group>

      <Group title="Links">
        <div className="space-y-3">
          <FormField label={family === "EDUCATION" ? "Program page" : "Job posting URL"} provenance={prov("url")}>
            <Input value={draft.url ?? ""} onChange={(e) => set("url", e.target.value || null)} placeholder="https://…" />
          </FormField>
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Select value={link.kind} onValueChange={(v) => setLink(i, { kind: v as OpportunityLink["kind"] })}>
                <SelectTrigger className="w-48 shrink-0">
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
              <Input value={link.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://…" />
              <Button variant="ghost" size="icon" onClick={() => set("links", links.filter((_, j) => j !== i))} aria-label="Remove link">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => set("links", [...links, { kind: "APPLICATION", url: "", label: null }])}>
            <Plus /> Add link
          </Button>
        </div>
      </Group>

      {mode !== "edit" && (
        <Group title="Contacts" description={contacts.length ? "Detected people — uncheck those you don't want to save." : "Recruiter, hiring manager, program director…"}>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="grid items-center gap-2 md:grid-cols-[auto_1fr_1fr_1fr_160px_auto]">
                <Checkbox checked={c.include} onCheckedChange={(v) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, include: !!v } : x)))} />
                <Input value={c.fullName ?? ""} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))} placeholder="Full name" />
                <Input value={c.role ?? ""} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, role: e.target.value, opportunityRole: e.target.value } : x)))} placeholder="Role" />
                <Input value={c.email ?? ""} onChange={(e) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email" />
                <Select value={c.relationship ?? NONE} onValueChange={(v) => setContacts((cs) => cs.map((x, j) => (j === i ? { ...x, relationship: v === NONE ? null : (v as never) } : x)))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Relationship" />
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
                <Button variant="ghost" size="icon" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove contact">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setContacts((cs) => [...cs, { fullName: "", include: true }])}>
              <UserPlus /> Add contact
            </Button>
          </div>
        </Group>
      )}

      <Group title="Description" description={mode === "review" ? "Original text of the capture (kept for reference)." : undefined} defaultOpen={mode !== "review"}>
        <MarkdownEditor value={draft.description ?? ""} onChange={(v) => set("description", v || null)} minRows={10} />
      </Group>

      <Group title="Follow-up rules" defaultOpen={false} description="Leave empty to use your defaults (Settings → Follow-ups).">
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Follow-up interval (days)" hint="0 disables automatic follow-ups for this one">
            <NumberInput value={draft.followUpIntervalDays} onChange={(v) => set("followUpIntervalDays", v == null ? null : Math.max(0, Math.round(v)))} placeholder="Default" />
          </FormField>
          <FormField label="Count business days only">
            <Select value={draft.followUpBusinessDays == null ? NONE : draft.followUpBusinessDays ? "yes" : "no"} onValueChange={(v) => set("followUpBusinessDays", v === NONE ? null : v === "yes")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Default</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Next follow-up (manual)">
            <DateInput value={draft.nextFollowUpAt} onChange={(v) => set("nextFollowUpAt", v)} />
          </FormField>
        </div>
      </Group>

      {duplicates && duplicates.length > 0 && (
        <Alert variant="destructive" className="border-info-200 bg-info-50 text-info-900">
          <AlertTriangle />
          <AlertTitle>Possible duplicate found</AlertTitle>
          <AlertDescription className="text-inherit">
            <ul className="mt-1 space-y-1">
              {duplicates.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/applications/${d.id}`} className="font-medium underline underline-offset-2">
                    {d.organizationName ? `${d.organizationName} — ` : ""}
                    {d.title}
                  </Link>
                  <span className="text-xs opacity-80">
                    {d.reason} · {Math.round(d.score * 100)}% · {d.stageLabel}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/applications/${duplicates[0].id}`}>Open existing</Link>
              </Button>
              <Button size="sm" onClick={() => submit(true)} disabled={saving}>
                Create anyway
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          {submittedStage && <StageBadge label={submittedStage.label} category={submittedStage.category} />}
          {mode === "review" && Object.keys(finalProvenance).length > 0 && <span>{Object.keys(finalProvenance).length} fields filled by AI — edited fields become yours.</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href={onCancelHref ?? (opportunityId ? `/applications/${opportunityId}` : "/applications")}>Cancel</Link>
          </Button>
          <Button onClick={() => submit(false)} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {mode === "edit" ? "Save changes" : mode === "review" ? "Create opportunity" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
