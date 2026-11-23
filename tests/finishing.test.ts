import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import { convert, needsConversion, parseEcbRates } from "@/lib/fx";
import { countryInfo } from "@/lib/countries";
import { formatPhotonFeature } from "@/lib/place-search";
import { companyFromTitle, findBoards, prettySlug, searchName } from "@/lib/discovery";
import { placeTrips } from "@/lib/relocation";
import { addPlace, createMove, getMove, removePlace, updateBudget, upsertListing } from "@/server/services/moves";
import { createShare, getSharedMove, listShares, revokeShare } from "@/server/services/shares";
import { createSearch } from "@/server/services/discovery";
import { PROCEDURE_TEMPLATES } from "@/lib/procedure-templates";
import { templatesFor } from "@/lib/procedures";

const ECB = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time='2026-11-20'>
      <Cube currency='USD' rate='1.0500'/>
      <Cube currency='CHF' rate='0.9400'/>
      <Cube currency='GBP' rate='0.8500'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("currencies (ECB rates)", () => {
  it("parses the ECB file and converts through the euro", () => {
    const fx = parseEcbRates(ECB)!;
    expect(fx.date).toBe("2026-11-20");
    expect(fx.rates).toEqual({ USD: 1.05, CHF: 0.94, GBP: 0.85 });
    expect(convert(100, "EUR", "EUR", fx)).toBe(100);
    expect(convert(94, "CHF", "EUR", fx)).toBeCloseTo(100, 6);
    expect(convert(100, "EUR", "GBP", fx)).toBeCloseTo(85, 6);
    expect(convert(105, "USD", "CHF", fx)).toBeCloseTo(94, 6);
    expect(convert(100, "CAD", "EUR", fx)).toBeNull();
    expect(convert(100, "CHF", "EUR", null)).toBeNull();
    expect(needsConversion("CHF", "EUR", fx)).toBe(true);
    expect(needsConversion("EUR", "EUR", fx)).toBe(false);
    expect(needsConversion("CAD", "EUR", fx)).toBe(false);
    expect(parseEcbRates("<html>maintenance</html>")).toBeNull();
  });

  it("knows the currency of a destination", () => {
    expect(countryInfo("Suisse")?.currency).toBe("CHF");
    expect(countryInfo("switzerland")?.code).toBe("CH");
    expect(countryInfo("UK")?.currency).toBe("GBP");
    expect(countryInfo("Royaume-Uni")?.code).toBe("GB");
    expect(countryInfo("Belgique")?.currency).toBe("EUR");
    expect(countryInfo("Atlantide")).toBeNull();
  });
});

describe("place suggestions", () => {
  it("formats cities, addresses (number before or after the street) and named places", () => {
    const city = formatPhotonFeature({ geometry: { coordinates: [4.35, 50.85] }, properties: { name: "Bruxelles", type: "city", state: "Région de Bruxelles-Capitale", countrycode: "BE", country: "Belgium" } }, "city")!;
    expect(city).toMatchObject({ kind: "city", label: "Bruxelles", subtitle: "Région de Bruxelles-Capitale, Belgique", countryCode: "BE", lat: 50.85, lng: 4.35 });

    const be = formatPhotonFeature({ geometry: { coordinates: [4.36, 50.83] }, properties: { street: "Avenue Louise", housenumber: "106", postcode: "1050", city: "Ixelles", countrycode: "BE", type: "house" } }, "address")!;
    expect(be.label).toBe("Avenue Louise 106, 1050 Ixelles");
    expect(be.kind).toBe("address");
    // Photon files a house number as osm_key "place" / osm_value "house": still an address, not a city.
    const house = formatPhotonFeature({ geometry: { coordinates: [4.36, 50.83] }, properties: { osm_key: "place", osm_value: "house", type: "house", housenumber: "106", street: "Avenue Louise", city: "Bruxelles", postcode: "1050", countrycode: "BE" } }, "address")!;
    expect(house).toMatchObject({ kind: "address", label: "Avenue Louise 106, 1050 Bruxelles" });

    const fr = formatPhotonFeature({ geometry: { coordinates: [2.35, 48.85] }, properties: { street: "rue de Rivoli", housenumber: "12", postcode: "75004", city: "Paris", countrycode: "FR", type: "house" } }, "address")!;
    expect(fr.label).toBe("12 rue de Rivoli, 75004 Paris");

    const poi = formatPhotonFeature({ geometry: { coordinates: [4.37, 50.82] }, properties: { name: "Judo Club Ixelles", street: "Rue Gray", housenumber: "8", postcode: "1050", city: "Ixelles", countrycode: "BE", osm_key: "leisure", osm_value: "sports_centre", type: "house" } }, "address")!;
    expect(poi).toMatchObject({ kind: "poi", title: "Judo Club Ixelles", label: "Judo Club Ixelles, Rue Gray 8, 1050 Ixelles", subtitle: "Rue Gray 8, 1050 Ixelles, Belgique" });

    expect(formatPhotonFeature({ properties: { name: "Nowhere" } }, "address")).toBeNull();
  });

  it("gives the walking time from a listing to each place", () => {
    const trips = placeTrips({ lat: 50.8275, lng: 4.3517 }, [{ id: "p1", label: "Judo", lat: 50.8366, lng: 4.3668 }]);
    expect(trips).toHaveLength(1);
    expect(trips[0].km).toBeGreaterThan(1);
    expect(trips[0].walkMin).toBeGreaterThanOrEqual(15);
    expect(placeTrips({ lat: null, lng: null }, [{ id: "p1", label: "Judo", lat: 1, lng: 1 }])).toEqual([]);
  });
});

describe("searches", () => {
  it("names a search from its filters", () => {
    expect(searchName({ domain: "JOBS", criteria: { keywords: ["AI engineer", "full-stack"], locations: ["Bruxelles", "Paris", "Lyon"], remoteOk: true, companies: [] } })).toBe("AI engineer, full-stack · Bruxelles, Paris +1");
    expect(searchName({ domain: "JOBS", criteria: { keywords: ["FDE"], locations: [], remoteOk: true, companies: [] } })).toBe("FDE · télétravail");
    expect(searchName({ domain: "HOUSING", criteria: { city: "Bruxelles", types: ["ROOM_FLATSHARE", "STUDIO"], maxTotalMonthly: 800, currency: "EUR" } })).toMatch(/^Coloc, studio · Bruxelles · max 800\s€$/);
    expect(searchName({ domain: "HOUSING", criteria: { city: "Zurich", types: [], maxTotalMonthly: null, currency: "CHF" } })).toBe("Logement · Zurich");
  });

  it("finds the Greenhouse, Lever or Ashby board behind a careers link or page", () => {
    expect(findBoards("https://boards.greenhouse.io/mistralai/jobs/123")).toEqual([{ ats: "greenhouse", slug: "mistralai" }]);
    expect(findBoards("https://job-boards.eu.greenhouse.io/doctolib")).toEqual([{ ats: "greenhouse", slug: "doctolib" }]);
    expect(findBoards("https://jobs.lever.co/alan/abcd-1234")).toEqual([{ ats: "lever", slug: "alan" }]);
    expect(findBoards("https://jobs.ashbyhq.com/photoroom?utm=x")).toEqual([{ ats: "ashby", slug: "photoroom" }]);
    const html = `<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script><a href="https://boards.greenhouse.io/embed/job_board?for=acme&b=x">Jobs</a>`;
    expect(findBoards(html)).toEqual([{ ats: "greenhouse", slug: "acme" }]);
    expect(findBoards("https://www.example.com/careers")).toEqual([]);
    expect(prettySlug("mistral-ai")).toBe("Mistral Ai");
    expect(companyFromTitle("Jobs at Mistral AI")).toBe("Mistral AI");
    expect(companyFromTitle("Careers | Doctolib")).toBe("Doctolib");
    expect(companyFromTitle("Alan - Jobs")).toBe("Alan");
  });
});

describe("procedure templates", () => {
  it("parses every template and finds the one of each destination", () => {
    expect(PROCEDURE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const t of PROCEDURE_TEMPLATES) {
      expect(new Set(t.procedures.map((p) => p.key)).size).toBe(t.procedures.length);
      for (const p of t.procedures) for (const url of [p.officialUrl, ...p.steps.map((st) => st.officialUrl)].filter(Boolean)) expect(url).toMatch(/^https:\/\//);
      if (t.to !== "*") expect(templatesFor(PROCEDURE_TEMPLATES, "FR", t.to).map((x) => x.key)).toEqual([t.key, "FR-GENERIC"]);
    }
  });
});

describe("places, currency and read-only sharing (database)", () => {
  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
  });

  it("gives a Swiss move francs, and keeps an explicit currency", async () => {
    const zurich = await createMove({ title: "Zurich", city: "Zurich", country: "Suisse" }, USER);
    expect(zurich.currency).toBe("CHF");
    const london = await createMove({ title: "Londres", country: "Royaume-Uni", currency: "EUR" }, USER);
    expect(london.currency).toBe("EUR");
  });

  it("adds places with coordinates and computes walking times from listings", async () => {
    const move = await createMove({ title: "Bruxelles", city: "Bruxelles", country: "Belgique", workAddress: "Avenue Louise 106", workLat: 50.8327, workLng: 4.3609 }, USER);
    const place = await addPlace(move.id, { label: "Club de judo", address: "Rue Gray 8, 1050 Ixelles", lat: 50.8366, lng: 4.3768 }, USER);
    await upsertListing({ moveId: move.id, title: "Coloc Saint-Gilles", rent: 650, charges: 100, lat: 50.8275, lng: 4.3517, furnished: "YES" }, USER);
    let view = await getMove(move.id);
    expect(view.places).toHaveLength(1);
    expect(view.listings[0].trips).toEqual([expect.objectContaining({ placeId: place.id, label: "Club de judo" })]);
    // Without coordinates and without geocoding (tests), an address is refused rather than stored unplaced.
    await expect(addPlace(move.id, { label: "Gare", address: "Gare du Midi" }, USER)).rejects.toThrow(/introuvable/);
    await removePlace(move.id, place.id, USER);
    view = await getMove(move.id);
    expect(view.places).toEqual([]);
    expect(view.listings[0].trips).toEqual([]);
  });

  it("shares the open shortlist read-only, without contacts, notes or income, until revoked", async () => {
    const move = await createMove({ title: "BlackFin", city: "Bruxelles", country: "Belgique", arrivalDate: "2027-01-04", departureDate: "2027-07-02" }, USER);
    await updateBudget(move.id, { income: 1500, housingTarget: 600 }, USER);
    const { listing } = await upsertListing(
      { moveId: move.id, title: "Cohabs Ixelles", url: "https://cohabs.com/x", rent: 700, charges: 50, furnished: "YES", minLeaseMonths: 6, notes: "Gérant sympa, appeler le soir", contacts: { email: "owner@example.com", phone: "+32 470 00 00 00" } },
      USER,
    );
    const share = await createShare(move.id, { label: "Parents" }, USER);
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const shared = (await getSharedMove(share.token))!;
    expect(shared.title).toBe("BlackFin");
    expect(shared.listings).toHaveLength(1);
    const l = shared.listings[0];
    expect(l).toMatchObject({ title: "Cohabs Ixelles", total: 750, savings: null });
    expect(JSON.stringify(shared)).not.toMatch(/owner@example\.com|\+32 470|Gérant sympa|1500/);
    // The budget issue ("over budget") reveals the housing budget: hidden unless savings are shared.
    expect(l.issues.some((i) => i.key === "budget")).toBe(false);

    const withSavings = await createShare(move.id, { showSavings: true }, USER);
    const s2 = (await getSharedMove(withSavings.token))!;
    expect(s2.listings[0].savings).not.toBeNull();
    expect(s2.listings[0].issues.some((i) => i.key === "budget")).toBe(true);

    const rows = await listShares(move.id);
    expect(rows.find((r) => r.id === share.id)?.viewCount).toBe(1);

    await revokeShare(share.id, USER);
    expect(await getSharedMove(share.token)).toBeNull();
    expect(await getSharedMove("not-a-token")).toBeNull();

    // An expired link stops working.
    const { db } = await import("@/server/db");
    const s = await import("@/server/db/schema");
    await db.update(s.shareLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.shareLinks.id, withSavings.id));
    expect(await getSharedMove(withSavings.token)).toBeNull();
    expect(listing.id).toBeTruthy();
  });

  it("names a saved search from its filters when no name is given", async () => {
    const row = await createSearch({ domain: "JOBS", criteria: { keywords: ["AI engineer"], locations: ["Bruxelles"] } }, USER);
    expect(row.name).toBe("AI engineer · Bruxelles");
    const named = await createSearch({ domain: "JOBS", name: "Ma recherche", criteria: { keywords: ["FDE"] } }, USER);
    expect(named.name).toBe("Ma recherche");
  });
});
