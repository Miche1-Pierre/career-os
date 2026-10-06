import type { Metadata } from "next";
import { listTasks } from "@/server/services/tasks";
import { opportunityOptions } from "@/server/services/opportunities";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string; new?: string }> }) {
  const { show, new: isNew } = await searchParams;
  const [tasks, opps] = await Promise.all([listTasks({ status: show === "done" ? "done" : "open", limit: 1000 }), opportunityOptions({ limit: 300 })]);
  return (
    <TasksView
      tasks={JSON.parse(JSON.stringify(tasks))}
      showDone={show === "done"}
      autoFocus={isNew === "1"}
      opportunities={opps.map((o) => ({ id: o.id, label: o.organizationName ? `${o.organizationName} — ${o.title}` : o.title, hint: o.stageLabel }))}
    />
  );
}
