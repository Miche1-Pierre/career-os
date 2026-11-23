import type { Metadata } from "next";
import { listSearches } from "@/server/services/discovery";
import { listMoves } from "@/server/services/moves";
import { DISCOVERY_SOURCES } from "@/lib/discovery";
import { SearchesView } from "@/components/discovery/searches-view";

export const metadata: Metadata = { title: "Recherches" };

export default async function SearchesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const [searches, moves] = await Promise.all([listSearches(), listMoves()]);
  const adzunaReady = !!(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim());
  return (
    <SearchesView
      searches={JSON.parse(JSON.stringify(searches))}
      moves={moves.map((m) => ({ id: m.id, title: m.title, city: m.city, country: m.country, arrivalDate: m.arrivalDate, departureDate: m.departureDate, workAddress: m.workAddress, currency: m.currency }))}
      sources={DISCOVERY_SOURCES}
      adzunaReady={adzunaReady}
      openNew={isNew === "housing" ? "HOUSING" : isNew === "jobs" ? "JOBS" : null}
    />
  );
}
