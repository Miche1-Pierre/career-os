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
        <p className="text-sm text-muted-foreground">Exact versions used for this application — kept even if the files change later.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Paperclip /> Attach
        </Button>
      </div>
      {opp.documents.length === 0 ? (
        <EmptyState icon={FileText} title="No document attached" description="Pick the CV and letter you send: Career OS remembers the exact version.">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> Attach a document
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
                  {link.version.displayPath ?? link.version.fileName} · attached {formatISODate(String(link.attachedAt).slice(0, 10), "medium", dateLocale)}
                </div>
              </div>
              {link.version.storage !== "EXTERNAL" && (
                <>
                  <Button size="xs" variant="outline" asChild>
                    <a href={`/api/files/versions/${link.version.id}`} target="_blank" rel="noopener noreferrer">
                      <Eye /> Open
                    </a>
                  </Button>
                  <Button size="icon-xs" variant="ghost" asChild>
                    <a href={`/api/files/versions/${link.version.id}?download=1`} aria-label="Download">
                      <Download />
                    </a>
                  </Button>
                </>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Detach"
                onClick={async () => {
                  if (await confirm({ title: "Detach this document?", description: "The document itself is kept in your library." })) run(() => detachDocumentAction(link.id), { success: "Detached" });
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
          <p className="mb-1 text-xs font-medium text-muted-foreground">Still missing</p>
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
          <DialogTitle>Attach a document</DialogTitle>
          <DialogDescription>Choose which document — and which exact version — you use for this application.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label="Used as">
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
                    {missingRoles.includes(k) && <span className="text-xs text-info-800"> · missing</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Document version">
            <Select value={versionId ?? undefined} onValueChange={setVersionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={versions.length ? "Choose a version" : "Your library is empty"} />
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
              No {DOCUMENT_KIND_META[role].label.toLowerCase()} in your library yet.{" "}
              <Link href="/documents?new=1" className="text-primary underline underline-offset-2">
                Add one
              </Link>
              .
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!versionId || pending} onClick={() => versionId && run(() => attachDocumentAction({ opportunityId: opp.id, documentVersionId: versionId, role }), { success: "Document attached", onSuccess: onClose })}>
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
