import type { Metadata } from "next";
import { getAnalytics, SEGMENTS, type SegmentKey } from "@/server/services/analytics";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ family?: string; segment?: string }> }) {
  const sp = await searchParams;
  const family = sp.family === "JOB" || sp.family === "EDUCATION" ? sp.family : "ALL";
  const segment = (Object.keys(SEGMENTS) as SegmentKey[]).includes(sp.segment as SegmentKey) ? (sp.segment as SegmentKey) : "source";
  const data = await getAnalytics({ family, segment });
  return <AnalyticsView data={JSON.parse(JSON.stringify(data))} family={family} segments={Object.entries(SEGMENTS).map(([key, s]) => ({ key, label: s.label }))} />;
}
