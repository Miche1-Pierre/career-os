import type { Metadata } from "next";
import { listEntries, listVariants } from "@/server/services/cv";
import { opportunityOptions } from "@/server/services/opportunities";
import { CvView } from "@/components/cv/cv-view";

export const metadata: Metadata = { title: "CV" };

export default async function CvPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const [variants, entries, opps] = await Promise.all([listVariants(), listEntries(), opportunityOptions({ limit: 300 })]);
  return (
    <CvView
      variants={JSON.parse(JSON.stringify(variants))}
      entries={entries}
      opportunities={opps.map((o) => ({ id: o.id, label: o.organizationName ? `${o.organizationName} · ${o.title}` : o.title }))}
      selectedId={v ?? null}
    />
  );
}
