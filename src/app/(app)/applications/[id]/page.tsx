import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOpportunity } from "@/server/services/opportunities";
import { listVersionOptions } from "@/server/services/documents";
import { listContacts } from "@/server/services/contacts";
import { listAudit } from "@/server/services/audit";
import { getSettings } from "@/server/services/settings";
import { AppError } from "@/server/context";
import { computeSkillMatch } from "@/lib/matching";
import { describeInterval, resolveFollowUpInterval } from "@/lib/followups";
import { OpportunityDetailView } from "@/components/opportunities/opportunity-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const o = await getOpportunity(id);
    return { title: o.organization ? `${o.title} — ${o.organization.name}` : o.title };
  } catch {
    return { title: "Opportunity" };
  }
}

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const opp = await getOpportunity(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const [versions, contacts, audit, settings] = await Promise.all([listVersionOptions(), listContacts(), listAudit("opportunity", id, 200), getSettings()]);
  const skillMatch = computeSkillMatch([...opp.skills, ...opp.technologies], settings.profile.skills);
  const interval = describeInterval(resolveFollowUpInterval(opp, settings.followUp, { afterInterview: opp.stage.category === "INTERVIEW" }));
  return (
    <OpportunityDetailView
      opp={JSON.parse(JSON.stringify(opp))}
      versions={JSON.parse(JSON.stringify(versions))}
      contactOptions={contacts.map((c) => ({ id: c.id, label: c.fullName, hint: c.organizationName ?? c.role }))}
      audit={JSON.parse(JSON.stringify(audit))}
      skillMatch={skillMatch}
      profileHasSkills={settings.profile.skills.length > 0}
      intervalLabel={interval}
      initialTab={tab ?? "overview"}
    />
  );
}
