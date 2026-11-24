import { EXPORT_SCHEMA_VERSION } from "@/lib/constants";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER, CLAUDE } from "@/server/context";
import {
  computeBudget,
  distanceKm,
  draftFirstMessage,
  firstPhone,
  fitLevel,
  listingFit,
  listingTotal,
  median,
  monthsBetween,
  normalizeBudget,
  walkMinutes,
  whatsappLink,
  type BudgetPlan,
} from "@/lib/relocation";
import {
  createMove,
  createMoveFromOpportunity,
  draftListingMessage,
  exportListingsCsv,
  getMove,
  listListingLines,
  setListingStatus,
  updateBudget,
  updateListing,
  updateMove,
  upsertListing,
} from "@/server/services/moves";
import { createOpportunity, changeStatus } from "@/server/services/opportunities";
import { getCalendarEvents } from "@/server/services/calendar";
import { handleMcpPayload } from "@/server/mcp/server";
import { dispatch } from "@/server/api/router";

const plan: BudgetPlan = normalizeBudget({
  income: 1500,
  food: 420,
  foodAllowance: 210,
  transitMonthly: 49,
  walkThresholdKm: 2,
  lines: [
    { id: "sport", label: "Sport", amount: 50, kind: "EXPENSE" },
    { id: "phone", label: "Phone", amount: 15, kind: "EXPENSE" },
    { id: "leisure", label: "Leisure", amount: 150, kind: "EXPENSE" },
  ],
  housingTarget: 800,
});

describe("relocation maths", () => {
  it("computes the monthly savings like the Brussels spreadsheet", () => {
    // Cohabs Saint-Gilles: 689 + 150, 0.7 km → walk, no transport.
    expect(computeBudget(plan, 839, 0.7).savings).toBe(236);
    // Corners Gravelines: 820 at 2.4 km → STIB counted.
    const far = computeBudget(plan, 820, 2.4);
    expect(far.transport).toBe(49);
    expect(far.savings).toBe(206);
    // Unknown distance → conservative (transport counted).
    expect(computeBudget(plan, 800, null).transport).toBe(49);
    // Meal vouchers only offset food, never become free income.
    expect(computeBudget({ ...plan, foodAllowance: 600 }, 800, 0).foodOutOfPocket).toBe(0);
  });

  it("totals rent and charges", () => {
    expect(listingTotal({ rent: 565, charges: 270, allInclusive: false })).toBe(835);
    expect(listingTotal({ rent: 865, charges: null, allInclusive: true })).toBe(865);
    expect(listingTotal({ rent: null, charges: 100, allInclusive: false })).toBeNull();
  });

  it("measures distances and walking times", () => {
    // Rue de la Loi 16 → Rue Jourdan 155 (Saint-Gilles): ≈ 0.7 km.
    const km = distanceKm({ lat: 50.8318, lng: 4.359 }, { lat: 50.8287, lng: 4.3504 });
    expect(km).toBeGreaterThan(0.5);
    expect(km).toBeLessThan(0.9);
    expect(walkMinutes(0.7)).toBe(10);
    expect(walkMinutes(2.4)).toBe(35);
  });

  it("counts the months of a stay", () => {
    expect(monthsBetween("2027-01-04", "2027-07-02")).toBe(6);
    expect(monthsBetween("2027-01-01", "2027-07-03")).toBe(7);
  });

  it("flags blocking conditions deterministically", () => {
    const ctx = { arrivalDate: "2027-01-04", departureDate: "2027-07-02", housingTarget: 800, walkThresholdKm: 2 };
    const leys = listingFit({ rent: 565, charges: 270, allInclusive: false, availableFrom: null, minLeaseMonths: 12, furnished: "YES", distanceKm: 2.9 }, ctx);
    expect(leys.find((i) => i.key === "lease")?.level).toBe("ko");
    expect(fitLevel(leys)).toBe("ko");
    const late = listingFit({ rent: 635, charges: 150, allInclusive: false, availableFrom: "2027-02-01", minLeaseMonths: 6, furnished: "YES", distanceKm: 1.5 }, ctx);
    expect(late.find((i) => i.key === "availability")?.level).toBe("ko");
    const forest = listingFit({ rent: 550, charges: 150, allInclusive: false, availableFrom: null, minLeaseMonths: 6, furnished: "NO", distanceKm: 1.8 }, ctx);
    expect(forest.find((i) => i.key === "furnished")?.level).toBe("ko");
    const good = listingFit({ rent: 689, charges: 150, allInclusive: false, availableFrom: "2026-12-15", minLeaseMonths: 6, furnished: "YES", distanceKm: 0.7 }, ctx);
    expect(fitLevel(good)).toBe("warn"); // 839 is slightly over the 800 target
    const cheap = listingFit({ rent: 300, charges: 0, allInclusive: true, availableFrom: null, minLeaseMonths: 6, furnished: "YES", distanceKm: 1 }, { ...ctx, medianTotal: 820 });
    expect(cheap.some((i) => i.key === "price")).toBe(true);
    expect(median([1, 5, 3, 9])).toBe(4);
  });

  it("drafts a first message that only asks for missing information", () => {
    const base = { title: "Nomad's House", url: null, rent: 865, charges: 0, allInclusive: true, chargesInclude: ["all bills"], deposit: null, depositText: null, minLeaseMonths: 6, availableFrom: null, housemates: null, furnished: "YES" as const };
    const fr = draftFirstMessage(base, { language: "fr", firstName: "Camille", city: "Bruxelles", arrivalDate: "2027-01-04", departureDate: "2027-07-02", reason: "un stage" });
    expect(fr.body).toContain("du 4 janvier 2027 au 2 juillet 2027");
    expect(fr.questions.some((q) => q.includes("garantie"))).toBe(true);
    expect(fr.questions.some((q) => q.includes("charges"))).toBe(false);
    expect(fr.body.endsWith("Camille")).toBe(true);
    const en = draftFirstMessage({ ...base, deposit: 1730, housemates: 5 }, { language: "en", firstName: null, city: null, arrivalDate: null, departureDate: null, reason: null });
    expect(en.questions).toHaveLength(1);
  });

  it("builds WhatsApp links from messy phone strings", () => {
    expect(firstPhone("+32 489 46 49 11 (WhatsApp)")).toBe("+32 489 46 49 11");
    expect(whatsappLink("+32 489 46 49 11", "Bonjour")).toBe("https://wa.me/32489464911?text=Bonjour");
    expect(whatsappLink("12")).toBeNull();
  });
});

describe("moves and housing (database)", () => {
  let moveId: string;

  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
  });

  it("creates a move from an accepted offer and finds it again", async () => {
    const { opportunity } = await createOpportunity({ type: "INTERNSHIP", title: "AI Transformation Intern", organizationName: "Acme", locationCity: "Bruxelles", locationCountry: "Belgique" }, USER);
    await changeStatus(opportunity!.id, { status: "OFFER" }, USER);
    const m = await createMoveFromOpportunity(opportunity!.id, USER);
    expect(m.title).toBe("Acme · Bruxelles");
    expect(m.city).toBe("Bruxelles");
    const again = await createMoveFromOpportunity(opportunity!.id, USER);
    expect(again.id).toBe(m.id);
    moveId = m.id;
    await updateBudget(moveId, plan, USER);
    await updateMove(moveId, { arrivalDate: "2027-01-04", departureDate: "2027-07-02" }, USER);
    const view = await getMove(moveId);
    expect(view.budgetPlan.income).toBe(1500);
    expect(view.opportunityTitle).toBe("AI Transformation Intern");
  });

  it("deduplicates listings by URL and keeps a history", async () => {
    const first = await upsertListing({ moveId, title: "Cohabs Saint-Gilles", url: "https://www.immoweb.be/fr/annonce/studio/a-louer/saint-gilles/1060/21448385?utm_source=x", rent: 689, charges: 150, furnished: "YES", distanceKm: 0.7, distanceEstimated: true }, USER);
    expect(first.created).toBe(true);
    expect(first.listing.url).toBe("https://www.immoweb.be/fr/annonce/studio/a-louer/saint-gilles/1060/21448385");
    expect(first.listing.sources[0].name).toBe("immoweb.be");
    const second = await upsertListing({ moveId, title: "Cohabs Saint-Gilles (room 2)", url: "https://www.immoweb.be/fr/annonce/studio/a-louer/saint-gilles/1060/21448385", minLeaseMonths: 3 }, CLAUDE);
    expect(second.created).toBe(false);
    expect(second.listing.id).toBe(first.listing.id);
    expect(second.listing.minLeaseMonths).toBe(3);
    await setListingStatus(first.listing.id, "SHORTLISTED", USER);
    const contacted = await setListingStatus(first.listing.id, "CONTACTED", USER);
    expect(contacted.contactedAt).not.toBeNull();
    expect(contacted.history.map((h) => h.text)).toContain("À contacter → Contacté");
    await expect(setListingStatus(first.listing.id, "EXCLUDED", USER)).rejects.toThrow(/pourquoi/);
  });

  it("enriches listings with total, commute, fit and savings", async () => {
    const leys = await upsertListing({ moveId, title: "Rue Leys", rent: 565, charges: 270, minLeaseMonths: 12, furnished: "YES", distanceKm: 2.9 }, USER);
    const view = await getMove(moveId);
    const l = view.listings.find((x) => x.id === leys.listing.id)!;
    expect(l.total).toBe(835);
    expect(l.fit).toBe("ko");
    expect(l.budget?.transport).toBe(49);
    const cohabs = view.listings.find((x) => x.title.startsWith("Cohabs"))!;
    expect(cohabs.budget?.savings).toBe(236);
    expect(cohabs.walkMin).toBe(10);
    expect(view.summary.waitingReply).toBe(1);
  });

  it("puts housing visits and the arrival in the calendar", async () => {
    const view = await getMove(moveId);
    await updateListing(view.listings[0].id, { visitDate: "2026-12-12", visitTime: "10:30" }, USER);
    const events = await getCalendarEvents("2026-12-01", "2027-01-31");
    expect(events.some((e) => e.kind === "VISIT" && e.time === "10:30")).toBe(true);
    expect(events.some((e) => e.kind === "MOVE" && e.date === "2027-01-04")).toBe(true);
  });

  it("drafts a message, exports CSV and exposes REST + MCP", async () => {
    const view = await getMove(moveId);
    const draft = await draftListingMessage(view.listings[0].id, "fr");
    expect(draft.subject).toContain("Cohabs");
    const csv = await exportListingsCsv(moveId);
    expect(csv.content.startsWith("﻿Statut;Mon top;Logement")).toBe(true);
    expect(csv.content).toContain("Rue Leys");

    const res = await dispatch(new Request(`http://localhost/api/v1/moves/${moveId}`), ["moves", moveId]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { listings: unknown[] } };
    expect(body.data.listings.length).toBe(2);

    const list = (await handleMcpPayload({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_moves", "get_move", "upsert_housing_listing", "update_budget", "draft_listing_message"]));
    const call = (await handleMcpPayload({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "upsert_housing_listing", arguments: { moveId, title: "Nomad's House Lausanne", rent: 865, charges: 0, allInclusive: true, minLeaseMonths: 6, furnished: "YES" } },
    })) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(call.result.isError).toBeFalsy();
    expect(JSON.parse(call.result.content[0].text).created).toBe(true);
  });

});

describe("geocoding queries", () => {
  it("tries the postcode alone when the postal locality is not what OSM knows", async () => {
    const { geocodeCandidates } = await import("@/server/services/geocode");
    const q = geocodeCandidates("Rue de la Loi 16, 1050 Ixelles", "Bruxelles", "Belgique");
    expect(q[0]).toBe("Rue de la Loi 16, 1050 Ixelles, Bruxelles, Belgique");
    expect(q).toContain("Rue de la Loi 16, 1050");
    expect(q).toContain("Rue de la Loi 16, Bruxelles");
  });
});

describe("relocation data in backups", () => {
  it("exports moves and listings", async () => {
    const { exportAll } = await import("@/server/services/data-transfer");
    const file = await exportAll();
    expect(file.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(file.counts.moves).toBe(1);
    expect(file.counts.housingListings).toBe(3);
  });
});

describe("listings read again by an assistant (database)", () => {
  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
  });

  it("completes a listing read again without replacing the user's choices", async () => {
    const own = await createMove({ title: "Second move", city: "Bruxelles", arrivalDate: "2027-01-04", departureDate: "2027-07-02" }, USER);
    const url = "https://www.immoweb.be/fr/annonce/rez-de-chaussee/a-louer/bruxelles/1040/21887154";
    const first = await upsertListing({ moveId: own.id, title: "Colonies, maison Atrébates", url, rent: 760, charges: 0, allInclusive: true, privateBathroom: true, notes: "Salle de bain privée, jardin.", contacts: { phone: "+33 7 57 90 70 92" } }, USER);
    await setListingStatus(first.listing.id, "SHORTLISTED", USER);
    await updateListing(first.listing.id, { pick: "YES", visitDate: "2026-12-20" }, USER);

    // The in-app assistant reads the same ad again (24/11/2026): new facts, its own title, notes and status.
    const again = await upsertListing(
      { moveId: own.id, title: "Coliving quartier européen - Immoweb 21887154", url, rent: 730, charges: null, status: "NEW", pick: "NO", notes: "Chambre 6 à 730 €.", contacts: { email: "colonies.leads@gmail.com" } },
      CLAUDE,
    );
    expect(again.created).toBe(false);
    expect(again.listing.id).toBe(first.listing.id);
    expect(again.listing.title).toBe("Colonies, maison Atrébates");
    expect(again.listing.status).toBe("VISIT_PLANNED"); // the user's visit moved it on; the assistant's NEW is ignored
    expect(again.listing.pick).toBe("YES");
    expect(again.listing.visitDate).toBe("2026-12-20");
    expect(again.listing.rent).toBe(730);
    expect(again.listing.charges).toBe(0); // « unknown » never erases a known value
    expect(again.listing.contacts).toEqual({ phone: "+33 7 57 90 70 92", email: "colonies.leads@gmail.com" });
    expect(again.listing.notes).toMatch(/^Salle de bain privée, jardin\.\n\nMise à jour du \d{4}-\d{2}-\d{2} : Chambre 6 à 730 €\.$/);
    expect(again.updated.sort()).toEqual(["contacts", "notes", "rent"]);
    expect(again.kept.sort()).toEqual(["pick", "status", "title"]);
    expect(again.listing.history.at(-1)?.text).toBe("Mis à jour par Claude : loyer, contacts, notes");

    // Reading the same ad once more changes nothing (notes are not appended twice).
    const third = await upsertListing({ moveId: own.id, title: "x", url, rent: 730, notes: "Chambre 6 à 730 €." }, CLAUDE);
    expect(third.updated).toEqual([]);
    expect(third.listing.notes).toBe(again.listing.notes);

    // The user asked to replace: overwrite.
    const replaced = await upsertListing({ moveId: own.id, title: "Atrébates (chambre 6)", url, notes: "Seulement la chambre 6." }, CLAUDE, { overwrite: true });
    expect(replaced.listing.title).toBe("Atrébates (chambre 6)");
    expect(replaced.listing.notes).toBe("Seulement la chambre 6.");

    // A listing never reviewed (NEW) takes the status of the new reading.
    const lease = await upsertListing({ moveId: own.id, title: "Studio César Franck", url: "https://www.immoweb.be/fr/annonce/studio/a-louer/ixelles/1050/21885412", rent: 650 }, CLAUDE);
    const excluded = await upsertListing({ moveId: own.id, title: "Studio", url: lease.listing.url!, minLeaseMonths: 36, status: "EXCLUDED", excludedReason: "Bail de 3 ans minimum." }, CLAUDE);
    expect(excluded.listing.status).toBe("EXCLUDED");
    expect(excluded.listing.excludedReason).toBe("Bail de 3 ans minimum.");
    expect(excluded.listing.title).toBe("Studio César Franck");
  });

  it("lists a move's listings one short line each, a page at a time (MCP list_listings)", async () => {
    const own = await createMove({ title: "Busy move", city: "Bruxelles" }, USER);
    const notes = "Longue description de l'annonce. ".repeat(60);
    for (let i = 0; i < 60; i++) {
      await upsertListing({ moveId: own.id, title: `Chambre ${i}`, url: `https://example.org/annonce/${i}`, rent: 600 + i, charges: 100, notes, chargesInclude: ["eau", "électricité", "internet"], status: i < 5 ? "EXCLUDED" : undefined, excludedReason: i < 5 ? "Bail d'un an" : undefined }, USER);
    }
    const page = await listListingLines(own.id);
    expect(page.count).toBe(60);
    expect(page.listings).toHaveLength(50);
    expect(page.nextOffset).toBe(50);
    expect(page.listings[0]).toMatchObject({ title: "Chambre 0", url: "https://example.org/annonce/0", total: 700, status: "EXCLUDED" });
    expect(JSON.stringify(page).length).toBeLessThan(20_000);
    expect((await listListingLines(own.id, { offset: 50 })).listings).toHaveLength(10);
    expect((await listListingLines(own.id, { status: "excluded" })).count).toBe(5);
    expect((await listListingLines(own.id, { status: "open" })).count).toBe(55);

    const list = (await handleMcpPayload({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} })) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_listings", "get_listing"]));
    const call = (await handleMcpPayload({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_listings", arguments: { moveId: own.id, limit: 10 } } })) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    expect(call.result.isError).toBeFalsy();
    const body = JSON.parse(call.result.content[0].text) as { count: number; listings: { id: string; link: string }[]; nextOffset: number };
    expect(body.count).toBe(60);
    expect(body.listings).toHaveLength(10);
    expect(body.nextOffset).toBe(10);
    expect(body.listings[0].link).toContain(`/moves/${own.id}?tab=housing&listing=${body.listings[0].id}`);

    const upsert = (await handleMcpPayload({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "upsert_housing_listing", arguments: { moveId: own.id, title: "Autre titre", url: "https://example.org/annonce/7", rent: 650, status: "SHORTLISTED" } },
    })) as { result: { content: { text: string }[] } };
    const r = JSON.parse(upsert.result.content[0].text) as { created: boolean; updated: string[]; kept: string[]; title: string };
    expect(r).toMatchObject({ created: false, title: "Chambre 7" });
    expect(r.updated).toEqual(expect.arrayContaining(["rent", "status"]));
    expect(r.kept).toEqual(["title"]);

    // A listing the user pointed at (listingId): the fields given apply, e.g. a visit moved to another day.
    const seven = page.listings.find((l) => l.title === "Chambre 7")!;
    for (const visitDate of ["2026-12-12", "2026-12-15"]) {
      await handleMcpPayload({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "upsert_housing_listing", arguments: { moveId: own.id, listingId: seven.id, title: "Chambre 7", visitDate } } });
    }
    const lines = await listListingLines(own.id, { status: "open" });
    expect(lines.listings.find((l) => l.id === seven.id)?.status).toBe("VISIT_PLANNED");
    const { getListing } = await import("@/server/services/moves");
    expect((await getListing(seven.id)).visitDate).toBe("2026-12-15");
    expect(lines.listings[0].savings).not.toBeNull();
  });
});
