import type { Metadata } from "next";
import { getSettings } from "@/server/services/settings";
import { listSearches } from "@/server/services/discovery";
import { listThreads } from "@/server/chat/chat";
import { listMoves } from "@/server/services/moves";
import { HomeHub } from "@/components/home/home-hub";

export const metadata: Metadata = { title: "Rechercher" };

/** Home: where everything starts (chat bar in the middle, quick actions, saved searches, recent chats). */
export default async function HomePage() {
  const [settings, searches, threads, moves] = await Promise.all([getSettings(), listSearches(), listThreads(6), listMoves()]);
  const name = (settings.general.userName || settings.profile.fullName || "").split(/\s+/)[0] || null;
  return (
    <HomeHub
      name={name}
      moveId={moves[0]?.id ?? null}
      searches={searches.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        lastRun: s.lastRun ? { startedAt: new Date(s.lastRun.startedAt).toISOString(), resultsNew: s.lastRun.resultsNew, status: s.lastRun.status } : null,
      }))}
      threads={threads.map((t) => ({ id: t.id, title: t.title, updatedAt: new Date(t.updatedAt).toISOString() }))}
    />
  );
}
