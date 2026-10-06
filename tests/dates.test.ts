import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addDays,
  addMonths,
  coerceISODate,
  countBusinessDaysBetween,
  diffDays,
  dueStatus,
  easterSunday,
  frenchHolidays,
  instantToZonedParts,
  isBusinessDay,
  isISODate,
  monthGrid,
  nextBusinessDay,
  startOfWeek,
  todayISO,
  zonedTimeToInstant,
} from "@/lib/dates";

const FR = { holidays: "FR" as const };

describe("calendar arithmetic", () => {
  it("validates ISO dates strictly", () => {
    expect(isISODate("2026-09-29")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("29/09/2026")).toBe(false);
  });

  it("adds days across months, years and leap years", () => {
    expect(addDays("2026-09-29", 7)).toBe("2026-10-06");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is not affected by daylight-saving changes", () => {
    // Europe switches to winter time on 2026-10-25: calendar math must still give exactly one day.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(diffDays("2026-10-26", "2026-10-24")).toBe(2);
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
  });

  it("adds months clamping the day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-09-29", -9)).toBe("2025-12-29");
  });

  it("computes differences and due status", () => {
    expect(diffDays("2026-10-06", "2026-09-29")).toBe(7);
    expect(dueStatus("2026-09-27", "2026-09-29")).toMatchObject({ kind: "overdue", days: -2, label: "Overdue by 2 days" });
    expect(dueStatus("2026-09-29", "2026-09-29").kind).toBe("today");
    expect(dueStatus("2026-09-30", "2026-09-29").kind).toBe("tomorrow");
    expect(dueStatus("2026-10-02", "2026-09-29")).toMatchObject({ kind: "soon", label: "In 3 days" });
    expect(dueStatus("2026-10-06", "2026-09-29").kind).toBe("week");
    expect(dueStatus("2026-11-06", "2026-09-29").kind).toBe("later");
  });

  it("builds month grids starting on Monday", () => {
    const grid = monthGrid("2026-09-15", 1);
    expect(grid[0][0]).toBe("2026-08-31");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(startOfWeek("2026-09-29", 1)).toBe("2026-09-28");
  });
});

describe("business days & French public holidays", () => {
  it("computes Easter correctly", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("lists French holidays (fixed + Easter based)", () => {
    const h = frenchHolidays(2026);
    expect(h).toContain("2026-04-06"); // Easter Monday
    expect(h).toContain("2026-05-14"); // Ascension
    expect(h).toContain("2026-05-25"); // Whit Monday
    expect(h).toContain("2026-07-14");
    expect(h).toHaveLength(11);
  });

  it("skips weekends", () => {
    expect(isBusinessDay("2026-10-03", FR)).toBe(false); // Saturday
    expect(addBusinessDays("2026-10-02", 1, FR)).toBe("2026-10-05"); // Fri → Mon
    expect(addBusinessDays("2026-09-29", 7, FR)).toBe("2026-10-08");
  });

  it("skips public holidays", () => {
    // Thursday 7 May 2026 + 1 business day: Friday 8 May is a holiday → Monday 11 May.
    expect(addBusinessDays("2026-05-07", 1, FR)).toBe("2026-05-11");
    // Without a holiday calendar the Friday counts.
    expect(addBusinessDays("2026-05-07", 1, { holidays: "NONE" })).toBe("2026-05-08");
    expect(nextBusinessDay("2026-12-25", FR)).toBe("2026-12-28");
    expect(countBusinessDaysBetween("2026-12-24", "2027-01-04", FR)).toBe(5);
  });

  it("returns the same day for zero business days", () => {
    expect(addBusinessDays("2026-10-03", 0, FR)).toBe("2026-10-03");
  });
});

describe("timezones", () => {
  it("computes today in the user's timezone, not UTC", () => {
    const lateEvening = new Date("2026-09-29T22:30:00Z"); // 00:30 in Paris (UTC+2)
    expect(todayISO("Europe/Paris", lateEvening)).toBe("2026-09-30");
    expect(todayISO("UTC", lateEvening)).toBe("2026-09-29");
    expect(todayISO("America/New_York", lateEvening)).toBe("2026-09-29");
  });

  it("converts wall-clock interview times with DST", () => {
    expect(zonedTimeToInstant("2026-10-06", "10:30", "Europe/Paris").toISOString()).toBe("2026-10-06T08:30:00.000Z"); // CEST
    expect(zonedTimeToInstant("2026-10-26", "10:30", "Europe/Paris").toISOString()).toBe("2026-10-26T09:30:00.000Z"); // CET
    expect(instantToZonedParts(new Date("2026-10-06T08:30:00Z"), "Europe/Paris")).toEqual({ date: "2026-10-06", time: "10:30" });
  });

  it("coerces user and AI provided dates", () => {
    expect(coerceISODate("2026-10-15")).toBe("2026-10-15");
    expect(coerceISODate("15/10/2026")).toBe("2026-10-15");
    expect(coerceISODate("1/2/2027")).toBe("2027-02-01");
    expect(coerceISODate("2026-10-15T23:30:00Z", "Europe/Paris")).toBe("2026-10-16");
    expect(coerceISODate("2026-10-15T09:00:00")).toBe("2026-10-15");
    expect(coerceISODate("31/02/2026")).toBeNull();
    expect(coerceISODate("next tuesday")).toBeNull();
    expect(coerceISODate("")).toBeNull();
  });
});
