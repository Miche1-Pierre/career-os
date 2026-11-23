"use client";

import { Approx } from "@/components/app/approx";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleHelp, ClipboardCopy, FileSignature, FileText, Minus, Plane, Quote, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DateInput, FormField, NumberInput, TagInput } from "@/components/app/fields";
import { SectionHeader } from "@/components/app/sparkle";
import { useAction } from "@/hooks/use-action";
import { analyzeContractAction, updateOfferAction } from "@/app/actions/opportunities";
import { createMoveFromOpportunityAction } from "@/app/actions/moves";
import { CONTRACT_LABEL, CONTRACT_TYPES, type ContractType } from "@/lib/constants";
import { reviewChecklist, reviewProgress, REVIEW_STATUS_LABEL, type Offer, type ReviewKey, type ReviewStatus } from "@/lib/offer";
import { formatISODate } from "@/lib/dates";
import { useAppData } from "@/components/app/app-data";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

const PERIODS = [
  ["MONTH", "par mois"],
  ["YEAR", "par an"],
  ["DAY", "par jour"],
  ["HOUR", "par heure"],
] as const;

const STATUS_STYLE: Record<ReviewStatus, { icon: React.ComponentType<{ className?: string }>; chip: string }> = {
  TODO: { icon: CircleHelp, chip: "bg-muted-background text-muted-foreground" },
  OK: { icon: Check, chip: "bg-success-50 text-success-700" },
  WARN: { icon: AlertTriangle, chip: "bg-warning-50 text-warning-700" },
  MISSING: { icon: X, chip: "bg-destructive/10 text-destructive" },
  NA: { icon: Minus, chip: "bg-muted-background text-faint" },
};

type Editable = Omit<Offer, "contractAnalysis" | "reviewChecklist">;

/** Offer tab: terms of the offer, contract review checklist, AI contract analysis and link to the installation. */
export function DetailOffer({ opp, move }: { opp: OpportunityDetail; move: { id: string; title: string } | null }) {
  const router = useRouter();
  const { dateLocale } = useAppData();
  const { run, pending } = useAction();
  const offer = opp.offer ?? {};
  const { contractAnalysis: analysis, reviewChecklist: storedChecklist, ...terms } = offer;
  const [v, setV] = useState<Editable>(terms);
  const dirty = JSON.stringify(v) !== JSON.stringify(terms);
  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setV((cur) => ({ ...cur, [key]: value }));

  const candidates = opp.documents
    .map((d) => ({ versionId: d.version.id, name: d.document.name, kind: d.document.kind, fileName: d.version.fileName }))
    .sort((a, b) => Number(b.kind === "CONTRACT" || /contrat|convention|contract/i.test(`${b.name} ${b.fileName ?? ""}`)) - Number(a.kind === "CONTRACT" || /contrat|convention|contract/i.test(`${a.name} ${a.fileName ?? ""}`)));
  const [docId, setDocId] = useState<string | null>(offer.contractDocumentVersionId ?? candidates[0]?.versionId ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const checklist = reviewChecklist(storedChecklist);
  const progress = reviewProgress(storedChecklist);
  const accepted = opp.stage.category === "WON" || opp.stage.category === "OFFER";

  const save = () => run(() => updateOfferAction(opp.id, v), { success: "Offre enregistrée" });
  const setReview = (key: ReviewKey, status: ReviewStatus, note?: string | null) =>
    run(() => updateOfferAction(opp.id, { reviewChecklist: [{ key, status, note: note ?? checklist.find((c) => c.key === key)?.note ?? null, source: "USER" }] }));
  const analyze = () => {
    setAnalyzing(true);
    run(() => analyzeContractAction(opp.id, docId), {
      success: (d) => (d.filled.length ? `Contrat analysé · ${d.filled.length} champ${d.filled.length > 1 ? "s" : ""} de l’offre rempli${d.filled.length > 1 ? "s" : ""}` : "Contrat analysé"),
      onSuccess: () => setAnalyzing(false),
      onError: () => setAnalyzing(false),
    });
  };

  return (
    <div className="space-y-8">
      {/* Terms */}
      <section className="space-y-3">
        <SectionHeader title="Conditions de l’offre" icon={FileSignature} />
        <div className="@container surface space-y-4 px-4 py-4">
          <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
            <FormField label="Type de contrat">
              <Select value={v.contractType ?? ""} onValueChange={(t) => set("contractType", (t || null) as ContractType | null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CONTRACT_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Intitulé exact" className="@3xl:col-span-3">
              <Input value={v.contractLabel ?? ""} onChange={(e) => set("contractLabel", e.target.value || null)} placeholder="Tel qu’écrit sur le contrat" />
            </FormField>
            <FormField label="Net">
              <NumberInput value={v.salaryNet} onChange={(n) => set("salaryNet", n)} />
              <Approx amount={v.salaryNet} currency={v.currency ?? "EUR"} className="block pt-1" />
            </FormField>
            <FormField label="Brut">
              <NumberInput value={v.salaryGross} onChange={(n) => set("salaryGross", n)} />
              <Approx amount={v.salaryGross} currency={v.currency ?? "EUR"} className="block pt-1" />
            </FormField>
            <FormField label="Période">
              <Select value={v.period ?? ""} onValueChange={(p) => set("period", (p || null) as Editable["period"])}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Devise">
              <Input value={v.currency ?? ""} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase() || null)} placeholder="EUR" />
            </FormField>
            <FormField label="Début">
              <DateInput value={v.startDate} onChange={(d) => set("startDate", d)} />
            </FormField>
            <FormField label="Fin">
              <DateInput value={v.endDate} onChange={(d) => set("endDate", d)} />
            </FormField>
            <FormField label="Heures / semaine">
              <NumberInput value={v.hoursPerWeek} onChange={(n) => set("hoursPerWeek", n)} step={0.5} />
            </FormField>
            <FormField label="Chèques-repas / jour">
              <NumberInput value={v.mealVoucherPerDay} onChange={(n) => set("mealVoucherPerDay", n)} step={0.5} />
            </FormField>
            <FormField label="Lieu de travail" className="@lg:col-span-2">
              <Input value={v.workAddress ?? ""} onChange={(e) => set("workAddress", e.target.value || null)} placeholder="Adresse du lieu de travail" />
            </FormField>
            <FormField label="Télétravail" className="@lg:col-span-2">
              <Input value={v.remote ?? ""} onChange={(e) => set("remote", e.target.value || null)} />
            </FormField>
            <FormField label="Période d’essai">
              <Input value={v.trialPeriod ?? ""} onChange={(e) => set("trialPeriod", e.target.value || null)} />
            </FormField>
            <FormField label="Préavis">
              <Input value={v.noticePeriod ?? ""} onChange={(e) => set("noticePeriod", e.target.value || null)} />
            </FormField>
            <FormField label="Congés" className="@lg:col-span-2">
              <Input value={v.paidLeave ?? ""} onChange={(e) => set("paidLeave", e.target.value || null)} />
            </FormField>
            <FormField label="Avantages" className="@lg:col-span-2 @3xl:col-span-4">
              <TagInput value={v.benefits ?? []} onChange={(list) => set("benefits", list)} placeholder="Abonnement transport, mutuelle…" />
            </FormField>
            <FormField label="Répondre avant le">
              <DateInput value={v.decisionDeadline} onChange={(d) => set("decisionDeadline", d)} />
            </FormField>
            <FormField label="Signé le">
              <DateInput value={v.signedAt} onChange={(d) => set("signedAt", d)} />
            </FormField>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-separator pt-3">
            {dirty && <span className="mr-auto text-xs text-muted-foreground">Modifications non enregistrées</span>}
            <Button onClick={save} disabled={!dirty || pending}>
              Enregistrer
            </Button>
          </div>
        </div>
      </section>

      {/* Contract */}
      <section className="space-y-3">
        <SectionHeader title="Contrat" icon={FileText} />
        <div className="surface flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          {candidates.length ? (
            <>
              <Select value={docId ?? ""} onValueChange={setDocId}>
                <SelectTrigger className="w-full sm:max-w-md">
                  <SelectValue placeholder="Choisir le document" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.versionId} value={c.versionId}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="highlight" onClick={analyze} disabled={!docId || analyzing} className="sm:ml-auto">
                {analyzing ? <Spinner /> : <Sparkles />} {analysis ? "Relancer l’analyse" : "Analyser le contrat"}
              </Button>
            </>
          ) : (
            <p className="copy-sm text-muted-foreground">
              Joins le PDF du contrat ou de la convention dans l’onglet{" "}
              <Link href={`/applications/${opp.id}?tab=documents`} className="text-foreground underline">
                Documents
              </Link>{" "}
              pour l’analyser.
            </p>
          )}
        </div>
        {analyzing && <p className="copy-sm text-muted-foreground">Claude lit le contrat (1 à 3 minutes). Tu peux continuer ailleurs, le résultat s’affichera ici.</p>}
      </section>

      {/* Review checklist */}
      <section className="space-y-3">
        <SectionHeader title="Relecture du contrat" description={`${progress.done} sur ${progress.total} vérifiés${progress.warnings ? ` · ${progress.warnings} point${progress.warnings > 1 ? "s" : ""} d’attention` : ""}`} />
        <ul className="overflow-hidden rounded-2xl border border-border bg-background">
          {checklist.map((item) => (
            <ReviewRow key={item.key} item={item} onStatus={(status) => setReview(item.key, status)} onNote={(note) => setReview(item.key, item.status, note)} />
          ))}
        </ul>
      </section>

      {/* Analysis */}
      {analysis && (
        <section className="space-y-4">
          <SectionHeader title="Analyse du contrat" icon={Sparkles} />
          <div className="surface space-y-1 px-4 py-4">
            <p className="copy-sm whitespace-pre-line text-foreground">{analysis.summary}</p>
            <p className="pt-1 text-xs text-faint">
              {analysis.documentName ? `${analysis.documentName} · ` : ""}
              {formatISODate(analysis.generatedAt.slice(0, 10), "medium", dateLocale)}
              {analysis.model ? ` · ${analysis.model}` : ""} · descriptif, ce n’est pas un avis juridique
            </p>
            {analysis.unverifiedTerms.length > 0 && <p className="text-xs text-warning-700">Citation introuvable dans le texte pour : {analysis.unverifiedTerms.join(", ")} (valeurs non reprises dans l’offre).</p>}
          </div>

          {analysis.unfavorable.length > 0 && (
            <Block title="En ta défaveur">
              {analysis.unfavorable.map((u, i) => (
                <li key={i} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge size="sm" variant={u.severity === "HIGH" ? "destructive" : u.severity === "MEDIUM" ? "default" : "outline"}>
                      {u.severity === "HIGH" ? "Important" : u.severity === "MEDIUM" ? "Moyen" : "Mineur"}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{u.title}</span>
                    {u.article && <span className="text-xs text-muted-foreground">{u.article}</span>}
                  </div>
                  <p className="copy-sm text-muted-foreground">{u.detail}</p>
                  {u.evidence && <Citation text={u.evidence} verified={u.verified} />}
                </li>
              ))}
            </Block>
          )}
          {analysis.missing.length > 0 && (
            <Block title="Absent du contrat">
              {analysis.missing.map((m, i) => (
                <li key={i} className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{m.topic}</p>
                  <p className="copy-sm text-muted-foreground">{m.detail}</p>
                </li>
              ))}
            </Block>
          )}
          {analysis.inconsistencies.length > 0 && (
            <Block title="Incohérences">
              {analysis.inconsistencies.map((x, i) => (
                <li key={i} className="px-4 py-3 copy-sm text-foreground">
                  {x.detail}
                  {x.articles.length > 0 && <span className="text-xs text-muted-foreground"> · {x.articles.join(", ")}</span>}
                </li>
              ))}
            </Block>
          )}
          {analysis.questions.length > 0 && (
            <Block title="Questions à poser">
              {analysis.questions.map((q, i) => (
                <li key={i} className="px-4 py-2.5 copy-sm text-foreground">
                  {q}
                </li>
              ))}
            </Block>
          )}
          {analysis.emailDraft && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="label-sm text-foreground">Brouillon de mail</h3>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(analysis.emailDraft).then(
                      () => toast.success("Brouillon copié"),
                      () => toast.error("Copie impossible"),
                    )
                  }
                >
                  <ClipboardCopy /> Copier
                </Button>
              </div>
              <pre className="surface overflow-x-auto px-4 py-3 font-sans text-sm whitespace-pre-wrap text-foreground">{analysis.emailDraft}</pre>
            </div>
          )}
          {analysis.legalNotes.length > 0 && (
            <Block title="Repères légaux (à vérifier sur la source)">
              {analysis.legalNotes.map((n, i) => (
                <li key={i} className="space-y-0.5 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{n.topic}</p>
                  <p className="copy-sm text-muted-foreground">Contrat : {n.contract}</p>
                  <p className="copy-sm text-muted-foreground">
                    Référence : {n.reference}
                    {n.source ? ` (${n.source})` : ""}
                  </p>
                </li>
              ))}
            </Block>
          )}
          {analysis.caveats.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {analysis.caveats.map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Installation */}
      {accepted && (
        <section className="space-y-3">
          <SectionHeader title="Installation" icon={Plane} />
          <div className="surface flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
            <p className="copy-sm text-muted-foreground sm:flex-1">
              {move ? (
                <>
                  Projet{" "}
                  <Link href={`/moves/${move.id}`} className="font-medium text-foreground underline">
                    {move.title}
                  </Link>
                  . Les dates, le lieu de travail, le net et les chèques-repas de l’offre complètent les champs encore vides.
                </>
              ) : (
                "Crée le projet d’installation : dates, lieu de travail, net mensuel et chèques-repas sont repris de l’offre."
              )}
            </p>
            <Button variant="outline" disabled={pending} onClick={() => run(() => createMoveFromOpportunityAction(opp.id), { success: move ? "Installation mise à jour depuis l’offre" : "Installation créée", onSuccess: (d) => !move && router.push(`/moves/${d.id}`) })}>
              <Plane /> {move ? "Mettre à jour depuis l’offre" : "Créer le projet d’installation"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewRow({ item, onStatus, onNote }: { item: ReturnType<typeof reviewChecklist>[number]; onStatus: (s: ReviewStatus) => void; onNote: (note: string | null) => void }) {
  const [note, setNote] = useState(item.note ?? "");
  const style = STATUS_STYLE[item.status];
  const Icon = style.icon;
  return (
    <li className="flex flex-col gap-2 border-b border-separator px-4 py-3 last:border-0 md:flex-row md:items-start">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", style.chip)}>
            <Icon className="size-3" /> {REVIEW_STATUS_LABEL[item.status]}
          </span>
          <span className="text-sm font-medium text-foreground">{item.label}</span>
          {item.article && <span className="text-xs text-muted-foreground">{item.article}</span>}
          {item.source === "AI" && item.status !== "TODO" && (
            <Badge size="sm" variant="info">
              IA
            </Badge>
          )}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (item.note ?? "") && onNote(note.trim() || null)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={item.hint}
          className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-faint focus:text-foreground"
          aria-label={`Note : ${item.label}`}
        />
      </div>
      <div className="flex shrink-0 gap-1">
        {(["OK", "WARN", "MISSING", "NA"] as const).map((s) => {
          const S = STATUS_STYLE[s].icon;
          return (
            <Button key={s} size="icon-xs" variant={item.status === s ? "secondary" : "ghost"} onClick={() => onStatus(item.status === s ? "TODO" : s)} aria-label={REVIEW_STATUS_LABEL[s]} title={REVIEW_STATUS_LABEL[s]}>
              <S />
            </Button>
          );
        })}
      </div>
    </li>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="label-sm text-foreground">{title}</h3>
      <ul className="overflow-hidden rounded-2xl border border-border bg-background [&>li]:border-b [&>li]:border-separator [&>li:last-child]:border-0">{children}</ul>
    </div>
  );
}

function Citation({ text, verified }: { text: string; verified: boolean }) {
  return (
    <p className="flex gap-1.5 text-xs text-muted-foreground italic">
      <Quote className="mt-0.5 size-3 shrink-0" />
      <span>
        {text}
        {!verified && <span className="ml-1 not-italic text-warning-700">(citation non retrouvée dans le texte)</span>}
      </span>
    </p>
  );
}
