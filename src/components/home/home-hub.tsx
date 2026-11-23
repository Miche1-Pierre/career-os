"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight, FileDown, Home, MessageSquare, MessagesSquare, Play, Plus, Radar, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useChat } from "@/components/chat/chat-dock";
import { useQuickImport } from "@/components/app/quick-import";
import { useAction } from "@/hooks/use-action";
import { runSearchAction } from "@/app/actions/discovery";
import { formatRelativeInstant } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface HubSearch {
  id: string;
  name: string;
  domain: "JOBS" | "HOUSING";
  lastRun: { startedAt: string; resultsNew: number; status: string } | null;
}

export interface HubThread {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * Home page, where everything starts: the chat bar in the middle (the same bar that sits at the bottom of every other
 * page), quick actions that open a ready-to-fill form in the conversation, the saved searches and recent chats.
 */
export function HomeHub({ name, searches, threads, moveId }: { name: string | null; searches: HubSearch[]; threads: HubThread[]; moveId: string | null }) {
  const { showForm, openThread, focus, send, prefill, heroSlot } = useChat();
  const { open: openImport } = useQuickImport();

  const actions: { key: string; icon: typeof Briefcase; label: string; onClick: () => void; disabled?: boolean; hint?: string }[] = [
    { key: "jobs", icon: Briefcase, label: "Chercher des offres", onClick: () => showForm({ form: "search", domain: "JOBS" }) },
    {
      key: "housing",
      icon: Home,
      label: "Chercher un logement",
      onClick: () => showForm({ form: "search", domain: "HOUSING", moveId }),
      disabled: !moveId,
      hint: moveId ? undefined : "Crée d’abord une installation",
    },
    { key: "import", icon: FileDown, label: "Importer une offre", onClick: () => openImport() },
    { key: "today", icon: Sun, label: "Ma journée", onClick: () => send("Qu'est-ce que je dois faire aujourd'hui ?") },
    { key: "interview", icon: MessagesSquare, label: "Préparer un entretien", onClick: () => prefill("Prépare mon entretien chez ") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pt-[12vh] pb-28 sm:px-6">
      <div className="space-y-2 text-center">
        <Radar className="mx-auto size-7 text-highlight-500" aria-hidden />
        <h1 className="heading-3xl text-foreground">{name ? `Bonjour ${name}, on cherche quoi ?` : "On cherche quoi ?"}</h1>
        <p className="copy-base text-muted-foreground">Des offres, un logement, une réponse : demande, Career OS s’en occupe.</p>
      </div>

      {/* The chat bar is placed here (it is the dock, moved by the shell). */}
      <div ref={heroSlot} className="mt-7 w-full" />

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            title={a.hint}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <a.icon className="size-4 text-highlight-500" />
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <SearchesCard searches={searches} onNew={() => showForm({ form: "search", domain: "JOBS" })} />
        <ThreadsCard threads={threads} onOpen={(id) => openThread(id)} onNew={() => focus()} />
      </div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-background p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="heading-sm text-foreground">{title}</h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function SearchesCard({ searches, onNew }: { searches: HubSearch[]; onNew: () => void }) {
  const { run } = useAction();
  const [running, setRunning] = useState<string | null>(null);
  return (
    <Card
      title="Mes recherches"
      action={
        <Link href="/searches" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          Toutes <ChevronRight className="size-3.5" />
        </Link>
      }
    >
      {searches.length ? (
        <ul className="-mx-1">
          {searches.slice(0, 5).map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-hover">
              {s.domain === "HOUSING" ? <Home className="size-4 shrink-0 text-muted-foreground" /> : <Briefcase className="size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.lastRun ? `${formatRelativeInstant(s.lastRun.startedAt)}${s.lastRun.resultsNew ? ` · ${s.lastRun.resultsNew} nouveau${s.lastRun.resultsNew > 1 ? "x" : ""}` : ""}` : "Jamais lancée"}
                </span>
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Lancer ${s.name}`}
                disabled={running !== null}
                onClick={() => {
                  setRunning(s.id);
                  run(() => runSearchAction(s.id), {
                    success: (d) => `${d.resultsFound} résultat${d.resultsFound > 1 ? "s" : ""}, ${d.resultsNew} nouveau${d.resultsNew > 1 ? "x" : ""}`,
                    onSuccess: () => setRunning(null),
                    onError: () => setRunning(null),
                  });
                }}
              >
                {running === s.id ? <Spinner /> : <Play />}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2 py-2">
          <p className="copy-sm text-muted-foreground">Aucune recherche pour l’instant. Décris ce que tu cherches, ou :</p>
          <Button size="sm" variant="outline" onClick={onNew}>
            <Plus /> Chercher des offres
          </Button>
        </div>
      )}
    </Card>
  );
}

function ThreadsCard({ threads, onOpen, onNew }: { threads: HubThread[]; onOpen: (id: string) => void; onNew: () => void }) {
  return (
    <Card
      title="Discussions récentes"
      action={
        <button type="button" onClick={onNew} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Plus className="size-3.5" /> Nouvelle
        </button>
      }
    >
      {threads.length ? (
        <ul className="-mx-1">
          {threads.slice(0, 6).map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onOpen(t.id)} className={cn("flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-hover")}>
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeInstant(t.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 copy-sm text-muted-foreground">Tes conversations avec Claude apparaîtront ici.</p>
      )}
    </Card>
  );
}
