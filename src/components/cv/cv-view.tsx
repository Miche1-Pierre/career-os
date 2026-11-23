"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Download, ExternalLink, FileText, Languages, MoreHorizontal, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { FormField } from "@/components/app/fields";
import { EmptyState } from "@/components/app/empty-state";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { adaptSummaryAction, createEntryAction, deleteEntryAction, deleteVariantAction, duplicateVariantAction, exportVariantAction, translateVariantAction, updateEntryAction, updateVariantAction } from "@/app/actions/cv";
import { CV_SECTION_LABEL, CV_SECTIONS, type CvBlock, type CvEntryView, type CvHeader, type CvLang, type CvSection, type CvStyle } from "@/lib/cv";
import type { CvVariant } from "@/server/db/schema";
import { cn } from "@/lib/utils";

interface OppOption {
  id: string;
  label: string;
}

export function CvView({ variants, entries, opportunities, selectedId }: { variants: CvVariant[]; entries: CvEntryView[]; opportunities: OppOption[]; selectedId: string | null }) {
  const router = useRouter();
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;
  const select = (id: string) => router.replace(`/cv?v=${id}`, { scroll: false });

  return (
    <PageContainer wide>
      <PageHeader title="CV" description="Tes CV structurés : une variante par cible et par langue, des entrées réutilisables, un PDF généré sans IA (même contenu, même PDF). Chaque export est une version figée dans Documents." />
      {variants.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun CV structuré" description="Importe tes CV actuels (Claude les découpe en entrées) ou crée une variante à partir de rien." />
      ) : (
        <Tabs defaultValue="variants">
          <TabsList variant="line">
            <TabsTrigger value="variants">Variantes {variants.length}</TabsTrigger>
            <TabsTrigger value="entries">Entrées {entries.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="variants" className="pt-4">
            <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <nav className="space-y-1" aria-label="Variantes">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => select(v.id)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors", v.id === selected?.id ? "bg-muted-background font-medium text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground")}
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    <Badge size="sm" variant="outline">
                      {v.lang.toUpperCase()}
                    </Badge>
                  </button>
                ))}
              </nav>
              {selected && <VariantEditor key={`${selected.id}-${selected.updatedAt}`} variant={selected} entries={entries} opportunities={opportunities} onSelect={select} />}
            </div>
          </TabsContent>
          <TabsContent value="entries" className="pt-4">
            <EntriesLibrary entries={entries} />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}

function VariantEditor({ variant, entries, opportunities, onSelect }: { variant: CvVariant; entries: CvEntryView[]; opportunities: OppOption[]; onSelect: (id: string) => void }) {
  const { dateLocale } = useAppData();
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const initial = useMemo(() => ({ name: variant.name, fileName: variant.fileName ?? "", header: variant.header as CvHeader, sections: variant.sections as CvBlock[], style: { titleStyle: "BOLD_ITALIC" as const, summaryItalic: false, ...(variant.style as Partial<CvStyle>) } }), [variant]);
  const [v, setV] = useState(initial);
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState<null | "export" | "translate">(null);
  const [adapting, setAdapting] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const setSection = (i: number, b: CvBlock) => setV((cur) => ({ ...cur, sections: cur.sections.map((s, j) => (j === i ? b : s)) }));
  const move = (i: number, d: -1 | 1) =>
    setV((cur) => {
      const next = [...cur.sections];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return { ...cur, sections: next };
    });

  const save = () => run(() => updateVariantAction(variant.id, { name: v.name, fileName: v.fileName || null, header: v.header, sections: v.sections, style: v.style }), { success: "CV enregistré", onSuccess: () => setPreviewKey((k) => k + 1) });
  const exportPdf = (opportunityId?: string) => {
    setBusy("export");
    run(() => exportVariantAction(variant.id, opportunityId ?? null), {
      success: (d) => `PDF enregistré : ${d.fileName}${opportunityId ? ", joint à la candidature" : ""}`,
      onSuccess: () => setBusy(null),
      onError: () => setBusy(null),
    });
  };
  const translate = (target: CvLang) => {
    setBusy("translate");
    run(() => translateVariantAction(variant.id, target), { success: "Traduction créée : relis-la avant de l’utiliser", onSuccess: (d) => (setBusy(null), onSelect(d.id)), onError: () => setBusy(null) });
  };

  return (
    <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="@container min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-9 max-w-xs font-medium" aria-label="Nom de la variante" />
          <span className="text-xs text-muted-foreground">{variant.lastExportedAt ? `Dernier export le ${new Date(variant.lastExportedAt).toLocaleDateString(dateLocale)}` : "Jamais exporté"}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={save} disabled={!dirty || pending}>
              Enregistrer
            </Button>
            <Button variant="highlight" onClick={() => exportPdf()} disabled={dirty || busy !== null} title={dirty ? "Enregistre d’abord" : undefined}>
              {busy === "export" ? <Spinner /> : <Download />} Exporter en PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Plus d’actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/cv/variants/${variant.id}/pdf`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Ouvrir le PDF
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAdapting(true)} disabled={dirty}>
                  <Wand2 /> Adapter l’accroche à une offre (Claude)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => translate(variant.lang === "fr" ? "en" : "fr")} disabled={dirty || busy !== null}>
                  <Languages /> Traduire en {variant.lang === "fr" ? "anglais" : "français"} (Claude)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run(() => duplicateVariantAction(variant.id), { success: "Variante dupliquée", onSuccess: (d) => onSelect(d.id) })}>
                  <Copy /> Dupliquer
                </DropdownMenuItem>
                {variant.documentId && (
                  <DropdownMenuItem asChild>
                    <Link href={`/documents/${variant.documentId}`}>
                      <FileText /> Versions exportées
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    if (await confirm({ title: "Supprimer cette variante ?", description: "Les PDF déjà exportés restent dans Documents.", confirmLabel: "Supprimer", destructive: true })) run(() => deleteVariantAction(variant.id), { success: "Variante supprimée" });
                  }}
                >
                  <Trash2 /> Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {busy === "translate" && <p className="copy-sm text-muted-foreground">Claude traduit la variante (une à deux minutes)…</p>}

        <section className="surface space-y-3 px-4 py-4">
          <h2 className="label-sm text-foreground">En-tête</h2>
          <div className="grid gap-3 @xl:grid-cols-2">
            <FormField label="Nom">
              <Input value={v.header.name} onChange={(e) => setV({ ...v, header: { ...v.header, name: e.target.value } })} />
            </FormField>
            <FormField label="Titre (à droite)">
              <Input value={v.header.title} onChange={(e) => setV({ ...v, header: { ...v.header, title: e.target.value } })} />
            </FormField>
            <FormField label="Lignes sous le nom" hint="Une par ligne">
              <Textarea rows={2} value={v.header.lines.join("\n")} onChange={(e) => setV({ ...v, header: { ...v.header, lines: e.target.value.split("\n").slice(0, 4) } })} />
            </FormField>
            <FormField label="Liens (à droite)" hint="Un par ligne">
              <Textarea rows={2} value={v.header.links.join("\n")} onChange={(e) => setV({ ...v, header: { ...v.header, links: e.target.value.split("\n").slice(0, 4) } })} />
            </FormField>
            <FormField label="Titres des expériences">
              <Select value={v.style.titleStyle} onValueChange={(t) => setV({ ...v, style: { ...v.style, titleStyle: t as CvStyle["titleStyle"] } })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLD_ITALIC">Tout en gras italique</SelectItem>
                  <SelectItem value="ROLE_BOLD">Poste en gras, le reste normal</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={v.style.summaryItalic} onChange={(e) => setV({ ...v, style: { ...v.style, summaryItalic: e.target.checked } })} /> Profil en italique
            </label>
            <FormField label="Nom du fichier PDF" hint="La date d’export est ajoutée" className="@xl:col-span-2">
              <Input value={v.fileName} onChange={(e) => setV({ ...v, fileName: e.target.value })} placeholder="CV-Prenom-Nom-Cible-FR.pdf" />
            </FormField>
          </div>
        </section>

        {v.sections.map((b, i) => (
          <section key={i} className="surface space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">|</span>
              <Input value={b.title} onChange={(e) => setSection(i, { ...b, title: e.target.value })} className="h-8 max-w-64 font-semibold" aria-label="Titre de section" />
              <Input value={b.aside ?? ""} onChange={(e) => setSection(i, { ...b, aside: e.target.value || null })} placeholder="Texte à droite (facultatif)" className="h-8 max-w-72 text-sm italic" aria-label="Texte à droite" />
              <div className="ml-auto flex gap-1">
                <Button size="icon-xs" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">
                  <ArrowUp />
                </Button>
                <Button size="icon-xs" variant="ghost" disabled={i === v.sections.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">
                  <ArrowDown />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => setV({ ...v, sections: v.sections.filter((_, j) => j !== i) })} aria-label="Retirer la section">
                  <Trash2 />
                </Button>
              </div>
            </div>
            {b.kind === "TEXT" && <Textarea rows={4} value={b.text ?? ""} onChange={(e) => setSection(i, { ...b, text: e.target.value || null })} placeholder="Texte (laisser vide pour une section titre seul, ex. Disponibilité)" />}
            {b.kind === "BULLETS" && <Textarea rows={4} value={b.bullets.join("\n")} onChange={(e) => setSection(i, { ...b, bullets: e.target.value.split("\n").filter((x, k, all) => x.trim() || k < all.length - 1) })} placeholder="Un point par ligne ; **gras** pour mettre en gras" />}
            {b.kind === "SKILLS" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={b.columns === 2} onChange={(e) => setSection(i, { ...b, columns: e.target.checked ? 2 : 1 })} /> Sur deux colonnes (catégorie au-dessus)
                </label>
                {b.lines.map((l, j) => (
                  <div key={j} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-start gap-2">
                    <Input value={l.label} onChange={(e) => setSection(i, { ...b, lines: b.lines.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} className="font-medium" aria-label="Catégorie" />
                    <Textarea rows={1} value={l.text} onChange={(e) => setSection(i, { ...b, lines: b.lines.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} aria-label="Compétences" />
                    <Button size="icon-sm" variant="ghost" onClick={() => setSection(i, { ...b, lines: b.lines.filter((_, k) => k !== j) })} aria-label="Retirer la ligne">
                      <X />
                    </Button>
                  </div>
                ))}
                <Button size="xs" variant="outline" onClick={() => setSection(i, { ...b, lines: [...b.lines, { label: "", text: "" }] })}>
                  <Plus /> Ligne
                </Button>
              </div>
            )}
            {b.kind === "ENTRIES" && (
              <div className="space-y-1.5">
                {b.entries.map((id, j) => {
                  const e = byId.get(id);
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium italic">{e?.title ?? "Entrée supprimée"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e?.dates}
                          {e?.bullets.length ? ` · ${e.bullets.length} point${e.bullets.length > 1 ? "s" : ""}` : ""}
                        </p>
                      </div>
                      <Button size="icon-xs" variant="ghost" disabled={j === 0} onClick={() => setSection(i, { ...b, entries: swap(b.entries, j, j - 1) })} aria-label="Monter">
                        <ArrowUp />
                      </Button>
                      <Button size="icon-xs" variant="ghost" disabled={j === b.entries.length - 1} onClick={() => setSection(i, { ...b, entries: swap(b.entries, j, j + 1) })} aria-label="Descendre">
                        <ArrowDown />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => setSection(i, { ...b, entries: b.entries.filter((x) => x !== id) })} aria-label="Retirer de ce CV">
                        <X />
                      </Button>
                    </div>
                  );
                })}
                <AddEntrySelect entries={entries.filter((e) => e.lang === variant.lang && !b.entries.includes(e.id))} onAdd={(id) => setSection(i, { ...b, entries: [...b.entries, id] })} />
              </div>
            )}
          </section>
        ))}
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted-foreground">Ajouter une section :</span>
          <Button size="xs" variant="outline" onClick={() => setV({ ...v, sections: [...v.sections, { kind: "TEXT", title: "PROFIL", text: "" }] })}>
            <Plus /> Texte
          </Button>
          <Button size="xs" variant="outline" onClick={() => setV({ ...v, sections: [...v.sections, { kind: "ENTRIES", title: variant.lang === "fr" ? "EXPÉRIENCE PROFESSIONNELLE" : "EXPERIENCE", entries: [] }] })}>
            <Plus /> Entrées
          </Button>
          <Button size="xs" variant="outline" onClick={() => setV({ ...v, sections: [...v.sections, { kind: "SKILLS", title: variant.lang === "fr" ? "COMPÉTENCES" : "SKILLS", lines: [], columns: 1 }] })}>
            <Plus /> Compétences
          </Button>
          <Button size="xs" variant="outline" onClick={() => setV({ ...v, sections: [...v.sections, { kind: "BULLETS", title: "FOCUS", bullets: [] }] })}>
            <Plus /> Liste
          </Button>
        </div>
      </div>

      <div className="min-w-0 2xl:sticky 2xl:top-20 2xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label-sm text-foreground">Aperçu</h2>
          {dirty && <span className="text-xs text-muted-foreground">Enregistre pour mettre à jour l’aperçu</span>}
        </div>
        <iframe key={previewKey} src={`/api/cv/variants/${variant.id}/pdf#view=FitH&toolbar=0`} title={`Aperçu de ${variant.name}`} className="aspect-[210/297] w-full rounded-xl border border-border bg-white" />
        <ExportToApplication opportunities={opportunities} disabled={dirty || busy !== null} onExport={exportPdf} />
      </div>

      {adapting && (
        <AdaptDialog
          variantId={variant.id}
          opportunities={opportunities}
          onClose={() => setAdapting(false)}
          onApply={(text) => {
            const i = v.sections.findIndex((s) => s.kind === "TEXT" && !!s.text);
            if (i < 0) return;
            const next = { ...v, sections: v.sections.map((s, j) => (j === i && s.kind === "TEXT" ? { ...s, text } : s)) };
            setV(next);
            setAdapting(false);
          }}
        />
      )}
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number) {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function AddEntrySelect({ entries, onAdd }: { entries: CvEntryView[]; onAdd: (id: string) => void }) {
  if (!entries.length) return null;
  return (
    <Select value="" onValueChange={onAdd}>
      <SelectTrigger size="sm" className="w-full max-w-md text-muted-foreground">
        <SelectValue placeholder="Ajouter une entrée…" />
      </SelectTrigger>
      <SelectContent>
        {CV_SECTIONS.map((section) =>
          entries
            .filter((e) => e.section === section)
            .map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {CV_SECTION_LABEL[section]} · {e.title}
              </SelectItem>
            )),
        )}
      </SelectContent>
    </Select>
  );
}

function ExportToApplication({ opportunities, disabled, onExport }: { opportunities: OppOption[]; disabled: boolean; onExport: (opportunityId: string) => void }) {
  const [opp, setOpp] = useState("");
  if (!opportunities.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select value={opp} onValueChange={setOpp}>
        <SelectTrigger size="sm" className="min-w-0 flex-1">
          <SelectValue placeholder="Exporter et joindre à une candidature…" />
        </SelectTrigger>
        <SelectContent>
          {opportunities.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!opp || disabled} onClick={() => onExport(opp)}>
        <Download /> Exporter et joindre
      </Button>
    </div>
  );
}

function AdaptDialog({ variantId, opportunities, onClose, onApply }: { variantId: string; opportunities: OppOption[]; onClose: () => void; onApply: (text: string) => void }) {
  const { run, pending } = useAction();
  const [opp, setOpp] = useState("");
  const [result, setResult] = useState<{ current: string | null; proposed: string; changes: string } | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adapter l’accroche à une offre</DialogTitle>
          <DialogDescription>Claude réécrit le paragraphe de profil avec les seuls faits déjà dans ton CV. Tu relis avant de remplacer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Select value={opp} onValueChange={setOpp}>
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Choisir la candidature" />
              </SelectTrigger>
              <SelectContent>
                {opportunities.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!opp || pending} onClick={() => run(() => adaptSummaryAction(variantId, opp), { onSuccess: setResult })}>
              {pending ? <Spinner /> : <Sparkles />} Proposer
            </Button>
          </div>
          {result && (
            <>
              <p className="copy-sm text-muted-foreground">{result.changes}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Actuelle</p>
                  <p className="surface px-3 py-2 copy-sm">{result.current}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Proposée</p>
                  <p className="surface px-3 py-2 copy-sm">{result.proposed}</p>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="highlight" disabled={!result} onClick={() => result && onApply(result.proposed)}>
            Remplacer l’accroche
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntriesLibrary({ entries }: { entries: CvEntryView[] }) {
  const { run } = useAction();
  const [lang, setLang] = useState<CvLang>("fr");
  const [adding, setAdding] = useState<CvSection | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Select value={lang} onValueChange={(l) => setLang(l as CvLang)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">Anglais</SelectItem>
          </SelectContent>
        </Select>
        <p className="copy-sm text-muted-foreground">Une entrée modifiée ici change dans toutes les variantes qui l’utilisent.</p>
      </div>
      {CV_SECTIONS.map((section) => {
        const list = entries.filter((e) => e.section === section && e.lang === lang);
        return (
          <section key={section} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="heading-base text-foreground">{CV_SECTION_LABEL[section]}</h2>
              <span className="text-xs text-muted-foreground">{list.length}</span>
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setAdding(section)}>
                <Plus /> Entrée
              </Button>
            </div>
            {adding === section && (
              <EntryForm
                entry={{ id: "", section, lang, group: null, title: "", dates: null, subtitle: null, bullets: [] }}
                onCancel={() => setAdding(null)}
                onSave={(input) => run(() => createEntryAction({ ...input, section, lang }), { success: "Entrée ajoutée", onSuccess: () => setAdding(null) })}
              />
            )}
            {list.map((e) => (
              <EntryRow key={e.id} entry={e} onSave={(input) => run(() => updateEntryAction(e.id, input), { success: "Entrée enregistrée" })} onDelete={() => run(() => deleteEntryAction(e.id), { success: "Entrée supprimée" })} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function EntryRow({ entry, onSave, onDelete }: { entry: CvEntryView; onSave: (input: Partial<CvEntryView>) => void; onDelete: () => void }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  if (open) return <EntryForm entry={entry} onCancel={() => setOpen(false)} onSave={(input) => (onSave(input), setOpen(false))} />;
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(true)}>
        <p className="truncate text-sm font-medium italic">{entry.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[entry.dates, entry.subtitle, entry.bullets.length ? `${entry.bullets.length} point${entry.bullets.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
        </p>
      </button>
      <Button
        size="icon-xs"
        variant="ghost"
        className="opacity-0 group-hover:opacity-100"
        onClick={async () => {
          if (await confirm({ title: "Supprimer cette entrée ?", description: "Elle disparaît des variantes qui l’utilisent (les PDF exportés ne changent pas).", confirmLabel: "Supprimer", destructive: true })) onDelete();
        }}
        aria-label={`Supprimer ${entry.title}`}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function EntryForm({ entry, onCancel, onSave }: { entry: CvEntryView; onCancel: () => void; onSave: (input: { title: string; dates: string | null; subtitle: string | null; bullets: string[] }) => void }) {
  const [title, setTitle] = useState(entry.title);
  const [dates, setDates] = useState(entry.dates ?? "");
  const [subtitle, setSubtitle] = useState(entry.subtitle ?? "");
  const [bullets, setBullets] = useState(entry.bullets.join("\n"));
  return (
    <div className="surface space-y-3 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
        <FormField label="Titre (gras italique)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Poste, Entreprise, Ville" />
        </FormField>
        <FormField label="Dates">
          <Input value={dates} onChange={(e) => setDates(e.target.value)} placeholder="mai 2026 - août 2026" />
        </FormField>
      </div>
      <FormField label="Sous-titre (facultatif)">
        <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      </FormField>
      <FormField label="Points" hint="Un par ligne">
        <Textarea rows={5} value={bullets} onChange={(e) => setBullets(e.target.value)} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              title: title.trim(),
              dates: dates.trim() || null,
              subtitle: subtitle.trim() || null,
              bullets: bullets
                .split("\n")
                .map((b) => b.replace(/^[\s\-•–]+/, "").trim())
                .filter(Boolean),
            })
          }
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
