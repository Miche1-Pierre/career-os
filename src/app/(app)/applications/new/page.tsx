import type { Metadata } from "next";
import { listOrganizations } from "@/server/services/organizations";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_META, type OpportunityType } from "@/lib/constants";
import { emptyOpportunityInput } from "@/lib/opportunity-input";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";

export const metadata: Metadata = { title: "New opportunity" };

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<{ type?: string; org?: string }> }) {
  const sp = await searchParams;
  const type: OpportunityType = OPPORTUNITY_TYPES.includes(sp.type as OpportunityType) ? (sp.type as OpportunityType) : "JOB";
  const orgs = await listOrganizations({ includeArchived: true });
  const initial = emptyOpportunityInput(type);
  if (sp.org) {
    const org = orgs.find((o) => o.id === sp.org);
    if (org) Object.assign(initial, { organizationId: org.id, organizationName: org.name });
  }
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={`New ${OPPORTUNITY_TYPE_META[type].label.toLowerCase()}`} description="Tip: Quick import (I) pre-fills everything from a pasted posting." />
      <OpportunityForm mode="create" initial={initial} organizations={orgs.map((o) => ({ id: o.id, label: o.name, hint: o.kind === "INSTITUTION" ? "Institution" : o.city }))} />
    </PageContainer>
  );
}
