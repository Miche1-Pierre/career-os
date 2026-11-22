"use client";

import Link from "next/link";
import { Bot, CheckCircle2, CircleHelp, Loader2, RefreshCw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { analyzeOpportunityAction, clearAnalysisAction } from "@/app/actions/opportunities";
import { formatRelativeInstant } from "@/lib/dates";
import type { SkillMatch } from "@/lib/matching";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

const LEVEL_CLASS = {
  HIGH: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  MEDIUM: "bg-info-50 text-info-800",
  LOW: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  UNKNOWN: "bg-muted text-muted-foreground",
} as const;
const LEVEL_LABEL: Record<string, string> = { HIGH: "élevé", MEDIUM: "moyen", LOW: "faible", UNKNOWN: "inconnu" };

export function DetailAnalysis({ opp, skillMatch, profileHasSkills }: { opp: OpportunityDetail; skillMatch: SkillMatch; profileHasSkills: boolean }) {
  const { ai } = useAppData();
  const { run, pending } = useAction();
  const analysis = opp.analysis;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-separator bg-muted-background px-3 py-2 text-xs text-muted-foreground">
        Analyse purement descriptive — elle met en évidence correspondances et écarts, sans jamais décider s’il faut postuler.
      </div>

      <section className="space-y-3 surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="heading-sm text-foreground">Compétences en commun (instantané, sans IA)</h3>
          {skillMatch.coverage != null && <span className="text-sm font-semibold tabular-nums">{skillMatch.coverage} %</span>}
        </div>
        {!profileHasSkills ? (
          <p className="text-sm text-muted-foreground">
            Ajoutez vos compétences dans{" "}
            <Link href="/settings/profile" className="text-primary underline underline-offset-2">
              Paramètres → Profil
            </Link>{" "}
            pour les comparer à chaque offre.
          </p>
        ) : skillMatch.coverage == null ? (
          <p className="text-sm text-muted-foreground">Aucune compétence ni technologie indiquée sur cette opportunité pour l’instant.</p>
        ) : (
          <>
            <Progress value={skillMatch.coverage} className="h-1.5" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">En commun ({skillMatch.matched.length})</p>
                <div className="flex flex-wrap gap-1">
                  {skillMatch.matched.map((s) => (
                    <span key={s} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Absentes de votre profil ({skillMatch.missing.length})</p>
                <div className="flex flex-wrap gap-1">
                  {skillMatch.missing.map((s) => (
                    <span key={s} className="rounded-lg border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 heading-sm text-foreground">
            <Sparkles className="size-4 text-highlight-500" /> Analyse détaillée
          </h3>
          <div className="flex gap-2">
            {analysis && (
              <Button size="sm" variant="ghost" onClick={() => run(() => clearAnalysisAction(opp.id), { success: "Analyse supprimée" })}>
                <Trash2 /> Effacer
              </Button>
            )}
            {ai.available && (
              <Button size="sm" onClick={() => run(() => analyzeOpportunityAction(opp.id), { success: "Analyse prête" })} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : analysis ? <RefreshCw /> : <Sparkles />}
                {pending ? "Analyse… (jusqu’à une minute)" : analysis ? "Réanalyser" : "Analyser avec l’IA"}
              </Button>
            )}
          </div>
        </div>
        {!analysis ? (
          <div className="rounded-2xl border border-separator bg-muted-background p-6 text-sm text-muted-foreground">
            {ai.available ? (
              "Lancez une analyse pour comparer cette opportunité à votre profil, critère par critère."
            ) : (
              <>
                L’IA intégrée n’est pas configurée. Depuis Claude Code (dans C:\Candidature), demandez :
                <code className="mt-2 block rounded bg-muted px-2 py-1 text-xs">Analyse l&apos;opportunité {opp.organization?.name ?? opp.title} par rapport à mon profil et enregistre l&apos;analyse</code>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{analysis.summary}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {analysis.dimensions.map((d) => (
                <div key={d.key} className="space-y-2 surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="flex items-center gap-2">
                      {d.score != null && <span className="text-sm font-semibold tabular-nums">{d.score} %</span>}
                      <span className={cn("rounded-lg px-1.5 text-xs font-medium font-medium", LEVEL_CLASS[d.level])}>{LEVEL_LABEL[d.level] ?? d.level.toLowerCase()}</span>
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{d.rationale}</p>
                  {d.matched.length > 0 && (
                    <p className="flex flex-wrap gap-1 text-xs">
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      {d.matched.join(" · ")}
                    </p>
                  )}
                  {d.gaps.length > 0 && (
                    <p className="flex flex-wrap gap-1 text-xs text-info-800">
                      <TriangleAlert className="size-3.5" />
                      {d.gaps.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ListCard title="Écarts potentiels" items={analysis.potentialGaps} icon={<TriangleAlert className="size-3.5 text-amber-500" />} />
              <ListCard title="Questions à clarifier" items={analysis.questionsToClarify} icon={<CircleHelp className="size-3.5 text-sky-500" />} />
              <ListCard title="Points à mettre en avant" items={analysis.talkingPoints} icon={<CheckCircle2 className="size-3.5 text-emerald-500" />} />
              <ListCard title="Documents suggérés" items={analysis.suggestedDocuments} />
            </div>
            {analysis.caveats.length > 0 && <p className="text-xs text-muted-foreground">Limites : {analysis.caveats.join(" ")}</p>}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Bot className="size-3" /> {analysis.by === "CLAUDE" ? "Claude (MCP)" : analysis.by === "DEMO" ? "Démo" : "IA intégrée"}
              {analysis.model ? ` · ${analysis.model}` : ""} · {analysis.promptVersion} · {formatRelativeInstant(analysis.generatedAt)}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ListCard({ title, items, icon }: { title: string; items: string[]; icon?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="surface p-3">
      <p className="mb-2 heading-sm text-foreground">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            {icon ?? <span className="text-muted-foreground">•</span>}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
