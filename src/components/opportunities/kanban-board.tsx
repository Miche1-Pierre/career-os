"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PriorityDot } from "@/components/app/badges";
import { Counter } from "@/components/app/sparkle";
import { OrgAvatar } from "@/components/app/org-avatar";
import { useAppData, type StageOption } from "@/components/app/app-data";
import { BOARD_COLUMNS, STAGE_CATEGORY_META, familyOf, type StageCategory } from "@/lib/constants";
import { changeStatusAction } from "@/app/actions/opportunities";
import type { OpportunityListItem } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";
import { NextActionChip, StageChip, TagChips } from "./chips";

const PICK_COLUMNS = new Set(["INTERVIEW", "CLOSED"]);

/** Board layout of the Candidatures page: drag a card to another column to change its status. */
export function KanbanBoard({ rows: initialRows }: { rows: OpportunityListItem[] }) {
  const { stages } = useAppData();
  const [rows, setRows] = useState(initialRows);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ row: OpportunityListItem; options: StageOption[] } | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  // New server data (after a refresh or a filter change) replaces the optimistic rows.
  const [syncedRows, setSyncedRows] = useState(initialRows);
  if (syncedRows !== initialRows) {
    setSyncedRows(initialRows);
    setRows(initialRows);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((col) => ({
        ...col,
        items: rows.filter((r) => col.categories.includes(r.stage.category)),
      })),
    [rows],
  );

  async function move(row: OpportunityListItem, stage: StageOption) {
    const previous = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, stage: { ...r.stage, id: stage.id, key: stage.key, label: stage.label, category: stage.category } } : r)));
    const result = await changeStatusAction(row.id, stage.key);
    if (!result.ok) {
      setRows(previous);
      toast.error(result.error);
      return;
    }
    toast.success(`${row.organization?.name ?? row.title} : ${result.data.from} → ${result.data.to}`);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const row = rows.find((r) => r.id === event.active.id);
    const column = BOARD_COLUMNS.find((c) => c.key === event.over?.id);
    if (!row || !column || column.categories.includes(row.stage.category)) return;
    const pipeline = familyOf(row.type);
    const options = stages.filter((s) => s.pipeline === pipeline && column.categories.includes(s.category)).sort((a, b) => a.position - b.position);
    if (!options.length) return void toast.error("Aucun statut de ce pipeline ne correspond à cette colonne");
    if (options.length === 1 || !PICK_COLUMNS.has(column.key)) void move(row, options[0]);
    else setPicker({ row, options });
  }

  const activeRow = rows.find((r) => r.id === activeId) ?? null;

  return (
    <>
      <DndContext id="career-os-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex h-[75svh] gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 md:h-auto md:min-h-0 md:flex-1">
          {columns.map((col) => (
            <Column key={col.key} id={col.key} label={col.label} category={col.categories[0]} count={col.items.length} collapsed={col.key === "CLOSED" && !showClosed} onToggle={() => setShowClosed((v) => !v)}>
              {(col.key !== "CLOSED" || showClosed) &&
                col.items
                  .slice(0, col.key === "CLOSED" ? 40 : 500)
                  .map((row) => <DraggableCard key={row.id} row={row} showStage={col.categories.length > 1 || stages.filter((s) => s.category === col.categories[0] && s.pipeline === familyOf(row.type)).length > 1} />)}
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{activeRow && <CardView row={activeRow} dragging showStage />}</DragOverlay>
      </DndContext>
      <Dialog open={!!picker} onOpenChange={(open) => !open && setPicker(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Quel statut ?</DialogTitle>
            <DialogDescription>{picker?.row.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            {picker?.options.map((s) => (
              <Button
                key={s.id}
                variant="outline"
                className="justify-start"
                onClick={() => {
                  const p = picker;
                  setPicker(null);
                  void move(p.row, s);
                }}
              >
                <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[s.category].dot)} />
                <span className="min-w-0 truncate">{s.label}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({ id, label, category, count, children, collapsed, onToggle }: { id: string; label: string; category: StageCategory; count: number; children: React.ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-2xl border border-separator bg-muted-background transition-colors duration-150 dark:border-border",
        isOver && "border-highlight-200 bg-highlight-50 ring-2 ring-highlight-100",
        collapsed && "w-56",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("size-2 shrink-0 rounded-full", STAGE_CATEGORY_META[category].dot)} />
        <span className="min-w-0 truncate heading-sm text-foreground">{label}</span>
        <Counter value={count} />
        {id === "CLOSED" && (
          <Button type="button" variant="ghost-secondary" size="xs" onClick={onToggle} className="ml-auto">
            {collapsed ? "Afficher" : "Masquer"}
          </Button>
        )}
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {collapsed ? <p className="px-1 py-6 text-center text-xs text-muted-foreground">Déposez une carte ici pour clôturer la candidature</p> : children}
      </div>
    </div>
  );
}

function DraggableCard({ row, showStage }: { row: OpportunityListItem; showStage: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-30")}>
      <CardView row={row} showStage={showStage} />
    </div>
  );
}

function CardView({ row, dragging, showStage }: { row: OpportunityListItem; dragging?: boolean; showStage?: boolean }) {
  return (
    <div
      className={cn(
        "group cursor-grab rounded-xl border border-separator bg-background p-3 shadow-card transition-colors duration-100 hover:bg-stone-25 active:cursor-grabbing dark:border-border dark:bg-stone-850 dark:hover:bg-stone-800",
        dragging && "rotate-1 shadow-lg ring-2 ring-highlight-300",
      )}
    >
      <div className="flex items-start gap-2.5">
        <OrgAvatar name={row.organization?.name ?? row.title} orgId={row.organization?.id} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <Link href={`/applications/${row.id}`} className="line-clamp-2 text-sm leading-snug font-medium text-foreground hover:underline" onClick={(e) => dragging && e.preventDefault()} draggable={false}>
              {row.title}
            </Link>
            <PriorityDot priority={row.priority} className="mt-1.5" />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.organization?.name ?? "—"}
            {row.locationCity ? ` · ${row.locationCity}` : ""}
          </p>
        </div>
      </div>
      {(showStage || row.deadline || row.nextFollowUpAt || row.expectedResponseAt) && (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5">
          {showStage && <StageChip label={row.stage.label} category={row.stage.category} />}
          <NextActionChip row={row} hideEmpty />
        </div>
      )}
      {row.tags.length > 0 && <TagChips tags={row.tags} max={2} className="mt-2" />}
    </div>
  );
}
