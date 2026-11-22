import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBrandSiblings, getOrganization } from "@/server/services/organizations";
import { AppError } from "@/server/context";
import { OrganizationDetailView } from "@/components/network/organization-detail";

export const metadata: Metadata = { title: "Établissement" };

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrganization(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const brand = await getBrandSiblings(data.organization);
  return <OrganizationDetailView data={JSON.parse(JSON.stringify(data))} brand={brand} />;
}
