import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInboxItem, storedResult } from "@/server/services/inbox";
import { listOrganizations } from "@/server/services/organizations";
import { opportunityOptions } from "@/server/services/opportunities";
import { getSettings } from "@/server/services/settings";
import { AppError } from "@/server/context";
import { draftFromCapture } from "@/lib/capture-mapping";
import { CaptureReview } from "@/components/inbox/capture-review";

export const metadata: Metadata = { title: "Review capture" };

export default async function InboxItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getInboxItem(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const [orgs, opps, settings] = await Promise.all([listOrganizations({ includeArchived: true }), opportunityOptions({ limit: 300 }), getSettings()]);
  const result = storedResult(item);
  const draft = result ? draftFromCapture(result, item, { timeZone: settings.general.timezone, by: item.resultMeta?.by === "CLAUDE" ? "CLAUDE" : "AI" }) : null;
  return (
    <CaptureReview
      item={JSON.parse(JSON.stringify(item))}
      result={result ? JSON.parse(JSON.stringify(result)) : null}
      draft={draft ? JSON.parse(JSON.stringify(draft)) : null}
      organizations={orgs.map((o) => ({ id: o.id, label: o.name, hint: o.kind === "INSTITUTION" ? "Institution" : o.city }))}
      opportunities={opps.map((o) => ({ id: o.id, label: o.organizationName ? `${o.organizationName} — ${o.title}` : o.title, hint: o.stageLabel }))}
    />
  );
}
