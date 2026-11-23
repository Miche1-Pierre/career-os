import fs from "node:fs";
import { pingDatabase } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * `?beat=1`: an open Career OS page checking in (components/app/heartbeat.tsx). An install without a window of its
 * own (Microsoft Store) stops once no page has checked in for a while; elsewhere the beat is ignored.
 */
function heartbeat() {
  const file = process.env.CAREER_OS_HEARTBEAT_FILE;
  if (file) {
    try {
      const now = new Date();
      fs.utimesSync(/*turbopackIgnore: true*/ file, now, now);
    } catch {
      try {
        fs.writeFileSync(/*turbopackIgnore: true*/ file, "");
      } catch {
        // data folder unavailable: the app then simply keeps running
      }
    }
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("beat")) return heartbeat();
  const database = await pingDatabase();
  return Response.json(
    { status: database.ok ? "ok" : "degraded", database, time: new Date().toISOString(), version: process.env.APP_VERSION ?? "1.0.0" },
    { status: database.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
