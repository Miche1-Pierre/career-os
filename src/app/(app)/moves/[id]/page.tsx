import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMove } from "@/server/services/moves";
import { AppError } from "@/server/context";
import { MoveDetail } from "@/components/moves/move-detail";

const TABS = ["overview", "housing", "budget"];

async function load(id: string) {
  try {
    return await getMove(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const move = await load(id);
  return { title: move.title };
}

export default async function MovePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; listing?: string }> }) {
  const [{ id }, { tab, listing }] = await Promise.all([params, searchParams]);
  const move = await load(id);
  const initialTab = tab && TABS.includes(tab) ? tab : listing ? "housing" : "overview";
  return <MoveDetail key={move.id} move={JSON.parse(JSON.stringify(move))} initialTab={initialTab} initialListing={listing ?? null} />;
}
