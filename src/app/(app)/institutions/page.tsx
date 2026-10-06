import type { Metadata } from "next";
import { listOrganizations } from "@/server/services/organizations";
import { OrganizationsList } from "@/components/network/organizations-list";

export const metadata: Metadata = { title: "Institutions" };

export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const rows = await listOrganizations({ kind: "INSTITUTION" });
  return <OrganizationsList kind="INSTITUTION" rows={JSON.parse(JSON.stringify(rows))} openNew={isNew === "1"} />;
}
