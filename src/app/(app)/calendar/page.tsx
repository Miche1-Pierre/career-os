import type { Metadata } from "next";
import { getCalendarEvents } from "@/server/services/calendar";
import { getSettings } from "@/server/services/settings";
import { addDays, endOfMonth, isISODate, startOfMonth, startOfWeek, todayISO } from "@/lib/dates";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.general.timezone);
  const anchor = month && isISODate(`${month}-01`) ? `${month}-01` : startOfMonth(today);
  const from = startOfWeek(startOfMonth(anchor), settings.general.weekStartsOn);
  const to = addDays(startOfWeek(endOfMonth(anchor), settings.general.weekStartsOn), 13);
  const events = await getCalendarEvents(from, to, { includeApplied: true });
  return <CalendarView month={anchor} events={JSON.parse(JSON.stringify(events))} />;
}
