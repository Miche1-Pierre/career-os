"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Copy, Database, Download, FileArchive, FileJson, FileSpreadsheet, FlaskConical, Loader2, RotateCcw, Save, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormField } from "@/components/app/fields";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { createBackupAction, deleteDemoAction, importDataAction, restoreBackupAction, seedDemoAction, testAiAction, updateSettingsAction } from "@/app/actions/settings";
import type { AppSettings } from "@/lib/settings-schema";
import type { AIStatus } from "@/server/ai";
import { formatRelativeInstant } from "@/lib/dates";
import { SettingsCard } from "./settings-shell";
import { cn } from "@/lib/utils";

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{children}</pre>
      <button type="button" className="absolute top-1.5 right-1.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-background" onClick={() => (navigator.clipboard.writeText(children), toast.success("Copied"))} aria-label="Copy">
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

export function AiSettings({ value, status, prompts, appUrl }: { value: AppSettings["ai"]; status: AIStatus; prompts: string[]; appUrl: string }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(value);
  const [live, setLive] = useState(status);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <>
      <SettingsCard title="In-app AI" description="Used by Quick import, Analyze and Ask. Everything else in Career OS is deterministic and works without AI.">
        <div className={cn("flex items-start gap-3 rounded-lg border p-3", live.available ? "border-transparent bg-emerald-50 dark:bg-emerald-950" : "bg-muted-background")}>
          {live.available ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" /> : <XCircle className="mt-0.5 size-5 text-muted-foreground" />}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {live.provider}
              {live.mode ? ` · ${live.mode}` : ""} — {live.available ? "available" : "not available"}
            </p>
            <p className="text-muted-foreground">{live.detail}</p>
            {live.setup && <p className="mt-1 text-xs">{live.setup}</p>}
            {live.model && <p className="mt-1 text-xs text-muted-foreground">Model: {live.model}</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => run(() => testAiAction(), { onSuccess: (s) => (setLive(s), toast[s.available ? "success" : "error"](s.available ? "AI reachable" : s.detail)) })} disabled={pending}>
            <FlaskConical /> Test
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Model override" hint="Empty = AI_MODEL from .env (opus / sonnet / haiku or a full id)">
            <Input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value.trim() })} placeholder="opus" />
          </FormField>
          <FormField label="Effort">
            <Select value={v.effort || "default"} onValueChange={(e) => setV({ ...v, effort: (e === "default" ? "" : e) as AppSettings["ai"]["effort"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["default", "low", "medium", "high", "xhigh", "max"].map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Language of generated text">
            <Select value={v.outputLanguage} onValueChange={(l) => setV({ ...v, outputLanguage: l as AppSettings["ai"]["outputLanguage"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">Same as the source</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="auto" checked={v.autoAnalyzeCaptures} onCheckedChange={(b) => setV({ ...v, autoAnalyzeCaptures: b })} />
          <Label htmlFor="auto">Analyze captures automatically after Quick import</Label>
        </div>
        <div className="flex justify-end">
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("ai", v), { success: "Saved" })}>
            Save
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Enable in-app AI with your Claude subscription" description="Pick one option, then restart: docker compose up -d">
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Option A — Claude Code inside Docker (recommended)</p>
            <p className="mb-1.5 text-xs text-muted-foreground">Creates a long-lived token for your subscription, used only by this container.</p>
            <CodeBlock>{"claude setup-token\n# then in C:\\Candidature\\.env :\nCLAUDE_CODE_OAUTH_TOKEN=<the token>\n\ndocker compose up -d"}</CodeBlock>
          </div>
          <div>
            <p className="font-medium">Option B — Host bridge (no token)</p>
            <p className="mb-1.5 text-xs text-muted-foreground">Uses the Claude Code already logged in on your PC. Keep the window open.</p>
            <CodeBlock>{"cd C:\\Candidature\nnpm run bridge"}</CodeBlock>
          </div>
          <div>
            <p className="font-medium">Option C — Anthropic API key</p>
            <CodeBlock>{"AI_PROVIDER=anthropic\nANTHROPIC_API_KEY=sk-ant-…\nAI_MODEL=claude-opus-5-5"}</CodeBlock>
          </div>
          <div>
            <p className="font-medium">Option D — OpenAI-compatible or local LLM (Ollama, LM Studio…)</p>
            <CodeBlock>{"AI_PROVIDER=openai\nOPENAI_BASE_URL=http://host.docker.internal:11434/v1\nOPENAI_MODEL=qwen3:14b"}</CodeBlock>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Claude Code as your operator (MCP)" description="Works with no configuration at all: Claude Code reads and updates Career OS through ~30 tools.">
        <p className="text-sm">
          <Bot className="mr-1 inline size-4" /> Open Claude Code in <code className="rounded bg-muted px-1">C:\Candidature</code> (it detects <code className="rounded bg-muted px-1">.mcp.json</code> and asks you to approve the <b>career-os</b> server), then talk naturally:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>“Ajoute cette offre : [annonce collée]” · “Importe cette formation : https://…”</li>
          <li>“Traite mon inbox Career OS”</li>
          <li>“Qu&apos;est-ce que je dois faire aujourd&apos;hui ?” · “Rédige la relance pour Roche”</li>
          <li>“J&apos;ai envoyé ma candidature à Siemens aujourd&apos;hui” · “Ajoute un entretien avec Jean mardi à 14h”</li>
          <li>“Prépare mon entretien technique chez Zefir” · “Lis mon CV et remplis mon profil”</li>
        </ul>
        <CodeBlock>{`{\n  "mcpServers": {\n    "career-os": { "type": "http", "url": "${appUrl}/api/mcp" }\n  }\n}`}</CodeBlock>
        <p className="text-xs text-muted-foreground">Or add it once for all your projects: claude mcp add --transport http career-os {appUrl}/api/mcp</p>
      </SettingsCard>

      <SettingsCard title="Prompts" description="Versioned internal prompts — the version is stored with every AI result.">
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <code key={p} className="rounded bg-muted px-2 py-1 text-xs">
              {p}
            </code>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}

export function DocumentsSettings({ library, dataDir, maxUploadMb }: { library: { root: string; hostRoot: string; exists: boolean; writable: boolean }; dataDir: string; maxUploadMb: number }) {
  return (
    <SettingsCard title="Documents library" description="Browsers cannot open C:\… paths for security reasons: Career OS reads a folder mounted into the app instead — no hack.">
      <div className="space-y-2 text-sm">
        <p>
          Folder on your computer: <code className="rounded-md bg-muted px-1 font-mono text-xs break-all">{library.hostRoot}</code>
        </p>
        <p className={cn("flex items-center gap-1.5", library.exists ? "text-emerald-700 dark:text-emerald-300" : "text-warning-500")}>
          {library.exists ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {library.exists ? (library.writable ? "Mounted, read & write" : "Mounted, read-only (uploads go to the app data folder)") : "Not mounted"}
        </p>
        <p className="text-muted-foreground">
          Frozen copies (snapshots) of every version: <code className="rounded-md bg-muted px-1 font-mono text-xs break-all">{dataDir}</code> — they guarantee you can always open what you actually sent. Max upload: {maxUploadMb} MB.
        </p>
      </div>
      <CodeBlock>{"# .env — change the folder, then: docker compose up -d\nDOCUMENTS_DIR=C:/Users/Pierre/Documents/Candidatures\nMAX_UPLOAD_MB=25"}</CodeBlock>
      <p className="text-xs text-muted-foreground">
        Suggested layout: CV/, Cover Letters/, Academic/, Certificates/. Use <Link href="/documents" className="underline">Documents → Scan folder</Link> to register files and detect modified ones.
      </p>
    </SettingsCard>
  );
}

export function DataSettings({ backups, hasDemo, backupsDir }: { backups: { name: string; size: number; createdAt: string | Date; kind: string }[]; hasDemo: boolean; backupsDir: string }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("merge");
  const [importing, setImporting] = useState(false);

  const doImport = async () => {
    if (!file) return;
    if (!(await confirm({ title: mode === "replace" ? "Replace ALL your data with this file?" : "Merge this file into your data?", description: "A safety backup of the current data is written to ./backups first.", destructive: mode === "replace", confirmLabel: mode === "replace" ? "Replace everything" : "Merge" }))) return;
    setImporting(true);
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    const r = await importDataAction(form);
    setImporting(false);
    if (!r.ok) return void toast.error(r.error);
    const total = Object.values(r.data as Record<string, number>).reduce((a, b) => a + b, 0);
    toast.success(`Import done — ${total} rows ${mode === "merge" ? "added" : "restored"}`);
  };

  return (
    <>
      <SettingsCard title="Export all data" description="Your data is yours: open formats, versioned (schemaVersion), restorable.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/api/v1/export?format=json" download>
              <FileJson /> JSON (full)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/v1/export?format=zip" download>
              <FileArchive /> ZIP (JSON + CSV + files)
            </a>
          </Button>
          {["opportunities", "contacts", "organizations", "interviews", "tasks", "timeline", "document-versions"].map((t) => (
            <Button key={t} variant="ghost" size="sm" asChild>
              <a href={`/api/v1/export?format=csv&table=${t}`}>
                <FileSpreadsheet /> {t}.csv
              </a>
            </Button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Import / restore" description="A Career OS JSON export, a .json.gz backup or a ZIP export.">
        <Input type="file" accept=".json,.gz,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <RadioGroup value={mode} onValueChange={(m) => setMode(m as "replace" | "merge")} className="gap-2">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="merge" /> Merge — add what is missing, keep existing records
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="replace" /> Replace — restore exactly the file (current data is replaced)
          </label>
        </RadioGroup>
        <div className="flex justify-end">
          <Button onClick={doImport} disabled={!file || importing}>
            {importing ? <Loader2 className="animate-spin" /> : <Upload />} Import
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Backups"
        description={
          <>
            Automatic JSON backup every 24 h (configurable with AUTO_BACKUP_HOURS) in <code className="font-mono break-all">{backupsDir}</code>. A native PostgreSQL dump: <code className="font-mono">docker compose run --rm backup</code>
          </>
        }
        footer={
          <Button onClick={() => run(() => createBackupAction(), { success: (b) => `Backup written: ${b.name}` })} disabled={pending}>
            <Save /> Back up now
          </Button>
        }
      >
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backup yet.</p>
        ) : (
          <ul className="surface-list rounded-xl">
            {backups.slice(0, 20).map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Database className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</span>
                <span className="text-xs text-muted-foreground">
                  {b.kind} · {Math.max(1, Math.round(b.size / 1024))} KB · {formatRelativeInstant(b.createdAt)}
                </span>
                {b.kind !== "pg_dump" && (
                  <>
                    <Button size="icon-xs" variant="ghost" asChild>
                      <a href={`/api/files/backups/${b.name}`} aria-label="Download">
                        <Download />
                      </a>
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={async () => {
                        if (await confirm({ title: `Restore ${b.name}?`, description: "All current data is replaced (a safety backup is written first).", destructive: true, confirmLabel: "Restore" }))
                          run(() => restoreBackupAction(b.name), { success: "Backup restored" });
                      }}
                    >
                      <RotateCcw /> Restore
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Demo data" description="Clearly marked sample data (Zefir, Roche, Siemens Healthineers, a bioinformatics master…). Your own data is never touched.">
        <div className="flex flex-wrap gap-2">
          {hasDemo ? (
            <Button
              variant="destructive"
              onClick={async () => {
                if (await confirm({ title: "Delete all demo data?", description: "Only records flagged as demo are removed.", destructive: true, confirmLabel: "Delete demo data" })) run(() => deleteDemoAction(), { success: "Demo data deleted" });
              }}
            >
              <Trash2 /> Delete demo data
            </Button>
          ) : (
            <Button variant="outline" onClick={() => run(() => seedDemoAction(), { success: "Demo data loaded" })} disabled={pending}>
              Load demo data
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link href="/trash">Recently deleted</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/welcome?again=1">Replay onboarding</Link>
          </Button>
        </div>
      </SettingsCard>
    </>
  );
}

export function IntegrationSettings({ appUrl, protectedByToken }: { appUrl: string; protectedByToken: boolean }) {
  const auth = protectedByToken ? ' -H "Authorization: Bearer $CAREER_OS_TOKEN"' : "";
  return (
    <>
      <SettingsCard title="REST API" description="The same services as the UI — for scripts, a CLI, a browser extension or a mobile app.">
        <p className="text-sm">
          Base URL: <code className="rounded bg-muted px-1 font-mono text-xs">{appUrl}/api/v1</code> — index at{" "}
          <a href="/api/v1" target="_blank" rel="noreferrer" className="text-primary underline">
            /api/v1
          </a>
          .
        </p>
        <CodeBlock>{`# Capture anything into the inbox (what a browser extension would call)\ncurl -X POST ${appUrl}/api/v1/capture${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://…","analyze":true}'\n\n# Today's actions\ncurl ${appUrl}/api/v1/today${auth}`}</CodeBlock>
        <p className="text-xs text-muted-foreground">{protectedByToken ? "APP_ACCESS_TOKEN is set: clients must send it as a Bearer token." : "No access token: the API is only reachable from this computer (127.0.0.1). Set APP_ACCESS_TOKEN before exposing the app."}</p>
      </SettingsCard>
      <SettingsCard title="MCP server" description="Streamable HTTP endpoint used by Claude Code (see AI & Claude).">
        <CodeBlock>{`${appUrl}/api/mcp`}</CodeBlock>
      </SettingsCard>
      <SettingsCard title="Calendar feed" description="Interviews, deadlines and follow-ups as iCalendar. Import the file, or subscribe from Google Calendar / Outlook when the app is reachable online.">
        <CodeBlock>{`${appUrl}/api/v1/calendar.ics`}</CodeBlock>
      </SettingsCard>
      <SettingsCard title="Coming next" description="The architecture is ready for these; none is required.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Browser extension “Add to Career OS” → POST /api/v1/capture with the page URL, title and text.</li>
          <li>Gmail / Outlook import → emails into the inbox, analyzed as proposed actions (always confirmed by you).</li>
          <li>Notifications by email / Telegram / Discord → notification channels subscribe to the same events.</li>
          <li>CLI (career today, career add…) → thin wrapper over this REST API.</li>
        </ul>
      </SettingsCard>
    </>
  );
}
