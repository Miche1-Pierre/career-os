"use client";

import { useState } from "react";
import { Bot, FileText, Plus, Trash2, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DueBadge } from "@/components/app/badges";
import { DateInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions/opportunities";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { cn } from "@/lib/utils";

const AUTO_LABEL: Record<string, string> = {
  "status:APPLIED": "Cochée automatiquement à l’envoi de la candidature",
  followup: "Cochée automatiquement à la première relance",
  interview: "Cochée automatiquement quand un entretien est marqué comme passé",
};

export function DetailChecklist({ opp }: { opp: OpportunityDetail }) {
  const { run } = useAction();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const tasks = opp.tasks;
  const done = tasks.filter((t) => t.done).length;
  const add = () => {
    if (!title.trim()) return;
    run(() => createTaskAction({ opportunityId: opp.id, title: title.trim(), dueDate: due, kind: "CHECKLIST" }), {
      onSuccess: () => {
        setTitle("");
        setDue(null);
      },
    });
  };
  return (
    <div className="space-y-4">
      {tasks.length > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={(done / tasks.length) * 100} className="h-1.5" />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {done}/{tasks.length}
          </span>
        </div>
      )}
      <ul className="surface-list">
        {tasks.map((task) => {
          const auto = task.autoRule ? (task.autoRule.startsWith("doc:") ? "Cochée automatiquement quand un document correspondant est joint" : AUTO_LABEL[task.autoRule]) : null;
          return (
            <li key={task.id} className="group flex items-center gap-3 px-3 py-2">
              <Checkbox checked={task.done} onCheckedChange={(v) => run(() => updateTaskAction(task.id, { done: !!v }))} aria-label={task.title} />
              <span className={cn("flex-1 text-sm", task.done && "text-muted-foreground line-through")}>{task.title}</span>
              {task.kind === "DOCUMENT" && <FileText className="size-3.5 text-muted-foreground" />}
              {auto && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Zap className="size-3.5 text-highlight-500" />
                  </TooltipTrigger>
                  <TooltipContent>{auto}</TooltipContent>
                </Tooltip>
              )}
              {task.origin === "RULE" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Bot className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>Créée par une règle d’automatisation</TooltipContent>
                </Tooltip>
              )}
              {task.dueDate && !task.done && <DueBadge date={task.dueDate} />}
              <button type="button" className="opacity-0 group-hover:opacity-100" onClick={() => run(() => deleteTaskAction(task.id))} aria-label="Supprimer la tâche">
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          );
        })}
        <li className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Plus className="size-4 text-muted-foreground" />
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Ajouter une étape…" className="h-7 min-w-40 flex-1 border-0 px-1 shadow-none focus-visible:ring-0" />
          <DateInput value={due} onChange={setDue} className="h-7 w-36" />
          <Button size="xs" onClick={add} disabled={!title.trim()}>
            Ajouter
          </Button>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">Les étapes viennent du modèle de ce type (Paramètres → Modèles) et des documents demandés par l’offre.</p>
    </div>
  );
}
