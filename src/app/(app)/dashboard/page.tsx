import type { Metadata } from "next";
import { getDashboard } from "@/server/services/analytics";
import { getToday } from "@/server/services/today";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [dashboard, today] = await Promise.all([getDashboard(), getToday({ horizonDays: 14 })]);
  const upcoming = [...today.dueToday, ...today.upcoming].filter((i) => i.kind === "INTERVIEW" || i.kind === "DEADLINE" || i.kind === "OPENS" || i.kind === "DECISION").slice(0, 8);
  return <DashboardView data={JSON.parse(JSON.stringify(dashboard))} upcoming={JSON.parse(JSON.stringify(upcoming))} overdue={today.counts.overdue} />;
}
