"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Briefcase, CheckCircle2, ExternalLink, Home, MoreHorizontal, Play, Plus, Radar, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { deleteSearchAction, runSearchAction, updateSearchAction } from "@/app/actions/discovery";
import { SCHEDULES, SCHEDULE_LABEL, type DiscoverySource, type Schedule } from "@/lib/discovery";
import { SearchForm, type SearchMoveOption } from "./search-form";
import type { SearchView } from "@/server/services/discovery";
import { cn } from "@/lib/utils";

type MoveOption = SearchMoveOption;

export function SearchesView({ searches, moves, sources, adzunaReady, openNew }: { searches: SearchView[]; moves: MoveOption[]; sources: DiscoverySource[]; adzunaReady: boolean; openNew: "JOBS" | "HOUSING" | null }) {
  const [creating, setCreating] = useState<"JOBS" | "HOUSING" | null>(openNew);
  return (
    <PageContainer>
      <PageHeader
        title="Recherches"
        description="Des recherches d’offres et de logements, lancées à la demande ou chaque jour. Les nouvelles offres arrivent dans À trier, les logements dans l’installation."
        actions={
          <Button variant="highlight" onClick={() => setCreating("JOBS")}>
            <Plus /> Nouvelle recherche
          </Button>
        }
      />
      {searches.length === 0 ? (
        <EmptyState icon={Radar} title="Aucune recherche sauvegardée" description="Une recherche lit les pages carrières des entreprises que tu suis, des API d’offres publiques et, si tu le veux, Claude cherche sur le web.">
          <Button variant="outline" onClick={() => setCreating("JOBS")}>
            <Briefcase /> Offres d’emploi
          </Button>
          {moves.length > 0 && (
            <Button variant="outline" onClick={() => setCreating("HOUSING")}>
              <Home /> Logement
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {searches.map((s) => (
            <SearchCard key={s.id} s={s} move={moves.find((m) => m.id === s.moveId) ?? null} />
          ))}
        </div>
      )}
      {creating && <NewSearchDialog key={creating} initialDomain={creating} moves={moves} sources={sources} adzunaReady={adzunaReady} onClose={() => setCreating(null)} />}
    </PageContainer>
  );
}

function SearchCard({ s, move }: { s: SearchView; move: MoveOption | null }) {
  const { dateLocale } = useAppData();
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [running, setRunning] = useState(false);
  const last = s.lastRun;
  const criteria = s.criteria as Record<string, unknown>;
  const summary =
    s.domain === "JOBS"
      ? [((criteria.keywords as string[]) ?? []).join(", "), ((criteria.locations as string[]) ?? []).join(", "), (criteria.companies as unknown[])?.length ? `${(criteria.companies as unknown[]).length} entreprise(s) suivie(s)` : null].filter(Boolean).join(" · ")
      : [criteria.city, criteria.maxTotalMonthly ? `≤ ${criteria.maxTotalMonthly} ${criteria.currency ?? ""}/mois` : null, criteria.furnished === "REQUIRED" ? "meublé" : null].filter(Boolean).join(" · ");
  const launch = () => {
    setRunning(true);
    run(() => runSearchAction(s.id), {
      success: (d) => (d.status === "ERROR" ? `Échec : ${d.error ?? "erreur"}` : d.resultsNew ? `${d.resultsNew} nouveau${d.resultsNew > 1 ? "x" : ""} résultat${d.resultsNew > 1 ? "s" : ""}` : `${d.resultsFound} trouvé${d.resultsFound > 1 ? "s" : ""}, rien de nouveau`),
      onSuccess: () => setRunning(false),
      onError: () => setRunning(false),
    });
  };

  return (
    <section className="surface space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-highlight-50 text-highlight-700">{s.domain === "JOBS" ? <Briefcase className="size-4" /> : <Home className="size-4" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="heading-base text-foreground">{s.name}</h2>
            {s.useAgent && (
              <Badge size="sm" variant="info">
                <Sparkles /> Claude
              </Badge>
            )}
            {move && (
              <Badge size="sm" variant="outline" asChild>
                <Link href={`/moves/${move.id}?tab=housing`}>{move.title}</Link>
              </Badge>
            )}
          </div>
          <p className="truncate copy-sm text-muted-foreground">{summary}</p>
        </div>
        <Select value={s.schedule} onValueChange={(v) => run(() => updateSearchAction(s.id, { schedule: v as Schedule }), { success: "Fréquence mise à jour" })}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULES.map((x) => (
              <SelectItem key={x} value={x}>
                {SCHEDULE_LABEL[x]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={launch} disabled={running || pending}>
          {running ? <Spinner /> : <Play />} Lancer
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Plus d’actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => run(() => updateSearchAction(s.id, { useAgent: !s.useAgent }), { success: s.useAgent ? "Claude désactivé pour cette recherche" : "Claude activé pour cette recherche" })}>
              <Sparkles /> {s.useAgent ? "Ne plus utiliser Claude" : "Utiliser aussi Claude"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                if (await confirm({ title: "Supprimer cette recherche ?", description: "Les résultats déjà ajoutés restent.", confirmLabel: "Supprimer", destructive: true })) run(() => deleteSearchAction(s.id), { success: "Recherche supprimée" });
              }}
            >
              <Trash2 /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {running && <p className="copy-sm text-muted-foreground">Recherche en cours{s.useAgent ? " (Claude lit les pages : plusieurs minutes)" : ""}…</p>}

      {last && (
        <div className="space-y-2 rounded-xl bg-background px-3 py-3">
          <p className="text-xs text-muted-foreground">
            Dernière recherche : {new Date(last.startedAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}
            {last.status === "DONE" ? ` · ${last.resultsFound} trouvé${last.resultsFound > 1 ? "s" : ""}, ${last.resultsNew} nouveau${last.resultsNew > 1 ? "x" : ""}` : last.status === "RUNNING" ? " · en cours" : " · échec"}
            {s.nextRunAt && s.schedule !== "OFF" ? ` · prochaine le ${new Date(s.nextRunAt).toLocaleDateString(dateLocale)}` : ""}
          </p>
          {last.report && <p className="copy-sm text-foreground">{last.report}</p>}
          {last.error && <p className="copy-sm text-warning-700">{last.error}</p>}
          {last.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {last.sources.map((src, i) => (
                <span
                  key={`${src.key}-${i}`}
                  title={src.reason ?? undefined}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", src.ok ? "bg-success-50 text-success-700" : "bg-warning-50 text-warning-700")}
                >
                  {src.ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                  {src.name}
                  {src.ok ? ` · ${src.found}` : ""}
                </span>
              ))}
            </div>
          )}
          {last.resultsNew > 0 && (
            <Button size="xs" variant="link" className="px-0" asChild>
              <Link href={s.domain === "JOBS" ? "/inbox" : `/moves/${s.moveId}?tab=housing`}>Voir les nouveaux résultats</Link>
            </Button>
          )}
          {last.suggestions.length > 0 && (
            <ul className="space-y-1">
              {last.suggestions.map((x) => (
                <li key={x.url} className="text-xs text-muted-foreground">
                  <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline">
                    {x.name}
                  </a>{" "}
                  · {x.why}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {s.links.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">À ouvrir toi-même (connexion ou robots interdits), puis importe ce qui t’intéresse :</p>
          <div className="flex flex-wrap gap-1.5">
            {s.links.map((l) => (
              <Button key={l.key} size="xs" variant="outline" asChild>
                <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.note}>
                  <ExternalLink /> {l.name}
                </a>
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function NewSearchDialog({ initialDomain, moves, sources, adzunaReady, onClose }: { initialDomain: "JOBS" | "HOUSING"; moves: MoveOption[]; sources: DiscoverySource[]; adzunaReady: boolean; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle recherche</DialogTitle>
          <DialogDescription>Rien n’est envoyé à personne : la recherche lit des pages publiques et range les résultats chez toi.</DialogDescription>
        </DialogHeader>
        <SearchForm initial={{ domain: initialDomain }} moves={moves} sources={sources} adzunaReady={adzunaReady} onCancel={onClose} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
