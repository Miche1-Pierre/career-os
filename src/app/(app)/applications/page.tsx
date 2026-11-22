import type { Metadata } from "next";
import { listOpportunities } from "@/server/services/opportunities";
import { listViews } from "@/server/services/views";
import { ApplicationsList } from "@/components/opportunities/applications-list";
import { defaultSort, parseLayout, resolveFilters, type SavedViewRef, type SearchParamsRecord } from "@/components/opportunities/applications-params";

export const metadata: Metadata = { title: "Candidatures" };

/** Candidatures: one page, two layouts (`?layout=board` for the Kanban), same filters, saved views (`?view=<id>`). */
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const sp = await searchParams;
  const layout = parseLayout(sp);
  const viewId = typeof sp.view === "string" ? sp.view : undefined;
  const views: SavedViewRef[] = (await listViews()).map((v) => ({ id: v.id, name: v.name, filters: v.filters ?? {} }));
  const view = viewId ? (views.find((v) => v.id === viewId) ?? null) : null;
  const filters = resolveFilters(sp, view);
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
    sort: (filters.sort ?? defaultSort(layout)) as never,
    limit: layout === "board" ? 2000 : 1000,
  });
  // Selected countries stay in the list even when they filter everything else out.
  const countries = [...new Set([...rows.map((r) => r.locationCountry), ...(filters.countries ?? [])].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"));
  return <ApplicationsList rows={JSON.parse(JSON.stringify(rows))} filters={filters} layout={layout} view={view} views={JSON.parse(JSON.stringify(views))} countries={countries} />;
}
