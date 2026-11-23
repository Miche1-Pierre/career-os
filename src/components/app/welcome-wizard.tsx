"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Folder, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CareerOsMark } from "@/components/app/logo";
import { PlaceInput } from "@/components/app/place-input";
import { ApiKeyField } from "@/components/app/api-key-field";
import { completeOnboardingAction } from "@/app/actions/settings";
import type { AIStatus } from "@/server/ai";
import { cn } from "@/lib/utils";

interface Props {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  followUpDays: number;
  businessDays: boolean;
  library: { hostRoot: string; exists: boolean; writable: boolean; folders: string[] };
  ai: Pick<AIStatus, "available" | "apiKey" | "detail">;
  hasDemo: boolean;
}

const STEPS = ["Faisons connaissance", "Ce que tu cherches", "Tes documents", "C'est parti"];

/** A list typed as chips (Enter or comma adds an item). */
function ChipsInput({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; id: string }) {
  const [draft, setDraft] = useState("");
  const add = (text: string) => {
    const t = text.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-highlight-50 px-2 py-0.5 text-xs text-highlight-700">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Retirer ${v}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        placeholder={value.length ? "" : placeholder}
        className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function WelcomeWizard(props: Props) {
  const { library, ai, hasDemo } = props;
  const [step, setStep] = useState(0);
  const [aiState, setAiState] = useState<Pick<AIStatus, "available" | "apiKey" | "detail">>(ai);
  const [firstName, setFirstName] = useState(props.firstName);
  const [lastName, setLastName] = useState(props.lastName);
  const [email, setEmail] = useState(props.email);
  const [phone, setPhone] = useState(props.phone);
  const [location, setLocation] = useState(props.location);
  const [roles, setRoles] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [places, setPlaces] = useState<string[]>([]);
  const [placeDraft, setPlaceDraft] = useState("");
  const [days, setDays] = useState(props.followUpDays);
  const [business, setBusiness] = useState(props.businessDays);
  const [start, setStart] = useState<"demo" | "empty">(hasDemo ? "empty" : "empty");
  const [pending, startTransition] = useTransition();

  const emailOk = !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim());
  const canContinue = step !== 0 || (firstName.trim().length > 0 && emailOk);

  const finish = () =>
    startTransition(async () => {
      const result = await completeOnboardingAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        location: location.trim(),
        targetRoles: roles,
        targetDomains: domains,
        preferredLocations: places,
        followUpDays: days,
        businessDays: business,
        loadDemo: start === "demo",
      });
      if (result && !result.ok) toast.error(result.error);
    });

  return (
    <div className="flex min-h-svh items-center justify-center bg-app-background p-4">
      <div className="relative isolate w-full max-w-xl">
        <div aria-hidden className="composer-halo pointer-events-none absolute -inset-1 -z-10 rounded-[30px] opacity-40 blur-xl" />
        <div className="rounded-3xl border border-border bg-background p-6 shadow-lg sm:p-8">
          <div className="mb-6 flex items-center gap-2.5">
            <CareerOsMark className="h-[20px]" />
            <span className="heading-sm text-foreground">Career OS</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {step + 1} / {STEPS.length}
            </span>
          </div>
          <div className="mb-7 flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-highlight-500" : "bg-muted")} />
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h1 className="heading-2xl text-foreground">Bienvenue dans Career OS</h1>
                <p className="copy-sm text-muted-foreground">Faisons connaissance. Ces informations servent à signer tes messages et à préparer tes candidatures ; tu pourras les changer dans ton profil.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="w-first">Prénom</Label>
                  <Input id="w-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Camille" autoFocus autoComplete="given-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-last">Nom</Label>
                  <Input id="w-last" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Martin" autoComplete="family-name" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="w-email">E-mail pour tes candidatures</Label>
                  <Input id="w-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="camille.martin@exemple.fr" autoComplete="email" aria-invalid={!emailOk} />
                  {!emailOk && <p className="text-xs text-destructive">Cette adresse ne semble pas complète.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-phone">Téléphone</Label>
                  <Input id="w-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Facultatif" autoComplete="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-city">Ville</Label>
                  <PlaceInput id="w-city" mode="city" value={location} onChange={setLocation} onSelect={(p) => setLocation([p.city ?? p.title, p.country].filter(Boolean).join(", "))} placeholder="Lyon" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h2 className="heading-xl text-foreground">Ce que tu cherches</h2>
                <p className="copy-sm text-muted-foreground">Ça aide Career OS à trier les offres et Claude à te proposer les bonnes. Tout est facultatif.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-roles">Postes, stages ou formations visés</Label>
                <ChipsInput id="w-roles" value={roles} onChange={setRoles} placeholder="Chef de projet, stage en marketing, master de droit…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-domains">Domaines qui t’intéressent</Label>
                <ChipsInput id="w-domains" value={domains} onChange={setDomains} placeholder="Santé, énergie, luxe…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-places">Où ?</Label>
                <PlaceInput
                  id="w-places"
                  mode="city"
                  value={placeDraft}
                  onChange={setPlaceDraft}
                  clearOnSelect
                  onSelect={(p) => {
                    const c = p.city ?? p.title;
                    if (!places.includes(c)) setPlaces([...places, c]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && placeDraft.trim()) {
                      e.preventDefault();
                      if (!places.includes(placeDraft.trim())) setPlaces([...places, placeDraft.trim()]);
                      setPlaceDraft("");
                    }
                  }}
                  placeholder="Paris, Bruxelles, télétravail…"
                />
                {places.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {places.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 rounded-full bg-highlight-50 px-2 py-0.5 text-xs text-highlight-700">
                        {p}
                        <button type="button" onClick={() => setPlaces(places.filter((x) => x !== p))} aria-label={`Retirer ${p}`}>
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h2 className="flex items-center gap-2 heading-xl text-foreground">
                  <Folder className="size-5 text-highlight-500" /> Tes documents
                </h2>
                <p className="copy-sm text-muted-foreground">
                  Tes CV, lettres et diplômes sont rangés dans un dossier normal de ton ordinateur. Rien à faire maintenant : Claude pourra récupérer tes CV et les ranger ici pour toi.
                </p>
              </div>
              <div className="rounded-2xl bg-muted-background p-4">
                <p className="truncate text-sm font-medium text-foreground" title={library.hostRoot}>
                  {library.hostRoot}
                </p>
                <p className={cn("mt-1 flex items-center gap-1.5 text-xs", library.exists ? "text-success-700" : "text-muted-foreground")}>
                  <CheckCircle2 className="size-3.5" /> {library.exists ? "Dossier prêt" : "Le dossier sera créé"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {library.folders.map((f) => (
                    <span key={f} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Relancer un recruteur sans réponse après</p>
                <div className="flex flex-wrap gap-2">
                  {[5, 7, 10, 14].map((d) => (
                    <Button key={d} size="sm" variant={days === d ? "highlight" : "outline"} onClick={() => setDays(d)}>
                      {d} jours
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={business} onCheckedChange={setBusiness} /> Sans compter les week-ends et jours fériés
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h2 className="heading-xl text-foreground">{firstName.trim() ? `C'est parti, ${firstName.trim()} !` : "C'est parti !"}</h2>
                <p className="copy-sm text-muted-foreground">Tu peux commencer avec tes vraies candidatures, ou découvrir l’outil avec des exemples.</p>
              </div>
              <div className="grid gap-2">
                {(
                  [
                    ["empty", "Commencer avec mes candidatures", "Ajoute une offre en collant son lien ou son texte, ou demande à Claude de le faire."],
                    ["demo", "Découvrir avec des exemples", "Des candidatures, entretiens et documents fictifs, faciles à supprimer ensuite."],
                  ] as const
                ).map(([value, title, text]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStart(value)}
                    className={cn("rounded-2xl border p-4 text-left transition-colors", start === value ? "border-highlight-500 bg-highlight-50/60 dark:bg-highlight-950/30" : "border-border hover:bg-hover")}
                  >
                    <span className="block text-sm font-medium text-foreground">{title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
                  </button>
                ))}
              </div>
              {aiState.available && aiState.apiKey?.source !== "app" ? (
                <p className="flex items-center gap-2 rounded-2xl bg-muted-background px-4 py-3 text-sm text-muted-foreground">
                  <Sparkles className="size-4 shrink-0 text-highlight-500" />
                  Claude est prêt à t&apos;aider : la barre de discussion est en bas de chaque page.
                </p>
              ) : (
                <div className="space-y-3 rounded-2xl bg-muted-background p-4">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-highlight-500" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{aiState.available ? "Claude est prêt à t'aider" : "Active l'assistant Claude"}</p>
                      <p className="text-xs text-muted-foreground">
                        {aiState.available
                          ? "La barre de discussion est en bas de chaque page."
                          : "Colle ta clé Claude : il pourra chercher des offres et des logements, analyser et préparer pour toi. Tu peux aussi le faire plus tard dans Paramètres → IA."}
                      </p>
                    </div>
                  </div>
                  <ApiKeyField status={aiState} onChange={setAiState} compact />
                  {aiState.apiKey?.source === "app" && !aiState.available && <p className="text-xs text-warning-700">{aiState.detail}</p>}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
              <ArrowLeft /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="highlight" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
                Continuer <ArrowRight />
              </Button>
            ) : (
              <Button variant="highlight" onClick={finish} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Ouvrir Career OS
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
