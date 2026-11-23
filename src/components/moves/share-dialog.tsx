"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/app/fields";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { createShareAction, listSharesAction, revokeShareAction } from "@/app/actions/moves";
import { formatISODate } from "@/lib/dates";
import type { ShareLink } from "@/server/db/schema";

type ShareRow = ShareLink & { active: boolean };

const EXPIRY = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "3 mois" },
  { value: "none", label: "Jusqu’à révocation" },
];

/** Read-only links to the housing shortlist (for the family): create, copy, revoke. */
export function ShareDialog({ moveId, open, onOpenChange }: { moveId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const { dateLocale } = useAppData();
  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [label, setLabel] = useState("Parents");
  const [showSavings, setShowSavings] = useState(false);
  const [expiry, setExpiry] = useState("30");
  // Only read inside the dialog content, which is never server-rendered.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(() => {
    void listSharesAction(moveId).then((r) => r.ok && setRows(r.data as ShareRow[]));
  }, [moveId]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const link = (token: string) => `${origin}/share/${token}`;
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(link(token));
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible : sélectionne le lien affiché dans la liste");
    }
  };
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  const active = (rows ?? []).filter((r) => r.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Partager la shortlist</DialogTitle>
          <DialogDescription>Un lien en lecture seule : prix, dates, bail, trajet et statut des annonces en cours. Sans les contacts, tes notes ni ton revenu.</DialogDescription>
        </DialogHeader>

        {local && (
          <p className="flex gap-2 rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-700">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              L’app tourne sur ton ordinateur : le lien ne s’ouvrira pas chez quelqu’un d’autre tant qu’elle n’est pas en ligne (voir docs/DEPLOYMENT.md). En attendant, ouvre-le et choisis « Imprimer ou enregistrer en PDF » pour envoyer le PDF.
            </span>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Pour qui" htmlFor="share-label">
            <Input id="share-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </FormField>
          <FormField label="Valable">
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Switch checked={showSavings} onCheckedChange={setShowSavings} className="mt-0.5" />
          <span>
            Montrer l’épargne estimée par logement
            <span className="block text-xs text-muted-foreground">Elle laisse deviner ton revenu.</span>
          </span>
        </label>
        <Button
          variant="highlight"
          disabled={pending}
          onClick={() =>
            run(() => createShareAction(moveId, { label: label.trim() || null, showSavings, expiresInDays: expiry === "none" ? null : Number(expiry) }), {
              success: "Lien créé",
              onSuccess: (row) => {
                void copy(row.token);
                load();
              },
            })
          }
        >
          <Link2 /> Créer et copier le lien
        </Button>

        {active.length > 0 && (
          <div className="space-y-2 border-t border-separator pt-3">
            <p className="heading-sm text-foreground">Liens actifs</p>
            <ul className="space-y-2">
              {active.map((r) => (
                <li key={r.id} className="flex items-end gap-1 text-sm">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate">
                      {r.label ?? "Lien"} {r.showSavings && <Badge size="sm">épargne visible</Badge>}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {r.viewCount} vue{r.viewCount > 1 ? "s" : ""}
                        {r.expiresAt ? ` · jusqu’au ${formatISODate(new Date(r.expiresAt).toISOString().slice(0, 10), "medium", dateLocale)}` : " · sans limite"}
                      </span>
                    </span>
                    {/* Shown in full so it can be copied by hand when the clipboard is not available. */}
                    <Input readOnly value={link(r.token)} onFocus={(e) => e.currentTarget.select()} className="h-7 font-mono text-xs" aria-label="Lien de partage" />
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => copy(r.token)} aria-label="Copier le lien">
                    <Copy />
                  </Button>
                  <Button size="icon-sm" variant="ghost" asChild aria-label="Ouvrir">
                    <a href={link(r.token)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await confirm({ title: "Révoquer ce lien ?", description: "Il cessera de fonctionner pour tous ceux qui l’ont.", confirmLabel: "Révoquer", destructive: true }))
                        run(() => revokeShareAction(r.id), { success: "Lien révoqué", onSuccess: load });
                    }}
                  >
                    Révoquer
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
