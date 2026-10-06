import { pingDatabase } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await pingDatabase();
  return Response.json(
    { status: database.ok ? "ok" : "degraded", database, time: new Date().toISOString(), version: process.env.APP_VERSION ?? "1.0.0" },
    { status: database.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
