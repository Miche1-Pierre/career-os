"use client";

import { useState } from "react";
import { Bookmark, BookmarkPlus, ChevronDown, Download, Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { createViewAction, deleteViewAction, updateViewAction } from "@/app/actions/settings";
import type { ListFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { applicationsHref, isViewDirty, type ApplicationsLayout, type SavedViewRef } from "./applications-params";

const ALL = "__all__";
const EXPORT_HREF = "/api/v1/export?format=csv&table=opportunities";

/** "Mettre à jour « name »" on one line: only the name is cut, the quotes stay visible. */
function UpdateLabel({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-baseline">
      <span className="shrink-0">Mettre à jour «&nbsp;</span>
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0">&nbsp;»</span>
    </span>
  );
}

/**
 * Saved views of the Candidatures page: pick one, save the current filters as a new view, update, rename or
 * delete the active one. Also shows a one-line "Mettre à jour « … »" button when the active view's filters changed.
 */
export function ViewsMenu({
  views,
  view,
  filters,
  layout,
  onNavigate,
}: {
  views: SavedViewRef[];
  view: SavedViewRef | null;
  filters: ListFilters;
  layout: ApplicationsLayout;
  onNavigate: (href: string, mode?: "push" | "replace") => void;
}) {
  const confirm = useConfirm();
  const { run, pending } = useAction();
  const [dialog, setDialog] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const dirty = isViewDirty(filters, view);

  const openDialog = (kind: "create" | "rename") => {
    setName(kind === "rename" ? (view?.name ?? "") : "");
    setDialog(kind);
  };

  const updateFilters = () => {
    if (!view) return;
    void run(() => updateViewAction(view.id, { filters: filters as never }), {
      success: `Vue « ${view.name} » mise à jour`,
      onSuccess: () => onNavigate(applicationsHref({ layout, view: { ...view, filters } }), "replace"),
    });
  };

  const remove = async () => {
    if (!view) return;
    const ok = await confirm({
      title: `Supprimer la vue « ${view.name} » ?`,
      description: "Seuls les filtres enregistrés sont supprimés, pas les candidatures.",
      destructive: true,
      confirmLabel: "Supprimer la vue",
    });
    if (ok) void run(() => deleteViewAction(view.id), { success: "Vue supprimée", onSuccess: () => onNavigate(applicationsHref({ filters, layout }), "push") });
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (dialog === "rename" && view) {
      void run(() => updateViewAction(view.id, { name: trimmed }), { success: "Vue renommée", onSuccess: () => setDialog(null) });
      return;
    }
    void run(() => createViewAction(trimmed, filters as never), {
      success: "Vue enregistrée",
      onSuccess: (d) => {
        setDialog(null);
        onNavigate(applicationsHref({ layout, view: { id: d.id, name: trimmed, filters } }), "push");
      },
    });
  };

  return (
    <>
      {view && dirty && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-72 min-w-0" onClick={updateFilters} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              <UpdateLabel name={view.name} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enregistrer les filtres actuels dans la vue « {view.name} »</TooltipContent>
        </Tooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn(view && "text-foreground")}>
            <Bookmark className={cn(view && "text-highlight-500")} /> Vues <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel>Vues enregistrées</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={view?.id ?? ALL}
            onValueChange={(id) => {
              if (id === (view?.id ?? ALL)) return;
              const next = views.find((v) => v.id === id) ?? null;
              onNavigate(applicationsHref({ layout, view: next, filters: next ? (next.filters as ListFilters) : {} }), "push");
            }}
          >
            <DropdownMenuRadioItem value={ALL}>Toutes les candidatures</DropdownMenuRadioItem>
            {views.map((v) => (
              <DropdownMenuRadioItem key={v.id} value={v.id} className="min-w-0">
                <Bookmark className="text-faint" />
                <span className="min-w-0 truncate">{v.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {views.length === 0 && <p className="px-2 pb-2 text-xs text-muted-foreground">Aucune vue pour l’instant : enregistrez vos filtres pour les retrouver en un clic.</p>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openDialog("create")}>
            <BookmarkPlus /> Enregistrer comme nouvelle vue…
          </DropdownMenuItem>
          {view && (
            <>
              <DropdownMenuItem onSelect={updateFilters} disabled={!dirty} className="min-w-0">
                <Save />
                <UpdateLabel name={view.name} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDialog("rename")}>
                <Pencil /> Renommer…
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Supprimer la vue
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={EXPORT_HREF}>
              <Download /> Exporter en CSV
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{dialog === "rename" ? "Renommer la vue" : "Enregistrer la vue"}</DialogTitle>
              <DialogDescription>{dialog === "rename" ? "Le nouveau nom apparaît dans le menu Vues." : "Les filtres et le tri actuels sont enregistrés sous ce nom."}</DialogDescription>
            </DialogHeader>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. HealthTech en Suisse" maxLength={80} autoFocus aria-label="Nom de la vue" />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!name.trim() || pending}>
                {pending && <Loader2 className="animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
