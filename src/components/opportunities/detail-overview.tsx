"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProvenanceMark, UnknownValue } from "@/components/app/badges";
import { Markdown } from "@/components/app/markdown";
import { useAppData } from "@/components/app/app-data";
import { CONTRACT_LABEL, EDUCATION_FORMAT_LABEL, LINK_KIND_LABEL, REMOTE_LABEL, familyOf, sourceLabel } from "@/lib/constants";
import { formatISODate } from "@/lib/dates";
import { canonicalSkill, type SkillMatch } from "@/lib/matching";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

function DetailRow({ label, value, provenanceKey, opp }: { label: string; value: React.ReactNode; provenanceKey?: string; opp: OpportunityDetail }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
        {label}
        {provenanceKey && <ProvenanceMark provenance={opp.provenance?.[provenanceKey]} />}
      </span>
      <span className="min-w-0 text-right break-words">{value ?? <UnknownValue />}</span>
    </div>
  );
}

function ListBlock({ title, items, provenanceKey, opp, chips, matched }: { title: string; items: string[]; provenanceKey: string; opp: OpportunityDetail; chips?: boolean; matched?: Set<string> }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-1 heading-sm text-foreground">
        {title} <ProvenanceMark provenance={opp.provenance?.[provenanceKey]} />
      </h3>
      {chips ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => {
            const hit = matched?.has(canonicalSkill(item));
            return (
              <span
                key={item}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs",
                  matched ? (hit ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "border-dashed text-muted-foreground") : "bg-muted-background",
                )}
                title={matched ? (hit ? "In your profile" : "Not in your profile") : undefined}
              >
                {item}
              </span>
            );
          })}
        </div>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DetailOverview({ opp, skillMatch }: { opp: OpportunityDetail; skillMatch: SkillMatch }) {
  const { dateLocale } = useAppData();
  const [showDescription, setShowDescription] = useState(false);
  const family = familyOf(opp.type);
  const d = opp.details ?? {};
  const matched = new Set(skillMatch.matched.map(canonicalSkill));
  const salary = d.salaryMin || d.salaryMax ? `${d.salaryMin?.toLocaleString("fr-FR") ?? "?"} – ${d.salaryMax?.toLocaleString("fr-FR") ?? "?"} ${d.salaryCurrency ?? ""}` : null;

  return (
    <div className="space-y-6">
      {opp.summary && (
        <div className="surface p-4">
          <div className="mb-1 flex items-center gap-1 heading-sm text-foreground">
            Summary <ProvenanceMark provenance={opp.provenance?.summary} />
          </div>
          <p className="text-sm leading-relaxed">{opp.summary}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface px-4 py-2">
          <h3 className="py-1.5 heading-sm text-foreground">Details</h3>
          <div className="divide-y divide-separator">
            <DetailRow opp={opp} label="Location" value={[opp.locationCity, opp.locationCountry].filter(Boolean).join(", ") || null} provenanceKey="locationCity" />
            {family === "JOB" ? (
              <>
                <DetailRow opp={opp} label="Remote" value={opp.remotePolicy ? REMOTE_LABEL[opp.remotePolicy] : null} provenanceKey="remotePolicy" />
                <DetailRow opp={opp} label="Contract" value={d.contractType ? CONTRACT_LABEL[d.contractType] : null} provenanceKey="details.contractType" />
                <DetailRow opp={opp} label="Seniority" value={d.seniority} provenanceKey="details.seniority" />
                <DetailRow opp={opp} label="Experience" value={d.experienceYears != null ? `${d.experienceYears}+ years` : null} provenanceKey="details.experienceYears" />
                <DetailRow opp={opp} label="Salary" value={salary ?? d.salaryText} provenanceKey="details.salaryMin" />
                {d.salaryText && salary && <DetailRow opp={opp} label="As written" value={<span className="text-muted-foreground">{d.salaryText}</span>} provenanceKey="details.salaryText" />}
                <DetailRow opp={opp} label="Team" value={d.department} provenanceKey="details.department" />
                <DetailRow opp={opp} label="Start" value={d.startDate} provenanceKey="details.startDate" />
                {d.duration && <DetailRow opp={opp} label="Duration" value={d.duration} provenanceKey="details.duration" />}
              </>
            ) : (
              <>
                <DetailRow opp={opp} label="Department" value={d.department} provenanceKey="details.department" />
                <DetailRow opp={opp} label="Level" value={d.level} provenanceKey="details.level" />
                <DetailRow opp={opp} label="Intake" value={d.entryYear} provenanceKey="details.entryYear" />
                <DetailRow opp={opp} label="Format" value={d.format ? EDUCATION_FORMAT_LABEL[d.format] : null} provenanceKey="details.format" />
                <DetailRow opp={opp} label="Duration" value={d.duration} provenanceKey="details.duration" />
                <DetailRow opp={opp} label="Language" value={d.teachingLanguage} provenanceKey="details.teachingLanguage" />
                <DetailRow opp={opp} label="Language level" value={d.languageRequirement} provenanceKey="details.languageRequirement" />
                <DetailRow opp={opp} label="Tuition" value={d.tuitionFees} provenanceKey="details.tuitionFees" />
                <DetailRow opp={opp} label="Application fee" value={d.applicationFee} provenanceKey="details.applicationFee" />
                <DetailRow opp={opp} label="Work-study" value={d.alternance == null ? null : d.alternance ? "Possible" : "No"} provenanceKey="details.alternance" />
              </>
            )}
            <DetailRow opp={opp} label="Source" value={opp.source ? `${sourceLabel(opp.source)}${opp.sourceDetail ? ` — ${opp.sourceDetail}` : ""}` : null} provenanceKey="source" />
            {opp.applicationOpensAt && <DetailRow opp={opp} label="Applications open" value={formatISODate(opp.applicationOpensAt, "medium", dateLocale)} provenanceKey="applicationOpensAt" />}
          </div>
        </div>
        <div className="space-y-5">
          <ListBlock title="Skills" items={opp.skills} provenanceKey="skills" opp={opp} chips matched={matched} />
          <ListBlock title="Technologies" items={opp.technologies} provenanceKey="technologies" opp={opp} chips matched={matched} />
          <ListBlock title="Required documents" items={opp.requiredDocuments} provenanceKey="requiredDocuments" opp={opp} />
          {family === "EDUCATION" && <ListBlock title="Subjects" items={d.subjects ?? []} provenanceKey="details.subjects" opp={opp} chips />}
          {family === "EDUCATION" && <ListBlock title="Career outcomes" items={d.careerOutcomes ?? []} provenanceKey="details.careerOutcomes" opp={opp} />}
          {(opp.url || opp.links.length > 0) && (
            <div className="space-y-1.5">
              <h3 className="heading-sm text-foreground">Links</h3>
              <ul className="space-y-1 text-sm">
                {opp.url && (
                  <li>
                    <a href={opp.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="size-3.5" /> {family === "EDUCATION" ? "Program page" : "Job posting"}
                    </a>
                  </li>
                )}
                {opp.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="size-3.5" /> {l.label || LINK_KIND_LABEL[l.kind]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListBlock title={family === "EDUCATION" ? "Program content" : "Responsibilities"} items={opp.responsibilities} provenanceKey="responsibilities" opp={opp} />
        <ListBlock title="Requirements" items={opp.requirements} provenanceKey="requirements" opp={opp} />
        <ListBlock title="Nice to have" items={opp.niceToHave} provenanceKey="niceToHave" opp={opp} />
        <ListBlock title="Benefits" items={opp.benefits} provenanceKey="benefits" opp={opp} />
      </div>

      {opp.description && (
        <div className="surface">
          <button type="button" onClick={() => setShowDescription((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold">
            <span className="flex items-center gap-2">
              <FileSearch className="size-4 text-muted-foreground" /> Full description
              {opp.capture && <span className="text-xs font-normal text-muted-foreground">— original capture kept for reference</span>}
            </span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showDescription && "rotate-180")} />
          </button>
          {showDescription && (
            <div className="max-h-[70vh] overflow-y-auto border-t border-separator px-4 py-3">
              {/^#|\n[-*] |\*\*/.test(opp.description) ? <Markdown>{opp.description}</Markdown> : <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{opp.description}</pre>}
            </div>
          )}
        </div>
      )}
      {opp.capture && (
        <p className="text-xs text-muted-foreground">
          Captured via {opp.capture.sourceType.toLowerCase()}
          {opp.capture.fileName ? ` (${opp.capture.fileName})` : ""} on {formatISODate(String(opp.capture.createdAt).slice(0, 10), "medium", dateLocale)} —{" "}
          <a href={`/inbox/${opp.capture.id}`} className="underline underline-offset-2">
            view original capture
          </a>
          .
        </p>
      )}
      {!opp.summary && !opp.skills.length && !opp.requirements.length && !opp.responsibilities.length && (
        <div className="rounded-2xl border border-separator bg-muted-background p-6 text-center text-sm text-muted-foreground">
          No details yet.{" "}
          <Button variant="link" className="h-auto p-0" asChild>
            <a href={`/applications/${opp.id}/edit`}>Edit the opportunity</a>
          </Button>{" "}
          or paste the posting in Quick import to fill it automatically.
        </div>
      )}
    </div>
  );
}
