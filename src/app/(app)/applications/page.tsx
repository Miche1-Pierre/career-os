import type { Metadata } from "next";
import { listOpportunities } from "@/server/services/opportunities";
import { listViews } from "@/server/services/views";
import { parseListFilters, type ListFilters } from "@/lib/filters";
import { ApplicationsList } from "@/components/opportunities/applications-list";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const viewId = typeof sp.view === "string" ? sp.view : undefined;
  const views = await listViews();
  const view = viewId ? views.find((v) => v.id === viewId) : undefined;
  const fromUrl = parseListFilters(sp);
  const filters: ListFilters = view ? { ...(view.filters as ListFilters), ...Object.fromEntries(Object.entries(fromUrl).filter(([, v]) => v !== undefined)) } : fromUrl;
  const rows = await listOpportunities({
    q: filters.q,
    family: filters.family,
    types: filters.types,
    categories: filters.categories,
    stageKeys: filters.stages,
    tags: filters.tags,
    sources: filters.sources,
    priorities: filters.priorities,
    countries: filters.countries,
    includeClosed: filters.includeClosed,
    archived: filters.archived ? "only" : "exclude",
    sort: (filters.sort as never) ?? "updated",
    limit: 1000,
  });
  const countries = [...new Set(rows.map((r) => r.locationCountry).filter(Boolean) as string[])].sort();
  return <ApplicationsList rows={JSON.parse(JSON.stringify(rows))} filters={filters} view={view ? { id: view.id, name: view.name } : null} countries={countries} />;
}
