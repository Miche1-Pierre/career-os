"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/app/markdown";
import { useAction } from "@/hooks/use-action";
import { updateOpportunityAction } from "@/app/actions/opportunities";
import type { OpportunityDetail } from "@/server/services/opportunities";

const TEMPLATE = `## Pourquoi cette opportunité m'intéresse

## Personnes rencontrées

## Questions

## À faire
`;

export function DetailNotes({ opp }: { opp: OpportunityDetail }) {
  const { run, pending } = useAction();
  const [notes, setNotes] = useState(opp.notes ?? "");
  const dirty = notes !== (opp.notes ?? "");
  return (
    <div className="space-y-3">
      <MarkdownEditor value={notes} onChange={setNotes} minRows={16} placeholder="Vos notes au fil de l’eau sur cette opportunité (Markdown)…" />
      <div className="flex items-center justify-between gap-2">
        {!notes && (
          <Button variant="ghost" size="sm" onClick={() => setNotes(TEMPLATE)}>
            Utiliser un modèle
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>}
          <Button size="sm" disabled={!dirty || pending} onClick={() => run(() => updateOpportunityAction(opp.id, { notes: notes || null }), { success: "Notes enregistrées" })}>
            Enregistrer les notes
          </Button>
        </div>
      </div>
    </div>
  );
}
