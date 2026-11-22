import type { Metadata } from "next";
import { listMoves } from "@/server/services/moves";
import { opportunityOptions } from "@/server/services/opportunities";
import { MovesList } from "@/components/moves/moves-list";

export const metadata: Metadata = { title: "Moves" };

export default async function MovesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const [moves, opps] = await Promise.all([listMoves(), opportunityOptions({ limit: 300 })]);
  return (
    <MovesList
      moves={JSON.parse(JSON.stringify(moves))}
      autoCreate={isNew === "1"}
      opportunities={opps.map((o) => ({ id: o.id, label: o.organizationName ? `${o.organizationName} — ${o.title}` : o.title, hint: o.stageLabel }))}
    />
  );
}
