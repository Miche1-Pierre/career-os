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

const STEPS = ["Welcome", "Documents", "AI", "Follow-ups", "Start"];

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
            <h1 className="heading-2xl text-foreground">Welcome to Career OS</h1>
            <p className="text-sm text-muted-foreground">
              Capture any opportunity in seconds — job, internship, VIE, master, PhD — and let Career OS handle follow-ups, deadlines, documents and interviews until the final decision.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="name">What should we call you?</Label>
              <Input id="name" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Pierre" autoFocus />
              <p className="text-xs text-muted-foreground">Used in greetings and email templates.</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <Folder className="size-5" /> Your documents folder
            </h2>
            <p className="text-sm text-muted-foreground">CVs, letters and transcripts stay in a normal folder on your computer. Career OS reads it, keeps a frozen copy of every version you send, and never modifies your files.</p>
            <div className="rounded-lg border bg-muted-background p-3 font-mono text-xs break-all">{library.hostRoot}</div>
            <p className={cn("flex items-center gap-2 text-sm", library.exists ? "text-emerald-700 dark:text-emerald-300" : "text-info-800")}>
              {library.exists ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {library.exists ? (library.writable ? "Folder connected (read & write)" : "Folder connected (read-only)") : "Folder not found"}
            </p>
            <p className="text-xs text-muted-foreground">
              To use another folder, set <code className="rounded bg-muted px-1">DOCUMENTS_DIR</code> in <code className="rounded bg-muted px-1">.env</code> and restart (
              <code className="rounded bg-muted px-1">docker compose up -d</code>). Suggested layout: CV/, Cover Letters/, Academic/.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <Sparkles className="size-5 text-highlight-500" /> AI assistant
            </h2>
            <div className={cn("rounded-lg border p-3 text-sm", ai.available ? "border-transparent bg-emerald-50 dark:bg-emerald-950" : "bg-muted-background")}>
              <p className="flex items-center gap-2 font-medium">
                {ai.available ? <CheckCircle2 className="size-4 text-emerald-700" /> : <XCircle className="size-4 text-muted-foreground" />}
                {ai.available ? `Ready — ${ai.detail}` : ai.detail}
              </p>
              {ai.setup && <p className="mt-1 text-xs text-muted-foreground">{ai.setup}</p>}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <Bot className="mr-1 inline size-4" /> <span className="font-medium text-foreground">Claude Code works with no configuration:</span> open Claude Code in <code className="rounded bg-muted px-1">C:\Candidature</code> — the Career OS MCP server is declared in{" "}
                <code className="rounded bg-muted px-1">.mcp.json</code>. Then just say “ajoute cette offre : …” or “traite mon inbox Career OS”.
              </p>
              <p>In-app AI (Quick import analysis) uses Claude Code headless: either a token from <code className="rounded bg-muted px-1">claude setup-token</code> in .env, or the host bridge (<code className="rounded bg-muted px-1">npm run bridge</code>).</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <TimerReset className="size-5" /> Default follow-up delay
            </h2>
            <p className="text-sm text-muted-foreground">When you apply, Career OS schedules a follow-up automatically. You can override it per application and per type later.</p>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 7, 10, 14].map((d) => (
                <Button key={d} variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                  {d} days
                </Button>
              ))}
              <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 7))} className="w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="biz" checked={business} onCheckedChange={setBusiness} />
              <Label htmlFor="biz">Count business days only (weekends and French public holidays skipped)</Label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 heading-xl text-foreground">
              <Rocket className="size-5" /> How do you want to start?
            </h2>
            <RadioGroup value={start} onValueChange={(v) => setStart(v as "demo" | "empty")} className="gap-2">
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", start === "demo" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="demo" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Explore with demo data</span>
                  <span className="text-xs text-muted-foreground">Zefir, Roche, Siemens Healthineers, a bioinformatics master… clearly marked, deletable in one click (Settings → Data).</span>
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", start === "empty" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="empty" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Start empty</span>
                  <span className="text-xs text-muted-foreground">Then import your existing applications: paste them one by one in Quick import, restore a JSON export, or ask Claude Code to import your spreadsheet.</span>
                </span>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Open Career OS
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
