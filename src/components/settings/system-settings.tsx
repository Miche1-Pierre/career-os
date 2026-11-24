"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Copy, Database, Download, FileArchive, FileJson, FileSpreadsheet, FileUp, FlaskConical, Loader2, RotateCcw, Save, Trash2, Upload, XCircle } from "lucide-react";
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
import { ApiKeyField } from "@/components/app/api-key-field";
import { cn } from "@/lib/utils";

const BACKUP_KIND_LABEL: Record<string, string> = { auto: "automatique", manual: "manuelle", pre: "avant restauration", "pre-restore": "avant restauration", pg_dump: "pg_dump" };

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{children}</pre>
      <button type="button" className="absolute top-1.5 right-1.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-background" onClick={() => (navigator.clipboard.writeText(children), toast.success("Copié"))} aria-label="Copier">
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
      <SettingsCard title="Connecter Claude" description="Colle une clé API Claude : le chat, les recherches et les analyses l’utilisent aussitôt. Sans clé, Career OS passe par Claude Code s’il est connecté sur cet ordinateur.">
        <ApiKeyField status={live} onChange={setLive} />
      </SettingsCard>

      <SettingsCard title="IA intégrée" description="Utilisée par l’import rapide, l’analyse, les questions à l’IA et l’import de CV. Tout le reste de Career OS est déterministe et fonctionne sans IA.">
        <div className={cn("flex items-start gap-3 rounded-lg border p-3", live.available ? "border-transparent bg-emerald-50 dark:bg-emerald-950" : "bg-muted-background")}>
          {live.available ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" /> : <XCircle className="mt-0.5 size-5 text-muted-foreground" />}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {live.provider}
              {live.mode ? ` · ${live.mode}` : ""} — {live.available ? "disponible" : "indisponible"}
            </p>
            <p className="break-words text-muted-foreground">{live.detail}</p>
            {live.setup && <p className="mt-1 text-xs break-words">{live.setup}</p>}
            {live.model && <p className="mt-1 text-xs text-muted-foreground">Modèle : {live.model}</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => run(() => testAiAction(), { onSuccess: (s) => (setLive(s), toast[s.available ? "success" : "error"](s.available ? "IA joignable" : s.detail)) })} disabled={pending} className="shrink-0">
            <FlaskConical /> Tester
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Modèle (remplacement)" hint="Vide = AI_MODEL du fichier .env (opus, sonnet, haiku ou un identifiant complet)">
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
                    {e === "default" ? "Par défaut" : e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Assistant du chat" hint="Le plus soigneux est plus fiable sur les longues demandes, mais consomme davantage de ton quota ou de ta clé.">
            <Select value={v.chatModel || "default"} onValueChange={(m) => setV({ ...v, chatModel: (m === "default" ? "" : m) as AppSettings["ai"]["chatModel"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Rapide (par défaut)</SelectItem>
                <SelectItem value="opus">Le plus soigneux</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Langue des textes générés">
            <Select value={v.outputLanguage} onValueChange={(l) => setV({ ...v, outputLanguage: l as AppSettings["ai"]["outputLanguage"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">Identique à la source</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="auto" checked={v.autoAnalyzeCaptures} onCheckedChange={(b) => setV({ ...v, autoAnalyzeCaptures: b })} />
          <Label htmlFor="auto">Analyser automatiquement les captures après un import rapide</Label>
        </div>
        <div className="flex justify-end">
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("ai", v), { success: "Paramètres enregistrés" })}>
            Enregistrer
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Activer l’IA intégrée avec votre abonnement Claude" description="Choisissez une option, puis redémarrez : docker compose up -d">
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Option A — Claude Code dans Docker (recommandé)</p>
            <p className="mb-1.5 text-xs text-muted-foreground">Crée un jeton longue durée pour votre abonnement, utilisé uniquement par ce conteneur.</p>
            <CodeBlock>{"claude setup-token\n# puis dans C:\\Candidature\\.env :\nCLAUDE_CODE_OAUTH_TOKEN=<le jeton>\n\ndocker compose up -d"}</CodeBlock>
          </div>
          <div>
            <p className="font-medium">Option B — Pont hôte (sans jeton)</p>
            <p className="mb-1.5 text-xs text-muted-foreground">Utilise le Claude Code déjà connecté sur votre PC. Laissez la fenêtre ouverte.</p>
            <CodeBlock>{"cd C:\\Candidature\nnpm run bridge"}</CodeBlock>
          </div>
          <div>
            <p className="font-medium">Option C — Clé API Claude</p>
            <p className="text-xs text-muted-foreground">Collez-la dans « Connecter Claude » en haut de cette page : rien à redémarrer.</p>
          </div>
          <div>
            <p className="font-medium">Option D — API compatible OpenAI ou LLM local (Ollama, LM Studio…)</p>
            <CodeBlock>{"AI_PROVIDER=openai\nOPENAI_BASE_URL=http://host.docker.internal:11434/v1\nOPENAI_MODEL=qwen3:14b"}</CodeBlock>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Claude Code comme opérateur (MCP)" description="Fonctionne sans aucune configuration : Claude Code lit et met à jour Career OS grâce à une quarantaine d’outils.">
        <p className="text-sm">
          <Bot className="mr-1 inline size-4" /> Ouvrez Claude Code dans <code className="rounded bg-muted px-1">C:\Candidature</code> (il détecte <code className="rounded bg-muted px-1">.mcp.json</code> et vous demande d’approuver le serveur <b>career-os</b>), puis parlez-lui naturellement :
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>“Ajoute cette offre : [annonce collée]” · “Importe cette formation : https://…”</li>
          <li>“Traite mon inbox Career OS”</li>
          <li>“Qu&apos;est-ce que je dois faire aujourd&apos;hui ?” · “Rédige la relance pour Roche”</li>
          <li>“J&apos;ai envoyé ma candidature à Siemens aujourd&apos;hui” · “Ajoute un entretien avec Jean mardi à 14h”</li>
          <li>“Prépare mon entretien technique chez Zefir” · “Lis mon CV et remplis mon profil”</li>
        </ul>
        <CodeBlock>{`{\n  "mcpServers": {\n    "career-os": { "type": "http", "url": "${appUrl}/api/mcp" }\n  }\n}`}</CodeBlock>
        <p className="text-xs break-words text-muted-foreground">Ou ajoutez-le une fois pour tous vos projets : claude mcp add --transport http career-os {appUrl}/api/mcp</p>
      </SettingsCard>

      <SettingsCard title="Prompts" description="Prompts internes versionnés : la version est enregistrée avec chaque résultat de l’IA.">
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
    <SettingsCard title="Bibliothèque de documents" description="Pour des raisons de sécurité, un navigateur ne peut pas ouvrir les chemins C:\… : Career OS lit à la place un dossier monté dans l’application.">
      <div className="space-y-2 text-sm">
        <p>
          Dossier sur votre ordinateur : <code className="rounded-md bg-muted px-1 font-mono text-xs break-all">{library.hostRoot}</code>
        </p>
        <p className={cn("flex items-center gap-1.5", library.exists ? "text-emerald-700 dark:text-emerald-300" : "text-warning-500")}>
          {library.exists ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {library.exists ? (library.writable ? "Monté, en lecture et écriture" : "Monté en lecture seule (les fichiers déposés vont dans le dossier de données de l’application)") : "Non monté"}
        </p>
        <p className="text-muted-foreground">
          Copies figées (snapshots) de chaque version : <code className="rounded-md bg-muted px-1 font-mono text-xs break-all">{dataDir}</code> — elles garantissent que vous pourrez toujours rouvrir ce que vous avez réellement envoyé. Taille maximale d’un fichier : {maxUploadMb} Mo.
        </p>
      </div>
      <CodeBlock>{"# .env — changez le dossier, puis : docker compose up -d\nDOCUMENTS_DIR=C:/Users/vous/Documents/CareerOS/documents\nMAX_UPLOAD_MB=25"}</CodeBlock>
      <p className="text-xs text-muted-foreground">
        Organisation suggérée : CV/, Cover Letters/, Academic/, Certificates/. Utilisez <Link href="/documents" className="underline">Documents → Analyser le dossier</Link> pour enregistrer les fichiers et repérer ceux qui ont changé.
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
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = async () => {
    if (!file) return;
    if (
      !(await confirm({
        title: mode === "replace" ? "Remplacer TOUTES vos données par ce fichier ?" : "Fusionner ce fichier avec vos données ?",
        description: "Une sauvegarde de sécurité des données actuelles est d’abord écrite dans ./backups.",
        destructive: mode === "replace",
        confirmLabel: mode === "replace" ? "Tout remplacer" : "Fusionner",
      }))
    )
      return;
    setImporting(true);
    const form = new FormData();
    form.set("file", file);
    form.set("mode", mode);
    const r = await importDataAction(form);
    setImporting(false);
    if (!r.ok) return void toast.error(r.error);
    const total = Object.values(r.data as Record<string, number>).reduce((a, b) => a + b, 0);
    toast.success(`Import terminé : ${total} ligne${total > 1 ? "s" : ""} ${mode === "merge" ? "ajoutée" : "restaurée"}${total > 1 ? "s" : ""}`);
  };

  return (
    <>
      <SettingsCard title="Exporter toutes les données" description="Vos données vous appartiennent : formats ouverts, versionnés (schemaVersion), restaurables.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/api/v1/export?format=json" download>
              <FileJson /> JSON (complet)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/v1/export?format=zip" download>
              <FileArchive /> ZIP (JSON + CSV + fichiers)
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

      <SettingsCard title="Importer / restaurer" description="Un export JSON de Career OS, une sauvegarde .json.gz ou un export ZIP.">
        <input ref={fileRef} type="file" accept=".json,.gz,.zip" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <FileUp /> Choisir un fichier
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground" title={file?.name}>
            {file ? file.name : "Aucun fichier choisi"}
          </span>
        </div>
        <RadioGroup value={mode} onValueChange={(m) => setMode(m as "replace" | "merge")} className="gap-2">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="merge" /> Fusionner : ajouter ce qui manque, conserver les données existantes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="replace" /> Remplacer : restaurer exactement le fichier (les données actuelles sont remplacées)
          </label>
        </RadioGroup>
        <div className="flex justify-end">
          <Button onClick={doImport} disabled={!file || importing}>
            {importing ? <Loader2 className="animate-spin" /> : <Upload />} Importer
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Sauvegardes"
        description={
          <>
            Sauvegarde JSON automatique toutes les 24 h (réglable avec AUTO_BACKUP_HOURS) dans <code className="font-mono break-all">{backupsDir}</code>. Pour un dump PostgreSQL natif : <code className="font-mono">docker compose run --rm backup</code>
          </>
        }
        footer={
          <Button onClick={() => run(() => createBackupAction(), { success: (b) => `Sauvegarde écrite : ${b.name}` })} disabled={pending}>
            <Save /> Sauvegarder maintenant
          </Button>
        }
      >
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune sauvegarde pour l’instant.</p>
        ) : (
          <ul className="surface-list rounded-xl">
            {backups.slice(0, 20).map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Database className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</span>
                <span className="text-xs text-muted-foreground">
                  {BACKUP_KIND_LABEL[b.kind] ?? b.kind} · {Math.max(1, Math.round(b.size / 1024))} Ko · {formatRelativeInstant(b.createdAt)}
                </span>
                {b.kind !== "pg_dump" && (
                  <>
                    <Button size="icon-xs" variant="ghost" asChild>
                      <a href={`/api/files/backups/${b.name}`} aria-label="Télécharger">
                        <Download />
                      </a>
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={async () => {
                        if (await confirm({ title: `Restaurer ${b.name} ?`, description: "Toutes les données actuelles sont remplacées (une sauvegarde de sécurité est d’abord écrite).", destructive: true, confirmLabel: "Restaurer" }))
                          run(() => restoreBackupAction(b.name), { success: "Sauvegarde restaurée" });
                      }}
                    >
                      <RotateCcw /> Restaurer
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Données de démonstration" description="Données d’exemple clairement identifiées (Zefir, Roche, Siemens Healthineers, un master de bio-informatique…). Vos propres données ne sont jamais modifiées.">
        <div className="flex flex-wrap gap-2">
          {hasDemo ? (
            <Button
              variant="destructive"
              onClick={async () => {
                if (await confirm({ title: "Supprimer toutes les données de démonstration ?", description: "Seuls les éléments marqués comme démonstration sont supprimés.", destructive: true, confirmLabel: "Supprimer les données de démo" }))
                  run(() => deleteDemoAction(), { success: "Données de démonstration supprimées" });
              }}
            >
              <Trash2 /> Supprimer les données de démo
            </Button>
          ) : (
            <Button variant="outline" onClick={() => run(() => seedDemoAction(), { success: "Données de démonstration chargées" })} disabled={pending}>
              Charger les données de démo
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link href="/trash">Corbeille</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/welcome?again=1">Revoir l’accueil</Link>
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
      <SettingsCard title="API REST" description="Les mêmes services que l’interface, pour des scripts, une CLI, une extension de navigateur ou une application mobile.">
        <p className="text-sm">
          URL de base : <code className="rounded bg-muted px-1 font-mono text-xs break-all">{appUrl}/api/v1</code> — index sur{" "}
          <a href="/api/v1" target="_blank" rel="noreferrer" className="text-primary underline">
            /api/v1
          </a>
          .
        </p>
        <CodeBlock>{`# Capturer n’importe quoi dans « À trier » (ce qu’appellerait une extension de navigateur)\ncurl -X POST ${appUrl}/api/v1/capture${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://…","analyze":true}'\n\n# Les actions du jour\ncurl ${appUrl}/api/v1/today${auth}`}</CodeBlock>
        <p className="text-xs text-muted-foreground">{protectedByToken ? "APP_ACCESS_TOKEN est défini : les clients doivent l’envoyer comme jeton Bearer." : "Aucun jeton d’accès : l’API n’est joignable que depuis cet ordinateur (127.0.0.1). Définissez APP_ACCESS_TOKEN avant d’exposer l’application."}</p>
      </SettingsCard>
      <SettingsCard title="Serveur MCP" description="Point d’accès Streamable HTTP utilisé par Claude Code (voir IA et Claude).">
        <CodeBlock>{`${appUrl}/api/mcp`}</CodeBlock>
      </SettingsCard>
      <SettingsCard title="Flux calendrier" description="Entretiens, dates limites et relances au format iCalendar. Importez le fichier, ou abonnez-vous depuis Google Agenda / Outlook quand l’application est accessible en ligne.">
        <CodeBlock>{`${appUrl}/api/v1/calendar.ics`}</CodeBlock>
      </SettingsCard>
      <SettingsCard title="Prochainement" description="L’architecture est prête pour ces évolutions ; aucune n’est nécessaire.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Extension de navigateur « Ajouter à Career OS » → POST /api/v1/capture avec l’URL, le titre et le texte de la page.</li>
          <li>Import Gmail / Outlook → e-mails dans « À trier », analysés en actions proposées (toujours confirmées par vous).</li>
          <li>Notifications par e-mail / Telegram / Discord → des canaux abonnés aux mêmes événements.</li>
          <li>CLI (career today, career add…) → fine surcouche de cette API REST.</li>
        </ul>
      </SettingsCard>
    </>
  );
}
