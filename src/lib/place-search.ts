/**
 * Place suggestions (autocomplete) built from Photon / OpenStreetMap results. Pure and client-safe: the formatting
 * is tested, the network call lives in src/server/services/place-search.ts.
 */
import { COUNTRIES } from "./countries";

export type PlaceSearchMode = "city" | "address";

export interface PlaceHit {
  /** A city, a street address, or a named place (club, station, school…). */
  kind: "city" | "address" | "poi";
  /** Text put in the field ("Avenue Louise 106, 1050 Ixelles" or "Bruxelles"). */
  label: string;
  /** Main line of the suggestion (street and number, place name or city). */
  title: string;
  /** Second line (postcode, city, country). */
  subtitle: string;
  lat: number;
  lng: number;
  city: string | null;
  /** Country name in French when known ("Belgique"), else as OpenStreetMap gives it. */
  country: string | null;
  countryCode: string | null;
}

export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

/** Countries that write the number before the street ("106 avenue…"); elsewhere it comes after ("Avenue Louise 106"). */
const NUMBER_FIRST = new Set(["FR", "GB", "IE", "US", "CA", "AU", "NZ", "LU", "SG"]);

/** One Photon result as a suggestion, or null when it has no coordinates or nothing to show. */
export function formatPhotonFeature(f: PhotonFeature, mode: PlaceSearchMode): PlaceHit | null {
  const [lng, lat] = f.geometry?.coordinates ?? [];
  const p = f.properties ?? {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const code = p.countrycode?.toUpperCase() ?? null;
  const country = (code && COUNTRIES.find((c) => c.code === code)?.name) || p.country || null;
  const type = p.type ?? "";
  // OpenStreetMap files house numbers under the "place" key too (place=house): only real settlements count as cities.
  const SETTLEMENTS = ["city", "town", "village", "hamlet", "municipality", "suburb", "quarter", "neighbourhood", "locality"];
  const isSettlement = ["city", "town", "village", "locality", "district"].includes(type) || (p.osm_key === "place" && SETTLEMENTS.includes(p.osm_value ?? ""));

  if (mode === "city" || isSettlement) {
    const name = p.name ?? p.city;
    if (!name) return null;
    const region = [p.state && p.state !== name ? p.state : null, country].filter(Boolean).join(", ");
    return { kind: "city", label: name, title: name, subtitle: region, lat, lng, city: name, country, countryCode: code };
  }

  const street = p.street ?? (type === "street" ? p.name : undefined);
  const streetLine = street ? (p.housenumber ? (code && NUMBER_FIRST.has(code) ? `${p.housenumber} ${street}` : `${street} ${p.housenumber}`) : street) : null;
  // A named place (club, station, school…) keeps its name as the title.
  // Photon types such results "house" too: the OpenStreetMap key tells a street (highway) from a club or a station.
  const poiName = p.name && p.name !== street && type !== "street" && p.osm_key !== "highway" && p.osm_key !== "place" ? p.name : null;
  const city = p.city ?? p.locality ?? p.district ?? null;
  const locality = [p.postcode, city].filter(Boolean).join(" ");
  const title = poiName ?? streetLine ?? city;
  if (!title) return null;
  const label = [poiName ? null : streetLine, poiName ? [poiName, streetLine].filter(Boolean).join(", ") : null, locality].filter(Boolean).join(", ");
  const subtitle = [poiName ? streetLine : null, locality, country].filter(Boolean).join(", ");
  return { kind: poiName ? "poi" : "address", label, title, subtitle, lat, lng, city, country, countryCode: code };
}
