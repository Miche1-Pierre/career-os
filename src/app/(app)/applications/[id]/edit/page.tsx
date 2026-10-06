import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOpportunity } from "@/server/services/opportunities";
import { listOrganizations } from "@/server/services/organizations";
import { AppError } from "@/server/context";
import { opportunityToInput } from "@/lib/opportunity-input";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";

export const metadata: Metadata = { title: "Edit opportunity" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opp = await getOpportunity(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const orgs = await listOrganizations({ includeArchived: true });
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={`Edit — ${opp.title}`} description={opp.organization?.name} />
      <OpportunityForm
        mode="edit"
        opportunityId={id}
        initial={JSON.parse(JSON.stringify(opportunityToInput(opp)))}
        provenance={opp.provenance}
        organizations={orgs.map((o) => ({ id: o.id, label: o.name, hint: o.kind === "INSTITUTION" ? "Institution" : o.city }))}
      />
    </PageContainer>
  );
}
