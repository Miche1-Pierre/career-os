"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Folder, Loader2, Rocket, Sparkles, TimerReset, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { completeOnboardingAction } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

interface Props {
  userName: string;
  followUpDays: number;
  businessDays: boolean;
  library: { root: string; hostRoot: string; exists: boolean; writable: boolean };
  ai: { available: boolean; provider: string; detail: string; setup: string | null };
  hasDemo: boolean;
}

const STEPS = ["Bienvenue", "Documents", "IA", "Relances", "Démarrage"];

export function WelcomeWizard({ userName: initialName, followUpDays: initialDays, businessDays: initialBusiness, library, ai, hasDemo }: Props) {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState(initialName);
  const [days, setDays] = useState(initialDays);
  const [business, setBusiness] = useState(initialBusiness);
  const [start, setStart] = useState<"demo" | "empty">(hasDemo ? "empty" : "demo");
  const [pending, startTransition] = useTransition();

  const finish = () =>
    startTransition(async () => {
      const result = await completeOnboardingAction({ userName, followUpDays: days, businessDays: business, loadDemo: start === "demo" });
      if (result && !result.ok) toast.error(result.error);
    });

  return (
    <div className="flex min-h-svh items-center justify-center bg-app-background p-4">
      <div className="w-full max-w-xl rounded-3xl border border-separator bg-background p-6 shadow-lg sm:p-8 dark:border-border">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">C</span>
          <span className="font-semibold">Career OS</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="mb-6 flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <h1 className="heading-2xl text-foreground">Bienvenue dans Career OS</h1>
            <p className="text-sm text-muted-foreground">
              Capturez n’importe quelle opportunité en quelques secondes — emploi, stage, VIE, master, doctorat — et laissez Career OS gérer relances, dates limites, documents et entretiens jusqu’à la décision finale.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="name">Comment vous appeler ?</Label>
              <Input id="name" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Pierre" autoFocus />
              <p className="text-xs text-muted-foreground">Utilisé dans les messages d’accueil et les modèles d’e-mail.</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <Folder className="size-5" /> Votre dossier de documents
            </h2>
            <p className="text-sm text-muted-foreground">CV, lettres et relevés de notes restent dans un dossier normal de votre ordinateur. Career OS le lit, garde une copie figée de chaque version envoyée et ne modifie jamais vos fichiers.</p>
            <div className="rounded-lg border bg-muted-background p-3 font-mono text-xs break-all">{library.hostRoot}</div>
            <p className={cn("flex items-center gap-2 text-sm", library.exists ? "text-emerald-700 dark:text-emerald-300" : "text-info-800")}>
              {library.exists ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {library.exists ? (library.writable ? "Dossier connecté (lecture et écriture)" : "Dossier connecté (lecture seule)") : "Dossier introuvable"}
            </p>
            <p className="text-xs text-muted-foreground">
              Pour utiliser un autre dossier, définissez <code className="rounded bg-muted px-1">DOCUMENTS_DIR</code> dans <code className="rounded bg-muted px-1">.env</code> puis redémarrez (
              <code className="rounded bg-muted px-1">docker compose up -d</code>). Organisation suggérée : CV/, Cover Letters/, Academic/.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <Sparkles className="size-5 text-highlight-500" /> Assistant IA
            </h2>
            <div className={cn("rounded-lg border p-3 text-sm", ai.available ? "border-transparent bg-emerald-50 dark:bg-emerald-950" : "bg-muted-background")}>
              <p className="flex items-center gap-2 font-medium">
                {ai.available ? <CheckCircle2 className="size-4 text-emerald-700" /> : <XCircle className="size-4 text-muted-foreground" />}
                {ai.available ? `Prêt — ${ai.detail}` : ai.detail}
              </p>
              {ai.setup && <p className="mt-1 text-xs text-muted-foreground">{ai.setup}</p>}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <Bot className="mr-1 inline size-4" /> <span className="font-medium text-foreground">Claude Code fonctionne sans configuration :</span> ouvrez Claude Code dans <code className="rounded bg-muted px-1">C:\Candidature</code> — le serveur MCP Career OS est déclaré dans{" "}
                <code className="rounded bg-muted px-1">.mcp.json</code>. Il suffit ensuite de dire « ajoute cette offre : … » ou « traite mon inbox Career OS ».
              </p>
              <p>L’IA intégrée (analyse de l’import rapide) utilise Claude Code en mode headless : soit un jeton issu de <code className="rounded bg-muted px-1">claude setup-token</code> dans .env, soit le bridge hôte (<code className="rounded bg-muted px-1">npm run bridge</code>).</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <TimerReset className="size-5" /> Délai de relance par défaut
            </h2>
            <p className="text-sm text-muted-foreground">Dès que vous postulez, Career OS planifie une relance automatiquement. Le délai reste modifiable par candidature et par type.</p>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 7, 10, 14].map((d) => (
                <Button key={d} variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                  {d} jours
                </Button>
              ))}
              <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 7))} className="w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="biz" checked={business} onCheckedChange={setBusiness} />
              <Label htmlFor="biz">Compter uniquement les jours ouvrés (week-ends et jours fériés français exclus)</Label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <Rocket className="size-5" /> Comment démarrer ?
            </h2>
            <RadioGroup value={start} onValueChange={(v) => setStart(v as "demo" | "empty")} className="gap-2">
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", start === "demo" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="demo" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Explorer avec des données de démo</span>
                  <span className="text-xs text-muted-foreground">Zefir, Roche, Siemens Healthineers, un master de bio-informatique… clairement identifiées, supprimables en un clic (Paramètres → Données).</span>
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", start === "empty" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="empty" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Partir de zéro</span>
                  <span className="text-xs text-muted-foreground">Importez ensuite vos candidatures existantes : collez-les une par une dans l’import rapide, restaurez un export JSON ou demandez à Claude Code d’importer votre tableur.</span>
                </span>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft /> Retour
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Continuer <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Ouvrir Career OS
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
