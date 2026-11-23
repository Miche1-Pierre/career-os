import { NextResponse, type NextRequest } from "next/server";
import { searchPlaces } from "@/server/services/place-search";

/** Place suggestions while typing (cities or addresses), see services/place-search.ts. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const mode = sp.get("mode") === "city" ? "city" : "address";
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const near = sp.has("lat") && sp.has("lng") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const results = await searchPlaces(q, { mode, near });
  return NextResponse.json({ data: results }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
