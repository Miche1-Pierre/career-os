"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagBadge, tagColorClass, TAG_COLOR_NAMES } from "@/components/app/badges";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import {
  createStageAction,
  deleteStageAction,
  deleteTagAction,
  deleteViewAction,
  renameTagAction,
  reorderStagesAction,
  setTagColorAction,
  updateStageAction,
  updateViewAction,
} from "@/app/actions/settings";
import { STAGE_CATEGORIES, STAGE_CATEGORY_META, type PipelineKey, type StageCategory } from "@/lib/constants";
import type { PipelineStage, SavedView } from "@/server/db/schema";
import type { TagWithUsage } from "@/server/services/tags";
import { SettingsCard } from "./settings-shell";
import { cn } from "@/lib/utils";

function StageRow({ stage, index, count, onMove }: { stage: PipelineStage; index: number; count: number; onMove: (dir: -1 | 1) => void }) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [label, setLabel] = useState(stage.label);
  return (
    <li className={cn("flex flex-wrap items-center gap-2 px-3 py-2", stage.isArchived && "opacity-50")}>
      <span className="flex flex-col">
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="text-muted-foreground disabled:opacity-20" aria-label="Move up">
          <ArrowUp className="size-3.5" />
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="text-muted-foreground disabled:opacity-20" aria-label="Move down">
          <ArrowDown className="size-3.5" />
        </button>
      </span>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label.trim() && label !== stage.label && run(() => updateStageAction(stage.id, { label: label.trim() }), { success: "Renamed" })} className="h-7 w-48" />
      <code className="text-xs text-muted-foreground">{stage.key}</code>
      <Select value={stage.category} onValueChange={(c) => run(() => updateStageAction(stage.id, { category: c as StageCategory }), { success: "Category updated" })}>
        <SelectTrigger size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[c].dot)} /> {STAGE_CATEGORY_META[c].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-xs" variant={stage.isDefault ? "secondary" : "ghost"} onClick={() => !stage.isDefault && run(() => updateStageAction(stage.id, { isDefault: true }), { success: "Default status for new items" })} aria-label="Default">
              <Star className={cn(stage.isDefault && "fill-current text-amber-500")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Default status for new opportunities</TooltipContent>
        </Tooltip>
        <Button size="icon-xs" variant="ghost" onClick={() => run(() => updateStageAction(stage.id, { isArchived: !stage.isArchived }), { success: stage.isArchived ? "Restored" : "Hidden" })} aria-label={stage.isArchived ? "Restore" : "Hide"}>
          {stage.isArchived ? <ArchiveRestore /> : <Archive />}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Delete"
          onClick={async () => {
            if (await confirm({ title: `Delete “${stage.label}”?`, description: "Only possible when no opportunity uses it (archive it otherwise).", destructive: true, confirmLabel: "Delete" })) run(() => deleteStageAction(stage.id), { success: "Deleted" });
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function PipelineSettings({ stages }: { stages: PipelineStage[] }) {
  const { run } = useAction();
  const [newStage, setNewStage] = useState<{ pipeline: PipelineKey; label: string; category: StageCategory }>({ pipeline: "JOB", label: "", category: "INTERVIEW" });
  const pipelines: { key: PipelineKey; label: string; short: string }[] = [
    { key: "JOB", label: "Jobs, internships, VIE", short: "Jobs" },
    { key: "EDUCATION", label: "Formations, PhD, programs", short: "Education" },
  ];
  return (
    <SettingsCard title="Statuses & pipelines" description="Rename, add, reorder or hide statuses. Each status belongs to a category that drives the board and the automations.">
      <Tabs defaultValue="JOB">
        <TabsList>
          {pipelines.map((p) => (
            <TabsTrigger key={p.key} value={p.key}>
              <span className="sm:hidden">{p.short}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {pipelines.map((p) => {
          const list = stages.filter((s) => s.pipeline === p.key).sort((a, b) => a.position - b.position);
          const move = (index: number, dir: -1 | 1) => {
            const ids = list.map((s) => s.id);
            const [item] = ids.splice(index, 1);
            ids.splice(index + dir, 0, item);
            run(() => reorderStagesAction(p.key, ids));
          };
          return (
            <TabsContent key={p.key} value={p.key} className="space-y-3 pt-3">
              <ul className="surface-list rounded-xl">
                {list.map((s, i) => (
                  <StageRow key={s.id} stage={s} index={i} count={list.length} onMove={(d) => move(i, d)} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={newStage.pipeline === p.key ? newStage.label : ""} onChange={(e) => setNewStage({ ...newStage, pipeline: p.key, label: e.target.value })} placeholder="New status (e.g. Case study)" className="h-8 w-56" />
                <Select value={newStage.category} onValueChange={(c) => setNewStage({ ...newStage, pipeline: p.key, category: c as StageCategory })}>
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {STAGE_CATEGORY_META[c].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={newStage.pipeline !== p.key || !newStage.label.trim()}
                  onClick={() => run(() => createStageAction({ pipeline: p.key, key: newStage.label, label: newStage.label.trim(), category: newStage.category }), { success: "Status added", onSuccess: () => setNewStage({ ...newStage, label: "" }) })}
                >
                  <Plus /> Add
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </SettingsCard>
  );
}

export function TagSettings({ tags }: { tags: TagWithUsage[] }) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  return (
    <SettingsCard title="Tags" description="Rename (merges into an existing tag of the same name), recolor or delete. Changes apply everywhere.">
      {tags.length === 0 && <p className="text-sm text-muted-foreground">No tag yet.</p>}
      <ul className="surface-list rounded-xl">
        {tags.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <TagBadge name={t.name} />
            <span className="text-xs text-muted-foreground tabular-nums">{t.usage} use{t.usage === 1 ? "" : "s"}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {TAG_COLOR_NAMES.map((c) => (
                <button key={c} type="button" onClick={() => run(() => setTagColorAction(t.name, c))} className={cn("size-4 rounded-full ring-offset-1", tagColorClass(c), t.color === c && "ring-2 ring-foreground/40")} aria-label={c} />
              ))}
              <Input
                value={renaming[t.id] ?? t.name}
                onChange={(e) => setRenaming({ ...renaming, [t.id]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && (renaming[t.id] ?? t.name) !== t.name && run(() => renameTagAction(t.name, renaming[t.id]), { success: "Renamed" })}
                className="ml-2 h-7 w-36"
              />
              <Button size="xs" variant="ghost" disabled={(renaming[t.id] ?? t.name) === t.name} onClick={() => run(() => renameTagAction(t.name, renaming[t.id]), { success: "Renamed" })}>
                Rename
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Delete"
                onClick={async () => {
                  if (await confirm({ title: `Delete the tag “${t.name}”?`, description: `It is removed from ${t.usage} item(s).`, destructive: true, confirmLabel: "Delete" })) run(() => deleteTagAction(t.name), { success: "Deleted" });
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

export function ViewSettings({ views }: { views: SavedView[] }) {
  const { run } = useAction();
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <SettingsCard title="Saved views" description="Create views from the Applications list (View → Save as new view). They appear in the sidebar.">
      {views.length === 0 && <p className="text-sm text-muted-foreground">No saved view.</p>}
      <ul className="surface-list rounded-xl">
        {views.map((v) => (
          <li key={v.id} className="flex items-center gap-2 px-3 py-2">
            <Input value={names[v.id] ?? v.name} onChange={(e) => setNames({ ...names, [v.id]: e.target.value })} className="h-7 w-56" />
            <code className="truncate text-xs text-muted-foreground">{JSON.stringify(v.filters)}</code>
            <div className="ml-auto flex gap-1">
              <Button size="xs" variant="ghost" disabled={(names[v.id] ?? v.name) === v.name} onClick={() => run(() => updateViewAction(v.id, { name: names[v.id] }), { success: "Renamed" })}>
                Rename
              </Button>
              <Button size="icon-xs" variant="ghost" onClick={() => run(() => deleteViewAction(v.id), { success: "Deleted" })} aria-label="Delete">
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
