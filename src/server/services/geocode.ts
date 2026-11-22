/**
 * Address → coordinates with OpenStreetMap Nominatim (free, no key). Best effort: never throws, returns null on
 * any failure. Respects the public usage policy: ≤ 1 request/second, identifying User-Agent, results cached.
 * Disabled with GEOCODING=off (and always in tests).
 */
const cache = new Map<string, { lat: number; lng: number } | null>();
let lastCall = 0;

export function geocodingEnabled() {
  return process.env.GEOCODING !== "off" && process.env.NODE_ENV !== "test" && !process.env.VITEST;
}

async function lookup(query: string): Promise<{ lat: number; lng: number } | null> {
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": "CareerOS/0.1 (self-hosted personal app)", "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = body[0]?.lat && body[0]?.lon ? { lat: Number(body[0].lat), lng: Number(body[0].lon) } : null;
    cache.set(key, hit);
    return hit;
  } catch {
    return null;
  }
}

/**
 * Query variants, most precise first. Postal localities often differ from what OSM stores (e.g. « 1050 Ixelles »
 * vs « Bruxelles » for Avenue Louise), so we also try with the postcode alone and with the city.
 */
export function geocodeCandidates(address: string, city?: string | null, country?: string | null): string[] {
  const clean = (s: string) => s.trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
  const a = clean(address);
  const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
  const street = parts[0] ?? a;
  const postcode = a.match(/\b\d{4,5}\b(?!.*\b\d{4,5}\b)/)?.[0] ?? null;
  const withCity = city && !a.toLowerCase().includes(city.toLowerCase()) ? `${a}, ${city}` : a;
  const out = [
    country ? `${withCity}, ${country}` : withCity,
    withCity,
    postcode ? `${street}, ${postcode}` : null,
    city ? `${street}, ${city}` : null,
    a,
  ];
  return [...new Set(out.filter((q): q is string => !!q).map(clean))];
}

export async function geocode(address: string, city?: string | null, country?: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim() || !geocodingEnabled()) return null;
  for (const q of geocodeCandidates(address, city, country).slice(0, 4)) {
    const hit = await lookup(q);
    if (hit) return hit;
  }
  return null;
}
