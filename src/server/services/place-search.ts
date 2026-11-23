/**
 * Search-as-you-type for places (cities, addresses, points of interest), backed by Photon (komoot), an
 * OpenStreetMap geocoder built for autocompletion (the Nominatim usage policy forbids it). The browser only talks to
 * the app (/api/places/search); results are cached. Only what the user types is sent, nothing else.
 */
import type { PlaceHit, PlaceSearchMode } from "@/lib/place-search";
import { formatPhotonFeature, type PhotonFeature } from "@/lib/place-search";

const PHOTON = "https://photon.komoot.io/api/";
const cache = new Map<string, PlaceHit[]>();
const MAX_CACHE = 500;

export async function searchPlaces(q: string, options: { mode?: PlaceSearchMode; near?: { lat: number; lng: number } | null; lang?: string } = {}): Promise<PlaceHit[]> {
  const query = q.trim().replace(/\s+/g, " ").slice(0, 200);
  const mode = options.mode ?? "address";
  if (query.length < 2) return [];
  const near = options.near ? `${options.near.lat.toFixed(2)},${options.near.lng.toFixed(2)}` : "";
  const key = `${mode}|${near}|${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const params = new URLSearchParams({ q: query, limit: "8", lang: options.lang === "en" ? "en" : "fr" });
  if (mode === "city") for (const layer of ["city", "locality", "district"]) params.append("layer", layer);
  if (options.near) {
    params.set("lat", String(options.near.lat));
    params.set("lon", String(options.near.lng));
  }
  try {
    const res = await fetch(`${PHOTON}?${params}`, { headers: { "User-Agent": "CareerOS/0.1 (self-hosted personal app)" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const out: PlaceHit[] = [];
    for (const f of body.features ?? []) {
      const p = formatPhotonFeature(f, mode);
      if (!p || seen.has(p.label.toLowerCase())) continue;
      seen.add(p.label.toLowerCase());
      out.push(p);
      if (out.length >= 6) break;
    }
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, out);
    return out;
  } catch {
    return [];
  }
}
