import type { Metadata } from "next";
import { listOpportunitySummaries, listOrganizations } from "@/server/services/organizations";
import { groupOrganizations } from "@/lib/org-grouping";
import { OrganizationsList } from "@/components/network/organizations-list";

export const metadata: Metadata = { title: "Établissements" };

export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const rows = await listOrganizations({ kind: "INSTITUTION" });
  // Brand rows (several sites) list each site's applications when expanded.
  const grouped = groupOrganizations(rows).flatMap((g) => (g.members.length > 1 ? g.members.map((m) => m.id) : []));
  const opportunities = await listOpportunitySummaries(grouped);
  return <OrganizationsList kind="INSTITUTION" rows={JSON.parse(JSON.stringify(rows))} opportunities={JSON.parse(JSON.stringify(opportunities))} openNew={isNew === "1"} />;
}
