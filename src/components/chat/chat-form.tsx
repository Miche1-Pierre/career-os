"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Radar, TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { SearchForm, type SearchFormResult, type SearchMoveOption } from "@/components/discovery/search-form";
import { getSearchFormDataAction } from "@/app/actions/discovery";
import { DISCOVERY_SOURCES } from "@/lib/discovery";
import type { ChatFormSpec } from "@/lib/chat-forms";

export { formKey, parseChatForm, type ChatFormSpec } from "@/lib/chat-forms";

let formData: { moves: SearchMoveOption[]; adzunaReady: boolean } | null = null;

const DONE_KEY = "cos-chat-forms";
function readDone(key: string): SearchFormResult | null {
  try {
    return (JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, SearchFormResult>)[key] ?? null;
  } catch {
    return null;
  }
}
function saveDone(key: string, result: SearchFormResult) {
  try {
    const all = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, SearchFormResult>;
    all[key] = result;
    localStorage.setItem(DONE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function ChatForm({ spec, storageKey, onResult }: { spec: ChatFormSpec; storageKey: string; onResult?: (result: SearchFormResult) => void }) {
  const router = useRouter();
  const [data, setData] = useState(formData);
  const [done, setDone] = useState<SearchFormResult | null>(() => readDone(storageKey));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (formData) return;
    void getSearchFormDataAction().then((r) => {
      if (!r.ok) return;
      formData = r.data;
      setData(r.data);
    });
  }, []);

  if (dismissed) return <p className="text-xs text-muted-foreground">Formulaire fermé.</p>;
  if (done) return <ResultCard result={done} moveId={spec.moveId ?? null} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Préparation du formulaire…
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-background p-3 shadow-card dark:shadow-none">
      <p className="mb-3 flex items-center gap-1.5 heading-sm text-foreground">
        <Radar className="size-4 text-highlight-500" />
        {spec.domain === "HOUSING" ? "Recherche de logement" : "Recherche d’offres"}
      </p>
      <SearchForm
        initial={spec}
        moves={data.moves}
        sources={DISCOVERY_SOURCES}
        adzunaReady={data.adzunaReady}
        compact
        runAfterSave
        onCancel={() => setDismissed(true)}
        onDone={(result) => {
          saveDone(storageKey, result);
          setDone(result);
          onResult?.(result);
          router.refresh();
        }}
      />
    </div>
  );
}

function ResultCard({ result, moveId }: { result: SearchFormResult; moveId: string | null }) {
  const failed = result.run?.status === "FAILED";
  const target = result.domain === "HOUSING" ? (result.moveId ?? moveId ? `/moves/${result.moveId ?? moveId}?tab=housing` : "/moves") : "/inbox";
  return (
    <div className="space-y-1.5 rounded-2xl border border-border bg-background p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        {failed ? <TriangleAlert className="size-4 text-warning-700" /> : <CheckCircle2 className="size-4 text-success-700" />}
        Recherche « {result.name} » {result.run ? (failed ? "enregistrée, mais le lancement a échoué" : "lancée") : "enregistrée"}
      </p>
      {result.run && !failed && (
        <p className="text-muted-foreground">
          {result.run.resultsFound} résultat{result.run.resultsFound > 1 ? "s" : ""}, dont {result.run.resultsNew} nouveau{result.run.resultsNew > 1 ? "x" : ""}.
        </p>
      )}
      {failed && result.run?.error && <p className="text-warning-700">{result.run.error}</p>}
      <div className="flex flex-wrap gap-3 pt-0.5 text-sm">
        {result.run && result.run.resultsNew > 0 && (
          <Link href={target} className="text-highlight-700 hover:underline">
            {result.domain === "HOUSING" ? "Voir les logements" : "Voir les offres à trier"}
          </Link>
        )}
        <Link href="/searches" className="text-highlight-700 hover:underline">
          Mes recherches
        </Link>
      </div>
    </div>
  );
}
