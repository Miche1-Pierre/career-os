import type { Metadata } from "next";
import { listDocuments } from "@/server/services/documents";
import { libraryStatus } from "@/server/storage";
import { DocumentsLibrary } from "@/components/documents/documents-library";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ new?: string; archived?: string }> }) {
  const sp = await searchParams;
  const [docs, library] = await Promise.all([listDocuments({ includeArchived: sp.archived === "1" }), libraryStatus()]);
  return <DocumentsLibrary docs={JSON.parse(JSON.stringify(docs))} library={library} openNew={sp.new === "1"} showArchived={sp.archived === "1"} />;
}
