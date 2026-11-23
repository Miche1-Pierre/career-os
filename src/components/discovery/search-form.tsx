"use client";

import { useState } from "react";
import { Briefcase, Home, Plus, Radar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateInput, FormField, NumberInput, TagInput } from "@/components/app/fields";
import { PlaceInput } from "@/components/app/place-input";
import { useAction } from "@/hooks/use-action";
import { createSearchAction, detectCareersBoardAction, runSearchAction } from "@/app/actions/discovery";
import { HOUSING_TYPES_SEARCH, SCHEDULES, SCHEDULE_LABEL, searchName, type Ats, type CompanyBoard, type DiscoverySource, type Schedule } from "@/lib/discovery";
import { HOUSING_TYPE_LABEL } from "@/lib/relocation";
import { cn } from "@/lib/utils";

export interface SearchMoveOption {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  workAddress: string | null;
  currency: string;
}

/** What a form starts with (from a quick action, or from Claude in the chat). */
export interface SearchFormInitial {
  domain: "JOBS" | "HOUSING";
  criteria?: Record<string, unknown>;
  moveId?: string | null;
  useAgent?: boolean;
  schedule?: Schedule;
}

export interface SearchFormResult {
  id: string;
  name: string;
  domain: "JOBS" | "HOUSING";
  /** Installation of a housing search (where the listings land). */
  moveId?: string | null;
  run: { status: string; resultsNew: number; resultsFound: number; error: string | null } | null;
}

interface SearchFormProps {
  initial?: SearchFormInitial | null;
  moves: SearchMoveOption[];
  sources: DiscoverySource[];
  adzunaReady: boolean;
  onCancel?: () => void;
  onDone?: (result: SearchFormResult) => void;
  /** Launch the search right after saving it (the chat flow). */
  runAfterSave?: boolean;
  compact?: boolean;
}

const ATS_LABEL: Record<Ats, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

/**
 * Job or housing search criteria. Used in the « Nouvelle recherche » dialog and inline in the chat, where Claude
 * pre-fills it from the request and the user completes and launches it.
 */
export function SearchForm({ initial, moves, sources, adzunaReady, onCancel, onDone, runAfterSave = false, compact = false }: SearchFormProps) {
  const initialDomain = initial?.domain ?? "JOBS";
  const ic = (initial?.criteria ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const { run, pending } = useAction();
  const [running, setRunning] = useState(false);
  const [domain, setDomain] = useState<"JOBS" | "HOUSING">(initialDomain);
  const [schedule, setSchedule] = useState<Schedule>(initial?.schedule ?? "OFF");
  const [useAgent, setUseAgent] = useState(initial?.useAgent ?? initialDomain === "HOUSING");
  // Jobs
  const [keywords, setKeywords] = useState<string[]>(strings(ic.keywords));
  const [exclude, setExclude] = useState<string[]>(strings(ic.excludeKeywords));
  const [locations, setLocations] = useState<string[]>(strings(ic.locations));
  const [countries, setCountries] = useState<string[]>(strings(ic.countries).map((c) => c.toUpperCase().slice(0, 2)));
  const [remoteOk, setRemoteOk] = useState(typeof ic.remoteOk === "boolean" ? ic.remoteOk : true);
  const [companies, setCompanies] = useState<(CompanyBoard & { jobs: number | null })[]>(() =>
    Array.isArray(ic.companies) ? (ic.companies as CompanyBoard[]).filter((c) => c && c.slug && c.ats).map((c) => ({ ...c, jobs: null })) : [],
  );
  const [careersUrl, setCareersUrl] = useState("");
  const [careersError, setCareersError] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const apiSources = sources.filter((s) => s.domain === "JOBS" && s.access === "API");
  const [picked, setPicked] = useState<string[]>(apiSources.filter((s) => s.key !== "adzuna" || adzunaReady).map((s) => s.key));
  // Housing
  const [moveId, setMoveId] = useState((initial?.moveId && moves.some((m) => m.id === initial.moveId) ? initial.moveId : moves[0]?.id) ?? "");
  const move = moves.find((m) => m.id === moveId) ?? null;
  const [city, setCity] = useState(typeof ic.city === "string" ? ic.city : (move?.city ?? ""));
  const [maxTotal, setMaxTotal] = useState<number | null>(typeof ic.maxTotalMonthly === "number" ? ic.maxTotalMonthly : null);
  const [furnished, setFurnished] = useState<"REQUIRED" | "PREFERRED" | "ANY">(ic.furnished === "PREFERRED" || ic.furnished === "ANY" ? ic.furnished : "REQUIRED");
  const [types, setTypes] = useState<string[]>(strings(ic.types).length ? strings(ic.types) : ["ROOM_COLIVING", "ROOM_FLATSHARE", "STUDIO"]);
  const [from, setFrom] = useState<string | null>(typeof ic.from === "string" ? ic.from : (move?.arrivalDate ?? null));
  const [to, setTo] = useState<string | null>(typeof ic.to === "string" ? ic.to : (move?.departureDate ?? null));
  const [near, setNear] = useState(typeof ic.near === "string" ? ic.near : (move?.workAddress ?? ""));
  const [cityCoords, setCityCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { run: runDetect, pending: detecting } = useAction();

  const addLocation = (text: string, countryCode?: string | null) => {
    const t = text.trim();
    if (t && !locations.some((l) => l.toLowerCase() === t.toLowerCase())) setLocations([...locations, t]);
    if (countryCode && !countries.includes(countryCode)) setCountries([...countries, countryCode]);
    setLocationDraft("");
  };
  const detectCareers = () => {
    const url = careersUrl.trim();
    if (!url) return;
    setCareersError(null);
    runDetect(() => detectCareersBoardAction(url), {
      onSuccess: (d) => {
        if (!d.boards.length) {
          setCareersError("Pas de page Greenhouse, Lever ou Ashby trouvée sur ce lien. Pour cette entreprise, active plutôt « Claude cherche aussi sur le web ».");
          return;
        }
        const fresh = d.boards.filter((b) => !companies.some((c) => c.ats === b.ats && c.slug.toLowerCase() === b.slug.toLowerCase()));
        setCompanies([...companies, ...fresh]);
        setCareersUrl("");
      },
    });
  };
  const [notes, setNotes] = useState(typeof ic.notes === "string" ? ic.notes : "");

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

  const boards = companies.map(({ name, ats, slug }) => ({ name, ats, slug }));
  const autoName =
    domain === "JOBS"
      ? searchName({ domain, criteria: { keywords, locations, remoteOk, companies: boards } })
      : searchName({ domain, criteria: { city: city.trim(), types: types as (typeof HOUSING_TYPES_SEARCH)[number][], maxTotalMonthly: maxTotal, currency: move?.currency ?? "EUR" } });
  const valid = domain === "JOBS" ? keywords.length > 0 : !!moveId && !!city.trim();
  const submit = () => {
    const payload =
      domain === "JOBS"
        ? { domain, schedule, useAgent, sources: picked, criteria: { keywords, excludeKeywords: exclude, locations, countries, remoteOk, companies: boards } }
        : {
            domain,
            schedule,
            useAgent,
            moveId,
            criteria: { city: city.trim(), maxTotalMonthly: maxTotal, currency: move?.currency ?? "EUR", furnished, types, from, to, near: near.trim() || null, notes: notes.trim() || null },
          };
    run(() => createSearchAction(payload), {
      success: runAfterSave ? undefined : "Recherche enregistrée",
      onSuccess: async (d) => {
        if (!runAfterSave) return onDone?.({ id: d.id, name: autoName, domain, moveId: domain === "HOUSING" ? moveId : null, run: null });
        setRunning(true);
        const r = await runSearchAction(d.id);
        setRunning(false);
        onDone?.({ id: d.id, name: autoName, domain, moveId: domain === "HOUSING" ? moveId : null, run: r.ok ? r.data : { status: "FAILED", resultsNew: 0, resultsFound: 0, error: r.error } });
      },
    });
  };

  return (
    <div className={cn("space-y-4", compact && "text-sm")}>
      <ToggleGroup type="single" value={domain} onValueChange={(v) => v && (setDomain(v as "JOBS" | "HOUSING"), setUseAgent(v === "HOUSING"))} variant="outline">
        <ToggleGroupItem value="JOBS">
          <Briefcase /> Offres d’emploi
        </ToggleGroupItem>
        <ToggleGroupItem value="HOUSING" disabled={!moves.length}>
          <Home /> Logement
        </ToggleGroupItem>
      </ToggleGroup>

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
              <div className="space-y-1.5">
                <PlaceInput
                  mode="city"
                  value={locationDraft}
                  onChange={setLocationDraft}
                  clearOnSelect
                  onSelect={(p) => addLocation(p.city ?? p.title, p.countryCode)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLocation(locationDraft);
                    }
                  }}
                  placeholder="Bruxelles, Paris…"
                />
                {locations.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {locations.map((l) => (
                      <Badge key={l} size="sm" variant="outline" className="gap-1 pr-1">
                        {l}
                        <button type="button" onClick={() => setLocations(locations.filter((x) => x !== l))} aria-label={`Retirer ${l}`} className="rounded-full hover:bg-hover">
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </FormField>
            <FormField label="Pays (codes)" hint="Ajoutés avec les lieux ; servent à Adzuna et aux liens">
              <TagInput value={countries} onChange={(l) => setCountries(l.map((x) => x.toUpperCase().slice(0, 2)))} placeholder="BE" />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={remoteOk} onCheckedChange={setRemoteOk} /> Accepter le télétravail hors de ces lieux
          </label>
          <FormField label="Entreprises à suivre" hint="Colle le lien de leur page carrières : si elle passe par Greenhouse, Lever ou Ashby, leurs offres seront lues directement.">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={careersUrl}
                  onChange={(e) => {
                    setCareersUrl(e.target.value);
                    setCareersError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      detectCareers();
                    }
                  }}
                  placeholder="https://mistral.ai/careers"
                />
                <Button variant="outline" onClick={detectCareers} disabled={!careersUrl.trim() || detecting}>
                  {detecting ? <Spinner /> : <Plus />} Ajouter
                </Button>
              </div>
              {careersError && <p className="text-xs text-warning-700">{careersError}</p>}
              {companies.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {companies.map((c) => (
                    <Badge key={`${c.ats}:${c.slug}`} variant="outline" className="gap-1.5 pr-1" title={`${ATS_LABEL[c.ats]} · ${c.slug}`}>
                      {c.name}
                      <span className="text-muted-foreground">{c.jobs === null ? ATS_LABEL[c.ats] : `${c.jobs} offre${c.jobs > 1 ? "s" : ""}`}</span>
                      <button type="button" onClick={() => setCompanies(companies.filter((x) => x !== c))} aria-label={`Retirer ${c.name}`} className="rounded-full hover:bg-hover">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </FormField>
          <FormField label="Sources">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {apiSources.map((s) => {
                const disabled = s.key === "adzuna" && !adzunaReady;
                return (
                  <label key={s.key} className={cn("flex items-start gap-2 rounded-lg border border-border px-2.5 py-2 text-sm", disabled && "opacity-60")} title={s.note}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={disabled}
                      checked={picked.includes(s.key)}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, s.key] : picked.filter((k) => k !== s.key))}
                    />
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
              <PlaceInput
                mode="city"
                value={city}
                onChange={setCity}
                onSelect={(p) => {
                  setCity(p.city ?? p.title);
                  setCityCoords({ lat: p.lat, lng: p.lng });
                }}
                placeholder="Bruxelles"
              />
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
            <PlaceInput value={near} onChange={setNear} near={cityCoords} placeholder="Adresse du bureau, une gare…" />
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
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-separator pt-3">
        {valid ? <p className="mr-auto min-w-0 truncate text-xs text-muted-foreground">Enregistrée sous « {autoName} »</p> : null}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={pending || running}>
            Annuler
          </Button>
        )}
        <Button variant="highlight" onClick={submit} disabled={!valid || pending || running}>
          {running ? (
            <>
              <Spinner /> Recherche en cours…
            </>
          ) : runAfterSave ? (
            <>
              <Radar /> Lancer la recherche
            </>
          ) : (
            "Enregistrer"
          )}
        </Button>
      </div>
    </div>
  );
}
