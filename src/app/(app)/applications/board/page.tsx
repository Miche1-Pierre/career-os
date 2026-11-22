import { redirect } from "next/navigation";
import { boardRedirectHref, type SearchParamsRecord } from "@/components/opportunities/applications-params";

/** The board is now a layout of the Candidatures page: keep old links and the G B shortcut working. */
export default async function BoardPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  redirect(boardRedirectHref(await searchParams));
}
