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
    ? [{ key: "done", title: "Completed", items: visible }]
    : [
        { key: "overdue", title: "Overdue", items: visible.filter((t) => t.dueDate && t.dueDate < today), tone: "text-warning-600" },
        { key: "today", title: "Today", items: visible.filter((t) => t.dueDate === today) },
        { key: "week", title: "Next 7 days", items: visible.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7)) },
        { key: "later", title: "Later", items: visible.filter((t) => t.dueDate && t.dueDate > addDays(today, 7)) },
        { key: "nodate", title: "No date", items: visible.filter((t) => !t.dueDate) },
      ];

  const add = () => {
    if (!title.trim()) return;
    run(() => createTaskAction({ title: title.trim(), dueDate: due, opportunityId: opp.id, kind: "TODO" }), {
      success: "Task added",
      onSuccess: () => {
        setTitle("");
        setDue(null);
      },
    });
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Tasks" description="Dated tasks across all your applications. Checklist steps without a date stay on each application." />
      <div className="mb-4 surface p-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New task…" autoFocus={autoFocus} />
          <DateInput value={due} onChange={setDue} className="md:w-40" />
          <div className="md:w-72">
            <EntityCombobox options={opportunities} value={opp} onChange={setOpp} placeholder="Link to an application" allowCreate={false} />
          </div>
          <Button onClick={add} disabled={!title.trim()}>
            <Plus /> Add
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[
            ["Today", today],
            ["Tomorrow", addDays(today, 1)],
            ["In 3 days", addDays(today, 3)],
            ["Next week", addDays(today, 7)],
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
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="done">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        {!showDone && (
          <div className="flex items-center gap-2">
            <Switch id="chk" size="sm" checked={includeChecklists} onCheckedChange={setIncludeChecklists} />
            <Label htmlFor="chk" className="text-xs text-muted-foreground">
              Include undated checklist steps
            </Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch id="closed-t" size="sm" checked={includeClosed} onCheckedChange={setIncludeClosed} />
          <Label htmlFor="closed-t" className="text-xs text-muted-foreground">
            Include closed applications
          </Label>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={ListChecks} title={showDone ? "Nothing completed yet" : "No open task"} description="Tasks are also created automatically: interview preparation, thank-you notes, offer decisions…" />
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
                      <button type="button" className="opacity-0 group-hover:opacity-100" onClick={() => run(() => deleteTaskAction(t.id), { success: "Task deleted" })} aria-label="Delete task">
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
