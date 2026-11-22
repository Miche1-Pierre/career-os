"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, FileText, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/app/fields";
import { EmptyState } from "@/components/app/empty-state";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { attachDocumentAction, detachDocumentAction } from "@/app/actions/opportunities";
import { DOCUMENT_KINDS, DOCUMENT_KIND_META, type DocumentKind } from "@/lib/constants";
import { formatISODate } from "@/lib/dates";
import type { OpportunityDetail } from "@/server/services/opportunities";

export interface VersionOption {
  versionId: string;
  documentId: string;
  documentName: string;
  kind: DocumentKind;
  version: number;
  label: string | null;
  fileName: string | null;
  createdAt: string;
}

export function DetailDocuments({ opp, versions }: { opp: OpportunityDetail; versions: VersionOption[] }) {
  const { dateLocale } = useAppData();
  const { run } = useAction();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const required = opp.tasks.filter((t) => t.kind === "DOCUMENT" && !t.done);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Versions exactes utilisées pour cette candidature — conservées même si les fichiers changent ensuite.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Paperclip /> Joindre
        </Button>
      </div>
      {opp.documents.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun document joint" description="Choisissez le CV et la lettre envoyés : Career OS retient la version exacte.">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> Joindre un document
          </Button>
        </EmptyState>
      ) : (
        <ul className="surface-list">
          {opp.documents.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <FileText className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="text-muted-foreground">{DOCUMENT_KIND_META[link.role].label} → </span>
                  <Link href={`/documents/${link.document.id}`} className="font-medium hover:underline">
                    {link.document.name}
                  </Link>{" "}
                  <span className="rounded bg-muted px-1 text-xs tabular-nums">v{link.version.version}</span>
                  {link.version.label && <span className="ml-1 text-xs text-muted-foreground">— {link.version.label}</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {link.version.displayPath ?? link.version.fileName} · joint le {formatISODate(String(link.attachedAt).slice(0, 10), "medium", dateLocale)}
                </div>
              </div>
              {link.version.storage !== "EXTERNAL" && (
                <>
                  <Button size="xs" variant="outline" asChild>
                    <a href={`/api/files/versions/${link.version.id}`} target="_blank" rel="noopener noreferrer">
                      <Eye /> Ouvrir
                    </a>
                  </Button>
                  <Button size="icon-xs" variant="ghost" asChild>
                    <a href={`/api/files/versions/${link.version.id}?download=1`} aria-label="Télécharger">
                      <Download />
                    </a>
                  </Button>
                </>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Retirer"
                onClick={async () => {
                  if (await confirm({ title: "Retirer ce document ?", description: "Le document lui-même reste dans votre bibliothèque." })) run(() => detachDocumentAction(link.id), { success: "Document retiré" });
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {required.length > 0 && (
        <div className="rounded-2xl border border-separator bg-muted-background p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Encore manquants</p>
          <ul className="list-disc pl-5 text-sm">
            {required.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        </div>
      )}
      {open && <AttachDialog opp={opp} versions={versions} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AttachDialog({ opp, versions, onClose }: { opp: OpportunityDetail; versions: VersionOption[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const { dateLocale } = useAppData();
  const byDoc = useMemo(() => {
    const map = new Map<string, VersionOption[]>();
    for (const v of versions) map.set(v.documentId, [...(map.get(v.documentId) ?? []), v]);
    return map;
  }, [versions]);
  const missingRoles = opp.tasks.filter((t) => t.autoRule?.startsWith("doc:") && !t.done).map((t) => t.autoRule!.slice(4) as DocumentKind);
  const [role, setRole] = useState<DocumentKind>(missingRoles[0] ?? "CV");
  const candidates = versions.filter((v) => v.kind === role || role === "OTHER");
  const [versionId, setVersionId] = useState<string | null>(candidates[0]?.versionId ?? null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Joindre un document</DialogTitle>
          <DialogDescription>Choisissez le document — et la version exacte — utilisé pour cette candidature.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label="Utilisé comme">
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v as DocumentKind);
                const first = versions.find((x) => x.kind === v);
                setVersionId(first?.versionId ?? null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {DOCUMENT_KIND_META[k].label}
                    {missingRoles.includes(k) && <span className="text-xs text-info-800"> · manquant</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Version du document">
            <Select value={versionId ?? undefined} onValueChange={setVersionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={versions.length ? "Choisir une version" : "Votre bibliothèque est vide"} />
              </SelectTrigger>
              <SelectContent>
                {[...byDoc.entries()]
                  .filter(([, vs]) => role === "OTHER" || vs[0].kind === role || true)
                  .sort(([, a], [, b]) => Number(b[0].kind === role) - Number(a[0].kind === role))
                  .map(([docId, vs]) => (
                    <SelectGroup key={docId}>
                      <SelectLabel>
                        {vs[0].documentName} <span className="font-normal">· {DOCUMENT_KIND_META[vs[0].kind].label}</span>
                      </SelectLabel>
                      {vs.map((v) => (
                        <SelectItem key={v.versionId} value={v.versionId}>
                          v{v.version} {v.label ? `— ${v.label}` : ""} <span className="text-xs text-muted-foreground">({formatISODate(String(v.createdAt).slice(0, 10), "dayMonth", dateLocale)})</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          {candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun document « {DOCUMENT_KIND_META[role].label} » dans votre bibliothèque pour l’instant.{" "}
              <Link href="/documents?new=1" className="text-primary underline underline-offset-2">
                En ajouter un
              </Link>
              .
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!versionId || pending} onClick={() => versionId && run(() => attachDocumentAction({ opportunityId: opp.id, documentVersionId: versionId, role }), { success: "Document joint", onSuccess: onClose })}>
            Joindre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
