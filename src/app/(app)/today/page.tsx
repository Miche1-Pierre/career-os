import type { Metadata } from "next";
import { getToday } from "@/server/services/today";
import { evaluateRulesThrottled } from "@/server/services/rules";
import { getSettings } from "@/server/services/settings";
import { TodayView } from "@/components/today/today-view";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  await evaluateRulesThrottled();
  const [data, settings] = await Promise.all([getToday(), getSettings()]);
  return <TodayView data={JSON.parse(JSON.stringify(data))} userName={settings.general.userName} />;
}
