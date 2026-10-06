"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { List, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { MultiSelect } from "@/components/app/multi-select";
import { PriorityDot, StageBadge, TagList } from "@/components/app/badges";
import { Counter } from "@/components/app/sparkle";
import { OrgAvatar } from "@/components/app/org-avatar";
import { useAppData, type StageOption } from "@/components/app/app-data";
import { BOARD_COLUMNS, STAGE_CATEGORY_META, familyOf, type StageCategory } from "@/lib/constants";
import { filtersToSearch, type ListFilters } from "@/lib/filters";
import { changeStatusAction } from "@/app/actions/opportunities";
import type { OpportunityListItem } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";
import { NextActionCell } from "./applications-list";

const PICK_COLUMNS = new Set(["INTERVIEW", "CLOSED"]);

export function KanbanBoard({ rows: initialRows, filters }: { rows: OpportunityListItem[]; filters: ListFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const { stages, tags } = useAppData();
  const [rows, setRows] = useState(initialRows);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ row: OpportunityListItem; options: StageOption[] } | null>(null);
  const [q, setQ] = useState(filters.q ?? "");
  const [isNavigating, startNavigation] = useTransition();
  const [showClosed, setShowClosed] = useState(false);

  // New server data (after a refresh) replaces the optimistic rows.
  const [syncedRows, setSyncedRows] = useState(initialRows);
  if (syncedRows !== initialRows) {
    setSyncedRows(initialRows);
    setRows(initialRows);
  }
  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const t = setTimeout(() => startNavigation(() => router.replace(`${pathname}${filtersToSearch({ ...filters, q: q || undefined })}`)), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
    toast.success(`${row.organization?.name ?? row.title}: ${result.data.from} → ${result.data.to}`);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const row = rows.find((r) => r.id === event.active.id);
    const column = BOARD_COLUMNS.find((c) => c.key === event.over?.id);
    if (!row || !column || column.categories.includes(row.stage.category)) return;
    const pipeline = familyOf(row.type);
    const options = stages.filter((s) => s.pipeline === pipeline && column.categories.includes(s.category)).sort((a, b) => a.position - b.position);
    if (!options.length) return void toast.error("No stage of this pipeline matches this column");
    if (options.length === 1 || !PICK_COLUMNS.has(column.key)) void move(row, options[0]);
    else setPicker({ row, options });
  }

  const activeRow = rows.find((r) => r.id === activeId) ?? null;

  return (
    <PageContainer wide className="flex h-[calc(100svh-3.5rem)] flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Board {isNavigating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </span>
        }
        description="Drag a card to change its status — every move is recorded in the timeline."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/applications${filtersToSearch({ family: filters.family, tags: filters.tags })}`}>
                <List /> List
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/applications/new">
                <Plus /> New
              </Link>
            </Button>
          </>
        }
        className="pb-3"
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={filters.family ?? "ALL"} onValueChange={(v) => startNavigation(() => router.replace(`${pathname}${filtersToSearch({ ...filters, family: v === "ALL" ? undefined : (v as "JOB" | "EDUCATION") })}`))}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="JOB">Jobs</TabsTrigger>
            <TabsTrigger value="EDUCATION">Education</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="pl-9" />
        </div>
        <MultiSelect label="Tags" value={filters.tags ?? []} onChange={(v) => startNavigation(() => router.replace(`${pathname}${filtersToSearch({ ...filters, tags: v.length ? v : undefined })}`))} options={tags.map((t) => ({ value: t.name, label: t.name }))} />
      </div>
      <DndContext id="career-os-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {columns.map((col) => (
            <Column key={col.key} id={col.key} label={col.label} category={col.categories[0]} count={col.items.length} collapsed={col.key === "CLOSED" && !showClosed} onToggle={() => setShowClosed((v) => !v)}>
              {(col.key !== "CLOSED" || showClosed) && col.items.slice(0, col.key === "CLOSED" ? 40 : 500).map((row) => <DraggableCard key={row.id} row={row} showStage={col.categories.length > 1 || stages.filter((s) => s.category === col.categories[0] && s.pipeline === familyOf(row.type)).length > 1} />)}
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{activeRow && <CardView row={activeRow} dragging showStage />}</DragOverlay>
      </DndContext>
      <Dialog open={!!picker} onOpenChange={(open) => !open && setPicker(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Which status?</DialogTitle>
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
                {s.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
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
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[category].dot)} />
        <span className="heading-sm text-foreground">{label}</span>
        <Counter value={count} />
        {id === "CLOSED" && (
          <Button type="button" variant="ghost-secondary" size="xs" onClick={onToggle} className="ml-auto">
            {collapsed ? "Show" : "Hide"}
          </Button>
        )}
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {collapsed ? <p className="px-1 py-6 text-center text-xs text-muted-foreground">Drop here to close an application</p> : children}
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
        <OrgAvatar name={row.organization?.name ?? row.title} size="sm" className="mt-0.5" />
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
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {showStage && <StageBadge label={row.stage.label} category={row.stage.category} />}
          <NextActionCell row={row} hideEmpty />
        </div>
      )}
      {row.tags.length > 0 && <TagList tags={row.tags} max={2} className="mt-2" />}
    </div>
  );
}
