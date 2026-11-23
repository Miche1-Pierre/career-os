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
import { createMoveFromOpportunity, draftListingMessage, exportListingsCsv, getMove, setListingStatus, updateBudget, updateListing, updateMove, upsertListing } from "@/server/services/moves";
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
    { id: "judo", label: "Judo", amount: 50, kind: "EXPENSE" },
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
    // Avenue Louise 106 → Rue Jourdan 155 (Saint-Gilles): ≈ 0.7 km.
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
    const fr = draftFirstMessage(base, { language: "fr", firstName: "Pierre", city: "Bruxelles", arrivalDate: "2027-01-04", departureDate: "2027-07-02", reason: "un stage" });
    expect(fr.body).toContain("du 4 janvier 2027 au 2 juillet 2027");
    expect(fr.questions.some((q) => q.includes("garantie"))).toBe(true);
    expect(fr.questions.some((q) => q.includes("charges"))).toBe(false);
    expect(fr.body.endsWith("Pierre")).toBe(true);
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
    const { opportunity } = await createOpportunity({ type: "INTERNSHIP", title: "AI Transformation Intern", organizationName: "BlackFin", locationCity: "Bruxelles", locationCountry: "Belgique" }, USER);
    await changeStatus(opportunity!.id, { status: "OFFER" }, USER);
    const m = await createMoveFromOpportunity(opportunity!.id, USER);
    expect(m.title).toBe("BlackFin · Bruxelles");
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
    const q = geocodeCandidates("Avenue Louise 106, 1050 Ixelles", "Bruxelles", "Belgique");
    expect(q[0]).toBe("Avenue Louise 106, 1050 Ixelles, Bruxelles, Belgique");
    expect(q).toContain("Avenue Louise 106, 1050");
    expect(q).toContain("Avenue Louise 106, Bruxelles");
  });
});

describe("relocation data in backups", () => {
  it("exports moves and listings", async () => {
    const { exportAll } = await import("@/server/services/data-transfer");
    const file = await exportAll();
    expect(file.schemaVersion).toBe(4);
    expect(file.counts.moves).toBe(1);
    expect(file.counts.housingListings).toBe(3);
  });
});
