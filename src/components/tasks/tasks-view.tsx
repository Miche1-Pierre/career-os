"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { DueBadge } from "@/components/app/badges";
import { DateInput } from "@/components/app/fields";
import { EntityCombobox, type ComboOption } from "@/components/app/entity-combobox";
import { EmptyState } from "@/components/app/empty-state";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions/opportunities";
import { addDays } from "@/lib/dates";
import type { TaskListItem } from "@/server/services/tasks";
import { cn } from "@/lib/utils";

export function TasksView({ tasks, showDone, opportunities, autoFocus }: { tasks: TaskListItem[]; showDone: boolean; opportunities: ComboOption[]; autoFocus?: boolean }) {
  const router = useRouter();
  const { today } = useAppData();
  const { run } = useAction();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [opp, setOpp] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [includeClosed, setIncludeClosed] = useState(false);
  const [includeChecklists, setIncludeChecklists] = useState(false);

  const visible = tasks.filter((t) => (includeClosed || !t.opportunityClosed) && (includeChecklists || t.dueDate || !t.opportunityId || showDone));
  const groups: { key: string; title: string; items: TaskListItem[]; tone?: string }[] = showDone
    ? [{ key: "done", title: "Terminées", items: visible }]
    : [
        { key: "overdue", title: "En retard", items: visible.filter((t) => t.dueDate && t.dueDate < today), tone: "text-warning-600" },
        { key: "today", title: "Aujourd’hui", items: visible.filter((t) => t.dueDate === today) },
        { key: "week", title: "7 prochains jours", items: visible.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7)) },
        { key: "later", title: "Plus tard", items: visible.filter((t) => t.dueDate && t.dueDate > addDays(today, 7)) },
        { key: "nodate", title: "Sans date", items: visible.filter((t) => !t.dueDate) },
      ];

  const add = () => {
    if (!title.trim()) return;
    run(() => createTaskAction({ title: title.trim(), dueDate: due, opportunityId: opp.id, kind: "TODO" }), {
      success: "Tâche ajoutée",
      onSuccess: () => {
        setTitle("");
        setDue(null);
      },
    });
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Tâches" description="Les tâches datées de toutes vos candidatures. Les étapes de checklist sans date restent sur chaque candidature." />
      <div className="mb-4 surface p-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nouvelle tâche…" autoFocus={autoFocus} />
          <DateInput value={due} onChange={setDue} className="md:w-40" />
          <div className="md:w-72">
            <EntityCombobox options={opportunities} value={opp} onChange={setOpp} placeholder="Lier à une candidature" allowCreate={false} />
          </div>
          <Button onClick={add} disabled={!title.trim()}>
            <Plus /> Ajouter
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[
            ["Aujourd’hui", today],
            ["Demain", addDays(today, 1)],
            ["Dans 3 jours", addDays(today, 3)],
            ["Semaine prochaine", addDays(today, 7)],
          ].map(([label, value]) => (
            <Button key={label} size="xs" variant={due === value ? "secondary" : "ghost"} onClick={() => setDue(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Tabs value={showDone ? "done" : "open"} onValueChange={(v) => router.push(v === "done" ? "/tasks?show=done" : "/tasks")}>
          <TabsList>
            <TabsTrigger value="open">À faire</TabsTrigger>
            <TabsTrigger value="done">Terminées</TabsTrigger>
          </TabsList>
        </Tabs>
        {!showDone && (
          <div className="flex items-center gap-2">
            <Switch id="chk" size="sm" checked={includeChecklists} onCheckedChange={setIncludeChecklists} />
            <Label htmlFor="chk" className="text-xs text-muted-foreground">
              Inclure les étapes de checklist sans date
            </Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch id="closed-t" size="sm" checked={includeClosed} onCheckedChange={setIncludeClosed} />
          <Label htmlFor="closed-t" className="text-xs text-muted-foreground">
            Inclure les candidatures clôturées
          </Label>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={ListChecks} title={showDone ? "Aucune tâche terminée pour l’instant" : "Aucune tâche à faire"} description="Des tâches sont aussi créées automatiquement : préparation d’entretien, mot de remerciement, décision sur une offre…" />
      ) : (
        <div className="space-y-5">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.key} className="space-y-1.5">
                <h2 className={cn("heading-sm text-foreground", g.tone)}>
                  {g.title} <span className="font-normal">({g.items.length})</span>
                </h2>
                <ul className="surface-list">
                  {g.items.map((t) => (
                    <li key={t.id} className="group flex items-center gap-3 px-3 py-2">
                      <Checkbox checked={t.done} onCheckedChange={(v) => run(() => updateTaskAction(t.id, { done: !!v }))} aria-label={t.title} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm", t.done && "text-muted-foreground line-through")}>{t.title}</p>
                        {t.opportunityId && (
                          <Link href={`/applications/${t.opportunityId}?tab=checklist`} className="block truncate text-xs text-muted-foreground hover:underline">
                            {t.organizationName ? `${t.organizationName} — ` : ""}
                            {t.opportunityTitle}
                          </Link>
                        )}
                      </div>
                      {t.origin === "RULE" && <span className="hidden text-[10px] text-muted-foreground sm:inline">auto</span>}
                      {t.dueDate && !t.done && <DueBadge date={t.dueDate} />}
                      <button type="button" className="opacity-0 group-hover:opacity-100" onClick={() => run(() => deleteTaskAction(t.id), { success: "Tâche supprimée" })} aria-label="Supprimer la tâche">
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </PageContainer>
  );
}
