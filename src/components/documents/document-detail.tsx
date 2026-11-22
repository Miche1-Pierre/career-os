"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Download, Eye, FileClock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageContainer } from "@/components/app/page-header";
import { StageBadge, TagList } from "@/components/app/badges";
import { FormField, TagInput } from "@/components/app/fields";
import { useAppData } from "@/components/app/app-data";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { archiveDocumentAction, deleteDocumentAction, deleteVersionAction, updateDocumentAction, updateVersionAction } from "@/app/actions/documents";
import { DOCUMENT_KINDS, DOCUMENT_KIND_META, type DocumentKind } from "@/lib/constants";
import { formatInstant, formatISODate } from "@/lib/dates";
import type { getDocument } from "@/server/services/documents";
import { FILE_STATUS } from "./documents-library";
import { NewVersionDialog } from "./document-dialogs";
import { cn } from "@/lib/utils";

type DocDetail = Awaited<ReturnType<typeof getDocument>>;

function size(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.round(bytes / 1024)} Ko`;
}

export function DocumentDetailView({ data }: { data: DocDetail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run } = useAction();
  const { timezone, dateLocale } = useAppData();
  const doc = data.document;
  const [editing, setEditing] = useState(false);
  const [newVersion, setNewVersion] = useState(false);
  const latest = data.versions[0];
  const inline = latest?.fileName?.toLowerCase().endsWith(".pdf") && latest.storage !== "EXTERNAL";

  return (
    <PageContainer wide className="space-y-5">
      <Link href="/documents" className="text-xs text-muted-foreground hover:text-foreground">
        ← Documents
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{DOCUMENT_KIND_META[doc.kind].label}</p>
          <h1 className="heading-2xl text-foreground">{doc.name}</h1>
          {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
          <TagList tags={doc.tags} max={10} />
          <p className="text-sm">
            {data.usages.length ? (
              <span>
                Document utilisé par <span className="font-semibold">{new Set(data.usages.map((u) => u.opportunityId)).size}</span> candidature
                {new Set(data.usages.map((u) => u.opportunityId)).size > 1 ? "s" : ""}.
              </span>
            ) : (
              <span className="text-muted-foreground">Utilisé par aucune candidature pour l’instant.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setNewVersion(true)}>
            <Plus /> Nouvelle version
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Modifier
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Plus d’actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => run(() => archiveDocumentAction(doc.id, !doc.archivedAt), { success: doc.archivedAt ? "Désarchivé" : "Archivé" })}>
                {doc.archivedAt ? <ArchiveRestore /> : <Archive />} {doc.archivedAt ? "Désarchiver" : "Archiver"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: "Mettre ce document à la corbeille ?", description: "Les versions utilisées par des candidatures sont toujours conservées. Vos fichiers sur le disque ne sont jamais supprimés.", destructive: true, confirmLabel: "Mettre à la corbeille" }))
                    run(() => deleteDocumentAction(doc.id), { success: "Mis à la corbeille", onSuccess: () => router.push("/documents") });
                }}
              >
                <Trash2 /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="space-y-2">
            <h2 className="heading-sm text-foreground">Versions</h2>
            <ul className="surface-list">
              {data.versions.map((v) => (
                <li key={v.id} className="space-y-1 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 text-xs font-semibold tabular-nums">v{v.version}</span>
                    <span className="text-sm">{v.label ?? <span className="text-muted-foreground">Sans libellé</span>}</span>
                    <span className="text-xs text-muted-foreground">{formatInstant(v.createdAt, { timeZone: timezone, locale: dateLocale, withTime: false })}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("ml-auto text-xs", FILE_STATUS[v.fileStatus].className)}>{FILE_STATUS[v.fileStatus].label}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">{FILE_STATUS[v.fileStatus].hint}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="max-w-full truncate font-mono" title={v.displayPath ?? ""}>
                      {v.displayPath ?? v.fileName}
                    </span>
                    {v.displayPath && (
                      <button type="button" onClick={() => (navigator.clipboard.writeText(v.displayPath!), toast.success("Chemin copié"))} aria-label="Copier le chemin">
                        <Copy className="size-3" />
                      </button>
                    )}
                    <span>{size(v.sizeBytes)}</span>
                    {v.checksum && <span className="font-mono">sha256:{v.checksum.slice(0, 10)}</span>}
                    <span>{v.usageCount ? `utilisée ${v.usageCount} fois` : "inutilisée"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {v.snapshotKey && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="xs" variant="outline" asChild>
                            <a href={`/api/files/versions/${v.id}?source=snapshot`} target="_blank" rel="noopener noreferrer">
                              <FileClock /> Telle qu’envoyée
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>La copie figée prise à l’enregistrement de cette version</TooltipContent>
                      </Tooltip>
                    )}
                    {v.storage !== "EXTERNAL" && (
                      <Button size="xs" variant="ghost" asChild>
                        <a href={`/api/files/versions/${v.id}?source=current`} target="_blank" rel="noopener noreferrer">
                          <Eye /> Fichier actuel
                        </a>
                      </Button>
                    )}
                    {v.storage !== "EXTERNAL" && (
                      <Button size="xs" variant="ghost" asChild>
                        <a href={`/api/files/versions/${v.id}?download=1`}>
                          <Download /> Télécharger
                        </a>
                      </Button>
                    )}
                    <VersionLabelButton id={v.id} label={v.label} notes={v.notes} />
                    {v.usageCount === 0 && data.versions.length > 1 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={async () => {
                          if (await confirm({ title: `Supprimer la v${v.version} ?`, description: "Seul l’enregistrement de cette version inutilisée est supprimé ; le fichier sur le disque est conservé.", destructive: true, confirmLabel: "Supprimer" }))
                            run(() => deleteVersionAction(v.id), { success: "Version supprimée" });
                        }}
                      >
                        <Trash2 /> Supprimer
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="heading-sm text-foreground">Utilisé dans</h2>
            {data.usages.length === 0 ? (
              <p className="text-sm text-muted-foreground">À joindre depuis une candidature → onglet Documents.</p>
            ) : (
              <ul className="surface-list">
                {data.usages.map((u) => {
                  const version = data.versions.find((v) => v.id === u.versionId);
                  return (
                    <li key={u.linkId}>
                      <Link href={`/applications/${u.opportunityId}?tab=documents`} className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-muted-background">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {u.organizationName ? `${u.organizationName} — ` : ""}
                          {u.opportunityTitle}
                        </span>
                        <span className="rounded bg-muted px-1 text-xs tabular-nums">v{version?.version}</span>
                        <StageBadge label={u.stageLabel} category={u.stageCategory} />
                        {u.appliedAt && <span className="text-xs text-muted-foreground">postulé le {formatISODate(u.appliedAt, "dayMonth", dateLocale)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <div className="min-h-96 overflow-hidden surface">
          {inline ? (
            <iframe title={`Aperçu de ${doc.name}`} src={`/api/files/versions/${latest!.id}?source=current`} className="h-[75vh] w-full" />
          ) : (
            <div className="flex h-full min-h-96 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {latest ? (latest.storage === "EXTERNAL" ? "Cette version est une référence vers un chemin hors de votre dossier de documents — pas d’aperçu." : "Aperçu disponible pour les fichiers PDF. Utilisez Télécharger pour les autres formats.") : "Aucune version pour l’instant."}
            </div>
          )}
        </div>
      </div>
      {newVersion && <NewVersionDialog documentId={doc.id} defaultPath={latest?.storage === "LIBRARY" ? latest.relativePath : null} open={newVersion} onOpenChange={setNewVersion} />}
      {editing && <EditDocumentDialog doc={doc} onClose={() => setEditing(false)} />}
    </PageContainer>
  );
}

function VersionLabelButton({ id, label, notes }: { id: string; label: string | null; notes: string | null }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [l, setL] = useState(label ?? "");
  const [n, setN] = useState(notes ?? "");
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil /> Libellé
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Libellé de la version</DialogTitle>
          </DialogHeader>
          <Input value={l} onChange={(e) => setL(e.target.value)} placeholder="Qu’est-ce qui change dans cette version ?" />
          <Textarea value={n} onChange={(e) => setN(e.target.value)} rows={3} placeholder="Notes" />
          <DialogFooter>
            <Button disabled={pending} onClick={() => run(() => updateVersionAction(id, { label: l || null, notes: n || null }), { success: "Enregistré", onSuccess: () => setOpen(false) })}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditDocumentDialog({ doc, onClose }: { doc: DocDetail["document"]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(doc.name);
  const [kind, setKind] = useState<DocumentKind>(doc.kind);
  const [description, setDescription] = useState(doc.description ?? "");
  const [tags, setTags] = useState(doc.tags);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le document</DialogTitle>
        </DialogHeader>
        <FormField label="Nom">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Type">
          <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {DOCUMENT_KIND_META[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </FormField>
        <FormField label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </FormField>
        <DialogFooter>
          <Button disabled={pending || !name.trim()} onClick={() => run(() => updateDocumentAction(doc.id, { name: name.trim(), kind, description: description || null, tags }), { success: "Enregistré", onSuccess: onClose })}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
