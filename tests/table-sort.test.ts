import { describe, expect, it } from "vitest";
import { ariaSort, nextSort, sortRows } from "@/lib/table-sort";

describe("nextSort (click on a column header)", () => {
  it("cycles natural direction → reverse → default order", () => {
    const first = nextSort(null, "total");
    expect(first).toEqual({ key: "total", dir: "asc" });
    const second = nextSort(first, "total");
    expect(second).toEqual({ key: "total", dir: "desc" });
    expect(nextSort(second, "total")).toBeNull();
  });

  it("starts descending for columns whose natural direction is descending", () => {
    const first = nextSort(null, "savings", "desc");
    expect(first).toEqual({ key: "savings", dir: "desc" });
    expect(nextSort(first, "savings", "desc")).toEqual({ key: "savings", dir: "asc" });
    expect(nextSort({ key: "savings", dir: "asc" }, "savings", "desc")).toBeNull();
  });

  it("a click on another column starts that column over", () => {
    expect(nextSort({ key: "total", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
  });

  it("only the sorted column carries aria-sort", () => {
    expect(ariaSort({ key: "total", dir: "asc" }, "total")).toBe("ascending");
    expect(ariaSort({ key: "total", dir: "desc" }, "total")).toBe("descending");
    expect(ariaSort({ key: "total", dir: "asc" }, "title")).toBeUndefined();
    expect(ariaSort(null, "title")).toBeUndefined();
  });
});

describe("sortRows", () => {
  const rows = [
    { id: "a", total: 810, title: "Studio Été", date: "2027-01-16" },
    { id: "b", total: null, title: "studio ete", date: null },
    { id: "c", total: 690, title: "Studio 10 m²", date: "2026-12-31" },
    { id: "d", total: 810, title: "Studio 9 m²", date: "" },
    { id: "e", total: 740, title: "Appartement", date: "2026-12-16" },
  ];
  const ids = (list: typeof rows) => list.map((r) => r.id).join("");

  it("sorts numbers both ways and keeps empty values last", () => {
    expect(ids(sortRows(rows, (r) => r.total, "asc"))).toBe("ceadb");
    expect(ids(sortRows(rows, (r) => r.total, "desc"))).toBe("adecb");
  });

  it("is stable: equal values keep their incoming order in both directions", () => {
    expect(ids(sortRows(rows, (r) => r.total, "desc")).slice(0, 2)).toBe("ad");
    expect(ids(sortRows(rows, (r) => r.total, "asc")).slice(2, 4)).toBe("ad");
  });

  it("compares text the French way: accents and case ignored, numbers as numbers", () => {
    expect(ids(sortRows(rows, (r) => r.title, "asc"))).toBe("edcab");
  });

  it("treats empty strings like missing values and sorts ISO dates chronologically", () => {
    expect(ids(sortRows(rows, (r) => r.date, "asc"))).toBe("ecabd");
    expect(ids(sortRows(rows, (r) => r.date, "desc"))).toBe("acebd");
  });

  it("handles dates, booleans and NaN", () => {
    const list = [
      { id: "x", at: new Date("2026-11-20"), ok: true, n: Number.NaN },
      { id: "y", at: new Date("invalid"), ok: false, n: 2 },
      { id: "z", at: new Date("2026-11-25"), ok: true, n: 1 },
    ];
    expect(sortRows(list, (r) => r.at, "desc").map((r) => r.id)).toEqual(["z", "x", "y"]);
    expect(sortRows(list, (r) => r.ok, "desc").map((r) => r.id)).toEqual(["x", "z", "y"]);
    expect(sortRows(list, (r) => r.n, "asc").map((r) => r.id)).toEqual(["z", "y", "x"]);
  });

  it("does not modify the input", () => {
    const copy = [...rows];
    sortRows(rows, (r) => r.total, "asc");
    expect(rows).toEqual(copy);
  });
});
