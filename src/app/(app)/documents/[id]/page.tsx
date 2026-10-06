import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDocument } from "@/server/services/documents";
import { AppError } from "@/server/context";
import { DocumentDetailView } from "@/components/documents/document-detail";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDocument(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return <DocumentDetailView data={JSON.parse(JSON.stringify(data))} />;
}
