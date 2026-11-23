"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Briefcase, CheckCircle2, ExternalLink, Home, MoreHorizontal, Play, Plus, Radar, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { DateInput, FormField, NumberInput, TagInput } from "@/components/app/fields";
import { EmptyState } from "@/components/app/empty-state";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { createSearchAction, deleteSearchAction, runSearchAction, updateSearchAction } from "@/app/actions/discovery";
import { ATS, HOUSING_TYPES_SEARCH, SCHEDULES, SCHEDULE_LABEL, type Ats, type DiscoverySource, type Schedule } from "@/lib/discovery";
import { HOUSING_TYPE_LABEL } from "@/lib/relocation";
import type { SearchView } from "@/server/services/discovery";
import { cn } from "@/lib/utils";

interface MoveOption {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  workAddress: string | null;
  currency: string;
}

const ATS_LABEL: Record<Ats, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

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
  const { run, pending } = useAction();
  const [domain, setDomain] = useState<"JOBS" | "HOUSING">(initialDomain);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState<Schedule>("OFF");
  const [useAgent, setUseAgent] = useState(initialDomain === "HOUSING");
  // Jobs
  const [keywords, setKeywords] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [remoteOk, setRemoteOk] = useState(true);
  const [companies, setCompanies] = useState<{ name: string; ats: Ats; slug: string }[]>([]);
  const apiSources = sources.filter((s) => s.domain === "JOBS" && s.access === "API");
  const [picked, setPicked] = useState<string[]>(apiSources.filter((s) => s.key !== "adzuna" || adzunaReady).map((s) => s.key));
  // Housing
  const [moveId, setMoveId] = useState(moves[0]?.id ?? "");
  const move = moves.find((m) => m.id === moveId) ?? null;
  const [city, setCity] = useState(move?.city ?? "");
  const [maxTotal, setMaxTotal] = useState<number | null>(null);
  const [furnished, setFurnished] = useState<"REQUIRED" | "PREFERRED" | "ANY">("REQUIRED");
  const [types, setTypes] = useState<string[]>(["ROOM_COLIVING", "ROOM_FLATSHARE", "STUDIO"]);
  const [from, setFrom] = useState<string | null>(move?.arrivalDate ?? null);
  const [to, setTo] = useState<string | null>(move?.departureDate ?? null);
  const [near, setNear] = useState(move?.workAddress ?? "");
  const [notes, setNotes] = useState("");

  const pickMove = (id: string) => {
    setMoveId(id);
    const m = moves.find((x) => x.id === id);
    if (m) {
      setCity(m.city ?? "");
      setFrom(m.arrivalDate);
      setTo(m.departureDate);
      setNear(m.workAddress ?? "");
    }
  };

  const valid = domain === "JOBS" ? keywords.length > 0 && name.trim() : moveId && city.trim() && name.trim();
  const submit = () => {
    const payload =
      domain === "JOBS"
        ? { domain, name: name.trim(), schedule, useAgent, sources: picked, criteria: { keywords, excludeKeywords: exclude, locations, countries, remoteOk, companies: companies.filter((c) => c.name && c.slug) } }
        : { domain, name: name.trim(), schedule, useAgent, moveId, criteria: { city: city.trim(), maxTotalMonthly: maxTotal, currency: move?.currency ?? "EUR", furnished, types, from, to, near: near.trim() || null, notes: notes.trim() || null } };
    run(() => createSearchAction(payload), { success: "Recherche enregistrée", onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle recherche</DialogTitle>
          <DialogDescription>Rien n’est envoyé à personne : la recherche lit des pages publiques et range les résultats chez toi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ToggleGroup type="single" value={domain} onValueChange={(v) => v && (setDomain(v as "JOBS" | "HOUSING"), setUseAgent(v === "HOUSING"))} variant="outline">
            <ToggleGroupItem value="JOBS">
              <Briefcase /> Offres d’emploi
            </ToggleGroupItem>
            <ToggleGroupItem value="HOUSING" disabled={!moves.length}>
              <Home /> Logement
            </ToggleGroupItem>
          </ToggleGroup>
          <FormField label="Nom">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={domain === "JOBS" ? "Forward Deployed Engineer · Bruxelles" : "Colocs meublées près du bureau"} />
          </FormField>

          {domain === "JOBS" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Mots-clés (dans le titre)" hint="Une offre doit en contenir au moins un">
                  <TagInput value={keywords} onChange={setKeywords} placeholder="AI engineer, full-stack…" />
                </FormField>
                <FormField label="À exclure">
                  <TagInput value={exclude} onChange={setExclude} placeholder="senior, stage…" />
                </FormField>
                <FormField label="Lieux">
                  <TagInput value={locations} onChange={setLocations} placeholder="Bruxelles, Paris…" />
                </FormField>
                <FormField label="Pays (codes)" hint="FR, BE, CA… pour Adzuna et les liens">
                  <TagInput value={countries} onChange={(l) => setCountries(l.map((x) => x.toUpperCase().slice(0, 2)))} placeholder="BE" />
                </FormField>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={remoteOk} onCheckedChange={setRemoteOk} /> Accepter le télétravail hors de ces lieux
              </label>
              <FormField label="Entreprises suivies" hint="Leur page carrières Greenhouse, Lever ou Ashby (identifiant dans l’adresse : boards.greenhouse.io/identifiant)">
                <div className="space-y-2">
                  {companies.map((c, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto] gap-2">
                      <Input value={c.name} onChange={(e) => setCompanies(companies.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Entreprise" />
                      <Select value={c.ats} onValueChange={(v) => setCompanies(companies.map((x, j) => (j === i ? { ...x, ats: v as Ats } : x)))}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATS.map((a) => (
                            <SelectItem key={a} value={a}>
                              {ATS_LABEL[a]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={c.slug} onChange={(e) => setCompanies(companies.map((x, j) => (j === i ? { ...x, slug: e.target.value.trim() } : x)))} placeholder="identifiant" />
                      <Button size="icon" variant="ghost" onClick={() => setCompanies(companies.filter((_, j) => j !== i))} aria-label="Retirer">
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button size="xs" variant="outline" onClick={() => setCompanies([...companies, { name: "", ats: "greenhouse", slug: "" }])}>
                    <Plus /> Entreprise
                  </Button>
                </div>
              </FormField>
              <FormField label="Sources">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {apiSources.map((s) => {
                    const disabled = s.key === "adzuna" && !adzunaReady;
                    return (
                      <label key={s.key} className={cn("flex items-start gap-2 rounded-lg border border-border px-2.5 py-2 text-sm", disabled && "opacity-60")} title={s.note}>
                        <input type="checkbox" className="mt-0.5" disabled={disabled} checked={picked.includes(s.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.key] : picked.filter((k) => k !== s.key))} />
                        <span>
                          {s.name}
                          {disabled && <span className="block text-xs text-muted-foreground">Clé gratuite à ajouter (ADZUNA_APP_ID, ADZUNA_APP_KEY)</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </FormField>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Installation">
                  <Select value={moveId} onValueChange={pickMove}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {moves.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Ville">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </FormField>
                <FormField label={`Budget total / mois (${move?.currency ?? "EUR"})`}>
                  <NumberInput value={maxTotal} onChange={setMaxTotal} />
                </FormField>
                <FormField label="Meublé">
                  <Select value={furnished} onValueChange={(v) => setFurnished(v as typeof furnished)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REQUIRED">Obligatoire</SelectItem>
                      <SelectItem value="PREFERRED">De préférence</SelectItem>
                      <SelectItem value="ANY">Peu importe</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Du">
                  <DateInput value={from} onChange={setFrom} />
                </FormField>
                <FormField label="Au">
                  <DateInput value={to} onChange={setTo} />
                </FormField>
              </div>
              <FormField label="Types">
                <ToggleGroup type="multiple" value={types} onValueChange={setTypes} variant="outline" className="flex-wrap">
                  {HOUSING_TYPES_SEARCH.map((t) => (
                    <ToggleGroupItem key={t} value={t}>
                      {HOUSING_TYPE_LABEL[t]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FormField>
              <FormField label="Près de">
                <Input value={near} onChange={(e) => setNear(e.target.value)} placeholder="Adresse du bureau" />
              </FormField>
              <FormField label="Précisions">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Colocataires respectueux, à pied du bureau…" />
              </FormField>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm">
              <Switch checked={useAgent} onCheckedChange={setUseAgent} className="mt-0.5" />
              <span>
                Claude cherche aussi sur le web
                <span className="block text-xs text-muted-foreground">{domain === "HOUSING" ? "Indispensable pour le logement (pas d’API publique). " : ""}Consomme ton forfait Claude.</span>
              </span>
            </label>
            <FormField label="Fréquence">
              <Select value={schedule} onValueChange={(v) => setSchedule(v as Schedule)}>
                <SelectTrigger className="w-full">
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
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="highlight" onClick={submit} disabled={!valid || pending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
