import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContact } from "@/server/services/contacts";
import { AppError } from "@/server/context";
import { ContactDetailView } from "@/components/network/contact-detail";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getContact(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return <ContactDetailView data={JSON.parse(JSON.stringify(data))} />;
}
