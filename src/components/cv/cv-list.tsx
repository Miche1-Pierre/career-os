"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, FileText, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { createBlankVariantAction, deleteVariantAction, duplicateVariantAction, exportVariantAction, renameVariantAction, saveDesignAction } from "@/app/actions/cv";
import { layoutToFit, type CvDesign } from "@/lib/cv-design";
import type { CvBlock, CvEntryView, CvHeader, CvLang, CvStyle } from "@/lib/cv";
import { formatInstant } from "@/lib/dates";
import { createDomMeasure, loadCvFonts, PageThumb } from "./design-view";

export interface CvCard {
  id: string;
  name: string;
  lang: CvLang;
  design: CvDesign | null;
  header: CvHeader;
  sections: CvBlock[];
  style: CvStyle;
  documentId: string | null;
  updatedAt: string;
  versions: { id: string; version: number; fileName: string | null; createdAt: string }[];
}

/** The CV page: every CV with its exported versions; a click opens the editor. */
export function CvList({ cards, entries }: { cards: CvCard[]; entries: CvEntryView[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [designs, setDesigns] = useState<Record<string, CvDesign>>(() => Object.fromEntries(cards.filter((c) => c.design).map((c) => [c.id, c.design!])));
  const missing = cards.filter((c) => !designs[c.id]);

  // CVs never opened in the editor: laid out once like their PDF (measured with the real fonts), then saved.
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    void loadCvFonts().then(async () => {
      if (!alive) return;
      const { measure, dispose } = createDomMeasure();
      const map = new Map(entries.map((e) => [e.id, e]));
      const made: Record<string, CvDesign> = {};
      try {
        for (const c of missing) made[c.id] = layoutToFit({ header: c.header, sections: c.sections, entries: map, style: c.style }, measure);
      } finally {
        dispose();
      }
      if (!alive) return;
      setDesigns((d) => ({ ...d, ...made }));
      for (const [id, design] of Object.entries(made)) await saveDesignAction(id, design);
    });
    return () => {
      alive = false;
    };
    // Runs once per set of CVs to convert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.map((c) => c.id).join()]);

  const createBlank = () => run(() => createBlankVariantAction("CV", "fr"), { onSuccess: (d) => router.push(`/cv/${d.id}`) });

  return (
    <PageContainer>
      <PageHeader
        title="CV"
        description="Tes CV, mis en page comme sur Canva. Le nom est celui du fichier PDF ; chaque export garde une version dans Documents."
        actions={
          <Button variant="highlight" onClick={createBlank} disabled={pending}>
            <Plus /> Nouveau CV
          </Button>
        }
      />
      {cards.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun CV" description="Crée un CV vierge, ou demande à Claude d’importer ton CV actuel depuis le chat.">
          <Button variant="outline" onClick={createBlank}>
            <Plus /> Nouveau CV
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {cards.map((c) => (
            <CvCardView key={c.id} card={c} design={designs[c.id] ?? null} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function CvCardView({ card, design }: { card: CvCard; design: CvDesign | null }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const { dateLocale, timezone } = useAppData();
  const [name, setName] = useState(card.name);
  const [exporting, setExporting] = useState(false);

  const rename = () => {
    const n = name.trim();
    if (!n || n === card.name) return setName(card.name);
    run(() => renameVariantAction(card.id, n), { onError: () => setName(card.name) });
  };

  const exportPdf = () => {
    setExporting(true);
    run(() => exportVariantAction(card.id), {
      success: (d) => `Version enregistrée : ${d.fileName}`,
      onSuccess: (d) => {
        setExporting(false);
        window.open(`/api/files/versions/${d.versionId}?download=1`, "_blank");
      },
      onError: () => setExporting(false),
    });
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background">
      <Link href={`/cv/${card.id}`} className="relative block bg-muted-background p-3" aria-label={`Ouvrir ${card.name}`}>
        <div className="mx-auto w-fit shadow-md ring-1 ring-black/5 transition-transform group-hover:-translate-y-0.5">
          {design ? (
            <PageThumb page={design.pages[0]} width={196} />
          ) : (
            <div className="flex h-[277px] w-[196px] items-center justify-center bg-white text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Mise en page…
            </div>
          )}
        </div>
        {design && design.pages.length > 1 && <Badge className="absolute top-2 right-2">{design.pages.length} pages</Badge>}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-hover focus:bg-hover"
            aria-label="Nom du CV (nom du fichier PDF)"
            title="Nom du fichier PDF : clique pour renommer"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Plus d'actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/cv/${card.id}`}>
                  <FileText /> Ouvrir l’éditeur
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf} disabled={exporting}>
                <Download /> Exporter en PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(() => duplicateVariantAction(card.id), { success: "CV dupliqué" })} disabled={pending}>
                <Copy /> Dupliquer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: `Supprimer « ${card.name} » ?`, description: "Le CV va à la corbeille. Les PDF déjà exportés restent dans Documents.", confirmLabel: "Supprimer", destructive: true }))
                    run(() => deleteVariantAction(card.id), { success: "CV supprimé" });
                }}
              >
                <Trash2 /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          {card.lang.toUpperCase()} · modifié le {formatInstant(card.updatedAt, { timeZone: timezone, locale: dateLocale, withTime: false })}
        </p>
        <div className="mt-auto space-y-0.5 border-t border-separator px-1 pt-2">
          {card.versions.length ? (
            <>
              {card.versions.slice(0, 3).map((v) => (
                <a key={v.id} href={`/api/files/versions/${v.id}?download=1`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" title={v.fileName ?? undefined}>
                  <Download className="size-3 shrink-0" />
                  <span>v{v.version}</span>
                  <span className="truncate">· {formatInstant(v.createdAt, { timeZone: timezone, locale: dateLocale, withTime: false })}</span>
                </a>
              ))}
              {card.versions.length > 3 && card.documentId && (
                <Link href={`/documents/${card.documentId}`} className="text-xs text-muted-foreground hover:text-foreground">
                  {card.versions.length - 3} autre{card.versions.length - 3 > 1 ? "s" : ""} version{card.versions.length - 3 > 1 ? "s" : ""}
                </Link>
              )}
            </>
          ) : (
            <p className="text-xs text-faint">Pas encore exporté</p>
          )}
        </div>
      </div>
    </div>
  );
}
