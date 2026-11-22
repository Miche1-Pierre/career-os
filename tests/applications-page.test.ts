import { describe, expect, it } from "vitest";
import { parseListFilters } from "@/lib/filters";
import {
  applicationsHref,
  boardRedirectHref,
  defaultSort,
  isViewDirty,
  nextActionOf,
  parseLayout,
  relativeDayFr,
  resolveFilters,
  sameFilters,
} from "@/components/opportunities/applications-params";

const view = { id: "v1", name: "International", filters: { countries: ["Suisse", "Belgique"], includeClosed: false } };
const TODAY = "2026-11-22";
const row = (over: Partial<Parameters<typeof nextActionOf>[0]> = {}) => ({
  stage: { category: "APPLIED" as const },
  deadline: null,
  deadlineTime: null,
  nextFollowUpAt: null,
  followUpPaused: false,
  expectedResponseAt: null,
  ...over,
});

describe("Candidatures page — layout", () => {
  it("defaults to the list; ?layout=board shows the board", () => {
    expect(parseLayout({})).toBe("list");
    expect(parseLayout({ layout: "board" })).toBe("board");
    expect(parseLayout({ layout: "nope" })).toBe("list");
    expect(defaultSort("list")).toBe("updated");
    expect(defaultSort("board")).toBe("priority");
  });

  it("switching layout keeps the filters and the view", () => {
    const filters = { family: "JOB" as const, tags: ["HealthTech"] };
    expect(applicationsHref({ filters, layout: "board" })).toBe("/applications?family=JOB&tags=HealthTech&layout=board");
    expect(applicationsHref({ filters, layout: "list" })).toBe("/applications?family=JOB&tags=HealthTech");
    expect(applicationsHref({ filters: view.filters, layout: "board", view })).toBe("/applications?view=v1&layout=board");
  });

  it("redirects the old board URL, keeping every other parameter", () => {
    expect(boardRedirectHref({})).toBe("/applications?layout=board");
    const href = boardRedirectHref({ tags: "a,b", family: "EDUCATION", view: "v1", layout: "list" });
    const params = new URL(href, "http://x").searchParams;
    expect(params.get("layout")).toBe("board");
    expect(params.get("view")).toBe("v1");
    expect(parseListFilters(params)).toMatchObject({ tags: ["a", "b"], family: "EDUCATION" });
  });
});

describe("Candidatures page — saved views", () => {
  it("?view=<id> alone applies the view's saved filters", () => {
    expect(resolveFilters({ view: "v1" }, view)).toEqual(view.filters);
  });

  it("filters in the URL win over the view, so removing one of its filters really removes it", () => {
    expect(resolveFilters({ view: "v1", countries: "Suisse" }, view)).toMatchObject({ countries: ["Suisse"], includeClosed: undefined });
    expect(resolveFilters({ view: "v1", custom: "1" }, view)).toMatchObject({ countries: undefined, includeClosed: undefined });
  });

  it("writes custom=1 only when the filters differ from the view", () => {
    expect(applicationsHref({ filters: { countries: ["Belgique", "Suisse"], includeClosed: false }, view })).toBe("/applications?view=v1");
    expect(applicationsHref({ filters: {}, view })).toBe("/applications?view=v1&custom=1");
    const edited = applicationsHref({ filters: { countries: ["Suisse"] }, view });
    expect(edited).toBe("/applications?countries=Suisse&view=v1&custom=1");
    // Round trip: the page reads back exactly what the toolbar wrote.
    const sp = Object.fromEntries(new URL(edited, "http://x").searchParams);
    expect(resolveFilters(sp, view)).toMatchObject({ countries: ["Suisse"] });
  });

  it("detects unsaved changes (array order and 'show closed' default don't count, archived is never saved)", () => {
    expect(sameFilters({ tags: ["a", "b"] }, { tags: ["b", "a"] })).toBe(true);
    expect(sameFilters({ includeClosed: true }, {})).toBe(true);
    expect(sameFilters({ tags: [] }, {})).toBe(true);
    expect(isViewDirty({ countries: ["Belgique", "Suisse"], includeClosed: false, archived: true }, view)).toBe(false);
    expect(isViewDirty({ countries: ["Suisse"], includeClosed: false }, view)).toBe(true);
    expect(isViewDirty({ q: "anything" }, null)).toBe(false);
  });
});

describe("Candidatures page — next action chip", () => {
  it("shows the deadline before applying, then the follow-up, then the expected answer", () => {
    expect(nextActionOf(row({ stage: { category: "TO_APPLY" }, deadline: "2026-11-23", deadlineTime: "12:00", nextFollowUpAt: "2026-11-24" }), TODAY, "fr-FR")).toMatchObject({ kind: "DEADLINE", text: "Date limite demain", time: "12:00", tone: "tomorrow" });
    expect(nextActionOf(row({ deadline: "2026-11-23", nextFollowUpAt: "2026-11-25" }), TODAY, "fr-FR")).toMatchObject({ kind: "FOLLOW_UP", text: "Relance dans 3 jours", time: null });
    expect(nextActionOf(row({ nextFollowUpAt: "2026-11-25", followUpPaused: true, expectedResponseAt: "2026-11-22" }), TODAY, "fr-FR")).toMatchObject({ kind: "ANSWER", text: "Réponse attendue aujourd’hui" });
    expect(nextActionOf(row({ stage: { category: "LOST" }, nextFollowUpAt: "2026-11-25", expectedResponseAt: "2026-11-25" }), TODAY, "fr-FR")).toBeNull();
  });

  it("words overdue and distant dates in French", () => {
    expect(nextActionOf(row({ nextFollowUpAt: "2026-11-21" }), TODAY, "fr-FR")?.text).toBe("Relance en retard de 1 jour");
    expect(nextActionOf(row({ stage: { category: "PREPARING" }, deadline: "2026-11-19" }), TODAY, "fr-FR")).toMatchObject({ text: "Date limite dépassée de 3 jours", tone: "overdue" });
    expect(nextActionOf(row({ expectedResponseAt: "2026-11-12" }), TODAY, "fr-FR")?.text).toBe("Réponse attendue depuis 10 jours");
    expect(nextActionOf(row({ nextFollowUpAt: "2026-12-15" }), TODAY, "fr-FR")?.text).toMatch(/^Relance le 15 déc/);
  });

  it("relative days", () => {
    expect([0, 1, -1, 4, -6].map(relativeDayFr)).toEqual(["Aujourd’hui", "Demain", "Hier", "Dans 4 jours", "Il y a 6 jours"]);
  });
});
