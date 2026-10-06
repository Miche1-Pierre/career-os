import type { Metadata } from "next";
import { listInbox } from "@/server/services/inbox";
import { InboxList } from "@/components/inbox/inbox-list";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const v = view === "converted" || view === "archived" ? view : "active";
  const items = await listInbox({ view: v });
  return <InboxList items={JSON.parse(JSON.stringify(items))} view={v} />;
}
