import { listThreads } from "@/server/chat/chat";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ data: await listThreads() }, { headers: { "cache-control": "no-store" } });
}
