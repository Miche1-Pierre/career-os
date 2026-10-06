import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import type { AppData } from "@/components/app/app-data";
import { getSettings } from "@/server/services/settings";
import { listStages } from "@/server/services/stages";
import { listTags } from "@/server/services/tags";
import { listViews } from "@/server/services/views";
import { getBadgeCounts } from "@/server/services/today";
import { hasDemoData } from "@/server/services/demo";
import { aiStatus } from "@/server/ai";
import { todayISO } from "@/lib/dates";
import { accessToken } from "@/server/security";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  if (!settings.onboarding.completedAt) redirect("/welcome");
  const [stages, tags, views, badges, demo, ai, jar] = await Promise.all([listStages(), listTags(), listViews(), getBadgeCounts(), hasDemoData(), aiStatus(), cookies()]);
  const data: AppData = {
    today: todayISO(settings.general.timezone),
    timezone: settings.general.timezone,
    dateLocale: settings.general.dateLocale,
    weekStartsOn: settings.general.weekStartsOn,
    userName: settings.general.userName,
    stages: stages.map((s) => ({ id: s.id, pipeline: s.pipeline, key: s.key, label: s.label, category: s.category, color: s.color, position: s.position, isDefault: s.isDefault })),
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
    ai: { available: ai.available, provider: ai.provider, detail: ai.detail, setup: ai.setup, model: ai.model },
    badges,
    views: views.map((v) => ({ id: v.id, name: v.name, filters: v.filters as Record<string, unknown> })),
    hasDemo: demo,
    accessProtected: !!accessToken(),
  };
  return (
    <AppShell data={data} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      {children}
    </AppShell>
  );
}
