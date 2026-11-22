import type { Metadata } from "next";
import { getToday } from "@/server/services/today";
import { evaluateRulesThrottled } from "@/server/services/rules";
import { getSettings } from "@/server/services/settings";
import { TodayView } from "@/components/today/today-view";
import { listTasks } from "@/server/services/tasks";

export const metadata: Metadata = { title: "Aujourd’hui" };

export default async function TodayPage() {
  await evaluateRulesThrottled();
  const [data, settings, tasks] = await Promise.all([getToday(), getSettings(), listTasks({ status: "open", limit: 300 })]);
  return <TodayView data={JSON.parse(JSON.stringify(data))} tasks={JSON.parse(JSON.stringify(tasks))} userName={settings.general.userName} />;
}
