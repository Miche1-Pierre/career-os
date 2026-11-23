"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { removeApiKeyAction, saveApiKeyAction } from "@/app/actions/settings";
import type { AIStatus } from "@/server/ai";
import { cn } from "@/lib/utils";

const CONSOLE_KEYS_URL = "https://console.anthropic.com/settings/keys";

/**
 * Paste a Claude API key and the assistant is on: the key is checked with Anthropic, stored on this computer and used
 * right away by the chat, the searches and the analyses. Nothing to edit by hand.
 */
export function ApiKeyField({ status, onChange, compact = false }: { status: Pick<AIStatus, "apiKey" | "available">; onChange?: (status: AIStatus) => void; compact?: boolean }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fromApp = status.apiKey?.source === "app";

  const connect = () => {
    if (!value.trim()) return;
    setError(null);
    void run(() => saveApiKeyAction(value), {
      success: "Clé connectée : l'assistant est prêt",
      onSuccess: (s) => {
        setValue("");
        onChange?.(s);
      },
      onError: setError,
    });
  };

  if (fromApp) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-transparent bg-emerald-50 px-3.5 py-3 dark:bg-emerald-950">
        <CheckCircle2 className="size-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="label-sm text-emerald-800 dark:text-emerald-200">Clé Claude connectée</p>
          <p className="copy-xs text-muted-foreground">
            <code>{status.apiKey?.hint}</code> · enregistrée sur cet ordinateur
          </p>
        </div>
        {confirmRemove ? (
          <div className="flex items-center gap-2">
            <span className="copy-xs text-muted-foreground">L&apos;assistant s&apos;arrêtera.</span>
            <Button size="sm" variant="outline" onClick={() => setConfirmRemove(false)} disabled={pending}>
              Annuler
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => void run(() => removeApiKeyAction(), { success: "Clé retirée", onSuccess: (s) => (setConfirmRemove(false), onChange?.(s)) })}>
              Retirer
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmRemove(true)}>
            Retirer la clé
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {status.apiKey?.source === "env" && (
        <p className="copy-xs text-muted-foreground">
          Une clé est déjà définie à l&apos;installation (<code>{status.apiKey.hint}</code>). Colles-en une autre pour la remplacer.
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => (setValue(e.target.value), setError(null))}
            placeholder="Colle ta clé Claude (sk-ant-…)"
            aria-label="Clé API Claude"
            aria-invalid={Boolean(error)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="highlight" disabled={pending || !value.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Connecter
        </Button>
      </form>
      {error && <p className="copy-xs text-destructive">{error}</p>}
      <p className="copy-xs text-muted-foreground">
        Pas encore de clé ?{" "}
        <a className="inline-flex items-center gap-1 font-medium text-highlight-600 hover:underline" href={CONSOLE_KEYS_URL} target="_blank" rel="noopener noreferrer">
          Crée-la sur le site d&apos;Anthropic <ExternalLink className="size-3" />
        </a>
        , puis colle-la ici. Elle reste sur cet ordinateur.
      </p>
    </div>
  );
}
