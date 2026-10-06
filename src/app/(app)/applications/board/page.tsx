import type { Metadata } from "next";
import { listOpportunities } from "@/server/services/opportunities";
import { parseListFilters } from "@/lib/filters";
import { KanbanBoard } from "@/components/opportunities/kanban-board";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseListFilters(await searchParams);
  const rows = await listOpportunities({ family: filters.family, tags: filters.tags, q: filters.q, types: filters.types, sort: "priority", limit: 2000 });
  return <KanbanBoard rows={JSON.parse(JSON.stringify(rows))} filters={filters} />;
}
