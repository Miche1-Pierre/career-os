import type { Metadata } from "next";
import { listContacts } from "@/server/services/contacts";
import { ContactsList } from "@/components/network/contacts-list";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const rows = await listContacts();
  return <ContactsList rows={JSON.parse(JSON.stringify(rows))} openNew={isNew === "1"} />;
}
