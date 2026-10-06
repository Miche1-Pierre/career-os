import type { Metadata } from "next";
import { listOpportunities } from "@/server/services/opportunities";
import { listOrganizations } from "@/server/services/organizations";
import { listContacts } from "@/server/services/contacts";
import { listDocuments } from "@/server/services/documents";
import { TrashView } from "@/components/app/trash-view";

export const metadata: Metadata = { title: "Recently deleted" };

export default async function TrashPage() {
  const [opps, orgs, contacts, docs] = await Promise.all([
    listOpportunities({ deleted: true, limit: 500 }),
    listOrganizations({ deleted: true }),
    listContacts({ deleted: true }),
    listDocuments({ deleted: true, withStatus: false }),
  ]);
  const items = [
    ...opps.map((o) => ({ type: "opportunity" as const, id: o.id, title: o.title, subtitle: o.organization?.name ?? null, deletedAt: o.deletedAt })),
    ...orgs.map((o) => ({ type: "organization" as const, id: o.id, title: o.name, subtitle: o.kind === "INSTITUTION" ? "Institution" : "Company", deletedAt: o.deletedAt })),
    ...contacts.map((c) => ({ type: "contact" as const, id: c.id, title: c.fullName, subtitle: c.organizationName, deletedAt: c.deletedAt })),
    ...docs.map((d) => ({ type: "document" as const, id: d.id, title: d.name, subtitle: `${d.versions.length} version(s)`, deletedAt: d.deletedAt })),
  ].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  return <TrashView items={JSON.parse(JSON.stringify(items))} />;
}
