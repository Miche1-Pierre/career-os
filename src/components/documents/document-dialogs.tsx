"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, FolderOpen, Link2, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, TagInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { addVersionAction, createDocumentAction, registerLibraryFilesAction, scanLibraryAction } from "@/app/actions/documents";
import { DOCUMENT_KINDS, DOCUMENT_KIND_META, type DocumentKind } from "@/lib/constants";
import { pluralize } from "@/lib/text";

type Scan = Awaited<ReturnType<typeof scanLibraryAction>> extends { ok: true; data: infer D } | { ok: false } ? D : never;

function KindSelect({ value, onChange }: { value: DocumentKind; onChange: (v: DocumentKind) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DocumentKind)}>
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
  );
}

function FilePicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted-background">
      <FileUp className="size-5" />
      {file ? (
        <span className="text-foreground">
          {file.name} <span className="text-muted-foreground">({Math.round(file.size / 1024)} Ko)</span>
        </span>
      ) : (
        <span>Choisir un fichier (PDF, DOCX, images…)</span>
      )}
      <input type="file" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

/** New document: upload, pick from the library folder, or reference a path. */
export function NewDocumentDialog({ open, onOpenChange, libraryHostRoot }: { open: boolean; onOpenChange: (o: boolean) => void; libraryHostRoot: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"upload" | "library" | "path">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocumentKind>("CV");
  const [tags, setTags] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [libraryFiles, setLibraryFiles] = useState<Scan["newFiles"] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tab !== "library" || libraryFiles) return;
    scanLibraryAction().then((r) => (r.ok ? setLibraryFiles(r.data.newFiles) : toast.error(r.error)));
  }, [tab, libraryFiles]);

  async function save() {
    setSaving(true);
    const form = new FormData();
    form.set("name", name.trim() || file?.name.replace(/\.[^.]+$/, "") || path.split(/[\\/]/).pop() || "Document");
    form.set("kind", kind);
    form.set("tags", tags.join(","));
    if (label) form.set("label", label);
    if (tab === "upload" && file) form.set("file", file);
    if (tab !== "upload" && path) form.set("path", path);
    const r = await createDocumentAction(form);
    setSaving(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Document ajouté");
    onOpenChange(false);
    router.push(`/documents/${r.data.id}`);
  }

  const canSave = (tab === "upload" && !!file) || (tab !== "upload" && !!path.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter un document</DialogTitle>
          <DialogDescription>Career OS garde une copie figée de chaque version — ce que vous avez envoyé reste accessible même si le fichier change.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="upload">
              <FileUp /> Téléverser
            </TabsTrigger>
            <TabsTrigger value="library">
              <FolderOpen /> Depuis mon dossier
            </TabsTrigger>
            <TabsTrigger value="path">
              <Link2 /> Chemin
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="pt-2">
            <FilePicker
              file={file}
              onChange={(f) => {
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">Enregistré dans votre dossier de documents ({libraryHostRoot}) — les fichiers existants ne sont jamais écrasés.</p>
          </TabsContent>
          <TabsContent value="library" className="pt-2">
            {!libraryFiles ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Analyse de {libraryHostRoot}…
              </p>
            ) : libraryFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun fichier non enregistré dans {libraryHostRoot}. Déposez-y des fichiers ou utilisez Téléverser.</p>
            ) : (
              <Select
                value={path || undefined}
                onValueChange={(v) => {
                  setPath(v);
                  const f = libraryFiles.find((x) => x.relativePath === v);
                  if (f) {
                    if (!name) setName(f.suggestedName);
                    setKind(f.suggestedKind);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un fichier de votre dossier" />
                </SelectTrigger>
                <SelectContent>
                  {libraryFiles.map((f) => (
                    <SelectItem key={f.relativePath} value={f.relativePath}>
                      {f.relativePath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </TabsContent>
          <TabsContent value="path" className="space-y-1 pt-2">
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder={`${libraryHostRoot}\\CV\\CV-HealthTech.pdf`} />
            <p className="text-xs text-muted-foreground">Dans votre dossier de documents → suivi et copié. Ailleurs → conservé comme simple référence (Career OS ne peut pas le lire).</p>
          </TabsContent>
        </Tabs>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nom">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CV HealthTech" />
          </FormField>
          <FormField label="Type">
            <KindSelect value={kind} onChange={setKind} />
          </FormField>
          <FormField label="Libellé de version (facultatif)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Ajout du projet AWS" />
          </FormField>
          <FormField label="Tags">
            <TagInput value={tags} onChange={setTags} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving && <Loader2 className="animate-spin" />} Ajouter le document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** New version of an existing document (upload or library path). */
export function NewVersionDialog({ documentId, defaultPath, open, onOpenChange }: { documentId: string; defaultPath?: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, pending } = useAction();
  const [tab, setTab] = useState<"upload" | "path">(defaultPath ? "path" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState(defaultPath ?? "");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const save = () => {
    const form = new FormData();
    if (tab === "upload" && file) form.set("file", file);
    if (tab === "path") form.set("path", path);
    if (label) form.set("label", label);
    if (notes) form.set("notes", notes);
    run(() => addVersionAction(documentId, form), { success: "Nouvelle version enregistrée", onSuccess: () => onOpenChange(false) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle version</DialogTitle>
          <DialogDescription>Les versions précédentes restent rattachées aux candidatures qui les ont utilisées.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="upload">Téléverser</TabsTrigger>
            <TabsTrigger value="path">Fichier de mon dossier</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="pt-2">
            <FilePicker file={file} onChange={setFile} />
          </TabsContent>
          <TabsContent value="path" className="pt-2">
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="CV/CV-HealthTech.pdf" />
            <p className="mt-1 text-xs text-muted-foreground">Même fichier modifié sur place ? Gardez son chemin : le nouveau contenu devient la version suivante.</p>
          </TabsContent>
        </Tabs>
        <FormField label="Qu’est-ce qui change ?">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Résumé réécrit pour les postes IA" />
        </FormField>
        <FormField label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={save} disabled={pending || (tab === "upload" ? !file : !path.trim())}>
            Enregistrer la version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Scan the documents folder: register new files, spot modified ones. */
export function ScanLibraryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, pending } = useAction();
  const [scan, setScan] = useState<Scan | null>(null);
  const [selected, setSelected] = useState<Record<string, { enabled: boolean; name: string; kind: DocumentKind }>>({});
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    scanLibraryAction().then((r) => {
      if (cancelled) return;
      if (!r.ok) return void toast.error(r.error);
      setScan(r.data);
      setSelected(Object.fromEntries(r.data.newFiles.map((f) => [f.relativePath, { enabled: true, name: f.suggestedName, kind: f.suggestedKind }])));
    });
    return () => {
      cancelled = true;
      setScan(null); // next opening starts with a fresh scan
    };
  }, [open]);
  const register = () =>
    run(
      () =>
        registerLibraryFilesAction(
          Object.entries(selected)
            .filter(([, v]) => v.enabled)
            .map(([relativePath, v]) => ({ relativePath, name: v.name, kind: v.kind })),
        ),
      { success: (d) => `${d.length} document${d.length > 1 ? "s" : ""} enregistré${d.length > 1 ? "s" : ""}`, onSuccess: () => onOpenChange(false) },
    );
  const versionUp = (documentId: string, relativePath: string) => {
    const form = new FormData();
    form.set("path", relativePath);
    form.set("label", "Fichier mis à jour");
    run(() => addVersionAction(documentId, form), { success: "Nouvelle version créée", onSuccess: () => setScan((s) => (s ? { ...s, modified: s.modified.filter((m) => m.documentId !== documentId) } : s)) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="size-5" /> Analyser le dossier de documents
          </DialogTitle>
        </DialogHeader>
        {!scan ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Analyse en cours…
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{pluralize(scan.totalFiles, "fichier")} trouvé{scan.totalFiles > 1 ? "s" : ""}.</p>
            {scan.modified.length > 0 && (
              <section className="space-y-2">
                <h3 className="heading-sm text-foreground">Modifiés depuis leur dernière version</h3>
                {scan.modified.map((m) => (
                  <div key={m.documentId} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <span className="min-w-0 truncate">
                      {m.documentName} <span className="text-muted-foreground">(v{m.version}) — {m.relativePath}</span>
                    </span>
                    <Button size="xs" onClick={() => versionUp(m.documentId, m.relativePath)} disabled={pending}>
                      Créer la v{m.version + 1}
                    </Button>
                  </div>
                ))}
              </section>
            )}
            <section className="space-y-2">
              <h3 className="heading-sm text-foreground">Nouveaux fichiers ({scan.newFiles.length})</h3>
              {scan.newFiles.length === 0 && <p className="text-sm text-muted-foreground">Tout le contenu du dossier est déjà enregistré.</p>}
              {scan.newFiles.map((f) => {
                const s = selected[f.relativePath];
                return (
                  <div key={f.relativePath} className="grid items-center gap-2 rounded-lg border p-2 sm:grid-cols-[auto_1fr_1fr_180px]">
                    <Checkbox checked={s?.enabled} onCheckedChange={(v) => setSelected((x) => ({ ...x, [f.relativePath]: { ...x[f.relativePath], enabled: !!v } }))} />
                    <span className="truncate text-xs text-muted-foreground" title={f.displayPath}>
                      {f.relativePath}
                    </span>
                    <Input value={s?.name ?? ""} onChange={(e) => setSelected((x) => ({ ...x, [f.relativePath]: { ...x[f.relativePath], name: e.target.value } }))} className="h-7" />
                    <KindSelect value={s?.kind ?? "OTHER"} onChange={(k) => setSelected((x) => ({ ...x, [f.relativePath]: { ...x[f.relativePath], kind: k } }))} />
                  </div>
                );
              })}
            </section>
            {scan.missing.length > 0 && (
              <section className="space-y-1">
                <h3 className="heading-sm text-foreground">Absents du dossier</h3>
                {scan.missing.map((m) => (
                  <p key={m.relativePath} className="text-xs text-muted-foreground">
                    {m.documentName} v{m.version} — {m.relativePath} {m.hasSnapshot ? "(copie conservée ✓)" : "(aucune copie)"}
                  </p>
                ))}
              </section>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button onClick={register} disabled={pending || !scan || !Object.values(selected).some((v) => v.enabled)}>
            Enregistrer la sélection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
