import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import { moveFromOffer, offerFromTerms, reviewChecklist, reviewProgress, REVIEW_ITEMS, type ContractAnalysis } from "@/lib/offer";
import { changeStatus, createOpportunity, getOpportunity, updateOpportunity } from "@/server/services/opportunities";
import { saveContractAnalysis, updateOffer, verifyContractAnalysis } from "@/server/services/offers";
import { createMoveFromOpportunity, getMove, updateMove, upsertListing, setListingStatus } from "@/server/services/moves";
import { getToday } from "@/server/services/today";
import { handleMcpPayload } from "@/server/mcp/server";

const CONTRACT = `CONVENTION D'IMMERSION PROFESSIONNELLE
Article 2. La convention prend cours le 4 janvier 2027 et se termine le 2 juillet 2027.
Article 4. Le stagiaire preste 38 heures par semaine au 16 rue de la Loi, 1000 Bruxelles.
Article 6. L'entreprise verse une indemnité mensuelle de 1.800 euros nets ainsi que des chèques-repas d'une valeur de 10 euros par jour presté.
Article 9. Il peut être mis fin à la convention d'un commun accord, sans préavis.
Article 11. Les absences ne sont pas rémunérées.`;

function analysis(overrides: Partial<ContractAnalysis> = {}): ContractAnalysis {
  const term = (value: string | null, evidence: string | null, article: string | null = null) => ({ value, evidence, article });
  return {
    summary: "Convention de six mois, 38 h par semaine, indemnité nette de 1 800 €.",
    contractLabel: "Convention d'immersion professionnelle",
    terms: {
      startDate: term("2027-01-04", "La convention prend cours le 4 janvier 2027", "Art. 2"),
      endDate: term("2027-07-02", "se termine le 2 juillet 2027", "Art. 2"),
      hoursPerWeek: term("38", "Le stagiaire preste 38 heures par semaine", "Art. 4"),
      salaryGross: term(null, null),
      salaryNet: term("1.800", "une indemnité mensuelle de 1.800 euros nets", "Art. 6"),
      trialPeriod: term(null, null),
      noticePeriod: term("Sans préavis, fin d'un commun accord", "d'un commun accord, sans préavis", "Art. 9"),
      paidLeave: term("25 jours", "vingt-cinq jours de congés payés par an", "Art. 12"), // not in the text
      workAddress: term("16 rue de la Loi, 1000 Bruxelles", "au 16 rue de la Loi, 1000 Bruxelles", "Art. 4"),
      remote: term(null, null),
      mealVoucherPerDay: term("10", "chèques-repas d'une valeur de 10 euros par jour presté", "Art. 6"),
    },
    checklist: [
      { key: "notice", status: "WARN", note: "Aucun préavis de ton côté (art. 9).", article: "Art. 9" },
      { key: "leave", status: "WARN", note: "Absences non rémunérées (art. 11).", article: "Art. 11" },
      { key: "dates", status: "OK", note: "Du 4 janvier au 2 juillet 2027.", article: "Art. 2" },
    ],
    unfavorable: [
      { title: "Absences non payées", detail: "Toute absence est retenue.", article: "Art. 11", evidence: "Les absences ne sont pas rémunérées", severity: "MEDIUM" },
      { title: "Clause inventée", detail: "Non présente.", article: "Art. 20", evidence: "Le stagiaire cède tous ses droits pour cent ans", severity: "HIGH" },
    ],
    missing: [{ topic: "Propriété intellectuelle", detail: "Rien n'est prévu." }],
    inconsistencies: [],
    questions: ["Comment fonctionnent les congés ?"],
    emailDraft: "Bonjour,\n\nJ'aurais deux questions…",
    legalNotes: [],
    caveats: [],
    ...overrides,
  };
}

describe("offer logic", () => {
  it("lists every review item, with what was stored", () => {
    const list = reviewChecklist([{ key: "notice", status: "WARN", note: "Pas de préavis", source: "AI" }]);
    expect(list).toHaveLength(REVIEW_ITEMS.length);
    expect(list.find((i) => i.key === "notice")).toMatchObject({ status: "WARN", note: "Pas de préavis", source: "AI" });
    expect(list.find((i) => i.key === "ip")?.status).toBe("TODO");
    expect(reviewProgress([{ key: "notice", status: "WARN", source: "AI" }, { key: "dates", status: "OK", source: "USER" }])).toEqual({ done: 2, total: REVIEW_ITEMS.length, warnings: 1 });
  });

  it("turns contract terms into offer fields", () => {
    const terms = analysis().terms;
    expect(offerFromTerms(terms)).toEqual({
      startDate: "2027-01-04",
      endDate: "2027-07-02",
      hoursPerWeek: 38,
      salaryNet: 1800, // "1.800" is a thousands separator
      mealVoucherPerDay: 10,
      noticePeriod: "Sans préavis, fin d'un commun accord",
      paidLeave: "25 jours",
      workAddress: "16 rue de la Loi, 1000 Bruxelles",
    });
    expect(offerFromTerms({ hoursPerWeek: { value: "37,5 h" } })).toEqual({ hoursPerWeek: 37.5 });
    expect(offerFromTerms(terms, ["paidLeave", "salaryNet"])).not.toHaveProperty("paidLeave");
  });

  it("pre-fills only the empty fields of a move", () => {
    const offer = { startDate: "2027-01-04", endDate: "2027-07-02", workAddress: "16 rue de la Loi", salaryNet: 1800, period: "MONTH" as const, mealVoucherPerDay: 10 };
    expect(moveFromOffer(offer)).toEqual({ arrivalDate: "2027-01-04", departureDate: "2027-07-02", workAddress: "16 rue de la Loi", budget: { income: 1800, incomeNote: "Net mensuel de l’offre", foodAllowance: 200 } });
    // Income typed by hand (1 500) and dates already set: untouched.
    expect(moveFromOffer(offer, { arrivalDate: "2027-01-03", budget: { income: 1500, foodAllowance: 0 } })).toEqual({ departureDate: "2027-07-02", workAddress: "16 rue de la Loi", budget: { foodAllowance: 200 } });
    expect(moveFromOffer({ salaryNet: 40000, period: "YEAR" })).toEqual({});
  });

  it("does not trust quotes that are not in the contract", () => {
    const v = verifyContractAnalysis(analysis(), CONTRACT);
    expect(v.unverifiedTerms).toEqual(["paidLeave"]);
    expect(v.unfavorable.map((u) => u.verified)).toEqual([true, false]);
  });
});

describe("offer and contract (database)", () => {
  let oppId: string;

  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
    const { opportunity } = await createOpportunity({ type: "INTERNSHIP", title: "AI Transformation Intern", organizationName: "Acme", locationCity: "Bruxelles", locationCountry: "Belgique" }, USER);
    oppId = opportunity!.id;
    await changeStatus(oppId, { status: "OFFER" }, USER);
  });

  it("stores the offer apart from the posting details", async () => {
    await updateOffer(oppId, { contractType: "INTERNSHIP", salaryNet: 1500, period: "MONTH", currency: "EUR", decisionDeadline: "2026-11-25", reviewChecklist: [{ key: "pay", status: "OK", note: "Vérifié par mail", source: "USER" }] }, USER);
    // Editing the posting keeps the offer.
    await updateOpportunity(oppId, { details: { seniority: "Stagiaire" } }, USER);
    const opp = await getOpportunity(oppId);
    expect(opp.details.seniority).toBe("Stagiaire");
    expect(opp.offer).toMatchObject({ salaryNet: 1500, period: "MONTH", decisionDeadline: "2026-11-25" });
  });

  it("saves a contract analysis: verified terms fill the empty fields, the user's checklist wins", async () => {
    await updateOffer(oppId, { reviewChecklist: [{ key: "notice", status: "OK", note: "Accepté", source: "USER" }] }, USER);
    const result = await saveContractAnalysis(oppId, analysis(), USER, { by: "AI", model: "opus", contractText: CONTRACT });
    expect(result.filled.sort()).toEqual(["contractLabel", "endDate", "hoursPerWeek", "mealVoucherPerDay", "noticePeriod", "startDate", "workAddress"]);
    const offer = (await getOpportunity(oppId)).offer!;
    expect(offer.salaryNet).toBe(1500); // typed by hand, kept
    expect(offer.paidLeave).toBeUndefined(); // quote not found in the contract
    expect(offer.contractAnalysis?.unverifiedTerms).toEqual(["paidLeave"]);
    const list = reviewChecklist(offer.reviewChecklist);
    expect(list.find((i) => i.key === "notice")).toMatchObject({ status: "OK", source: "USER" });
    expect(list.find((i) => i.key === "leave")).toMatchObject({ status: "WARN", source: "AI", article: "Art. 11" });
    expect(list.find((i) => i.key === "pay")).toMatchObject({ status: "OK", note: "Vérifié par mail" });
  });

  it("creates the move from the offer, then only fills what is still empty", async () => {
    const move = await createMoveFromOpportunity(oppId, USER);
    expect(move).toMatchObject({ arrivalDate: "2027-01-04", departureDate: "2027-07-02", workAddress: "16 rue de la Loi, 1000 Bruxelles" });
    let view = await getMove(move.id);
    expect(view.budgetPlan.income).toBe(1500);
    expect(view.budgetPlan.foodAllowance).toBe(200);
    await updateMove(move.id, { arrivalDate: "2027-01-03" }, USER);
    await updateOffer(oppId, { startDate: "2027-01-05" }, USER);
    await createMoveFromOpportunity(oppId, USER);
    view = await getMove(move.id);
    expect(view.arrivalDate).toBe("2027-01-03"); // set by hand, kept
  });

  it("shows the offer, housing actions and the move on Today", async () => {
    const move = (await createMoveFromOpportunity(oppId, USER)).id;
    const { listing } = await upsertListing({ moveId: move, title: "Coloc Saint-Gilles", rent: 650, furnished: "YES" }, USER);
    await setListingStatus(listing.id, "SHORTLISTED", USER);
    const today = await getToday({ horizonDays: 7 });
    const all = [...today.overdue, ...today.dueToday, ...today.upcoming];
    expect(all.find((i) => i.kind === "OFFER")).toMatchObject({ title: "Répondre à l’offre — Acme", href: `/applications/${oppId}?tab=offer` });
    expect(all.find((i) => i.kind === "HOUSING")?.title).toMatch(/1 logement à contacter/);
    expect(today.moves[0]).toMatchObject({ id: move, toContact: 1 });
    expect(today.counts.housing).toBe(1);
  });

  it("exposes the offer tools over MCP", async () => {
    const list = (await handleMcpPayload({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["update_offer", "get_contract_text", "save_contract_analysis"]));
  });
});
