"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DueBadge } from "@/components/app/badges";
import { SectionHeader } from "@/components/app/sparkle";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { createTaskAction, updateTaskAction } from "@/app/actions/opportunities";
import { addDays } from "@/lib/dates";
import type { TaskListItem } from "@/server/services/tasks";
import { cn } from "@/lib/utils";

/** Right-hand task list of the Today page: quick add, tick, link to the application. */
export function TasksPanel({ tasks }: { tasks: TaskListItem[] }) {
  const { today } = useAppData();
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(today);
  const visible = tasks.filter((t) => !t.opportunityClosed && (t.dueDate || !t.opportunityId)).slice(0, 40);

  const add = () => {
    if (!title.trim()) return;
    run(() => createTaskAction({ title: title.trim(), dueDate: due, opportunityId: null, kind: "TODO" }), { success: "Tâche ajoutée", onSuccess: () => setTitle("") });
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Tâches"
        icon={ListChecks}
        count={visible.length}
        action={
          <Button variant="link" size="sm" asChild>
            <Link href="/tasks">Toutes</Link>
          </Button>
        }
      />
      <div className="space-y-2 rounded-2xl border border-border bg-background p-2">
        <div className="flex gap-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nouvelle tâche…" className="h-8" aria-label="Nouvelle tâche" />
          <Button size="icon-sm" variant="outline" onClick={add} disabled={!title.trim() || pending} aria-label="Ajouter la tâche">
            <Plus />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["Aujourd'hui", today],
              ["Demain", addDays(today, 1)],
              ["Semaine pro.", addDays(today, 7)],
              ["Sans date", null],
            ] as const
          ).map(([label, value]) => (
            <Button key={label} size="xs" variant={due === value ? "secondary" : "ghost"} onClick={() => setDue(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="copy-sm text-muted-foreground">Aucune tâche ouverte.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-background">
          {visible.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 border-b border-separator px-3 py-2 last:border-0">
              <Checkbox className="mt-0.5" checked={t.done} onCheckedChange={(v) => run(() => updateTaskAction(t.id, { done: !!v }), { success: v ? "Tâche terminée" : undefined })} aria-label={t.title} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm leading-snug", t.done && "text-muted-foreground line-through")}>{t.title}</p>
                {t.opportunityId && (
                  <Link href={`/applications/${t.opportunityId}?tab=checklist`} className="block truncate text-xs text-muted-foreground hover:underline">
                    {t.organizationName ?? t.opportunityTitle}
                  </Link>
                )}
              </div>
              {t.dueDate && !t.done && <DueBadge date={t.dueDate} className="shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
