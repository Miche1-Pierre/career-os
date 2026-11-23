import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import { formKey, parseChatForm } from "@/lib/chat-forms";
import { searchAll } from "@/server/services/search";

describe("forms in the chat", () => {
  it("reads the ```careeros-form blocks written by Claude", () => {
    const spec = parseChatForm('{"form":"search","domain":"JOBS","criteria":{"keywords":["AI engineer"],"locations":["Bruxelles"]}}');
    expect(spec).toEqual({ form: "search", domain: "JOBS", criteria: { keywords: ["AI engineer"], locations: ["Bruxelles"] }, moveId: null, useAgent: undefined });
    expect(parseChatForm('{"form":"search","domain":"HOUSING","moveId":"m1"}')).toMatchObject({ domain: "HOUSING", moveId: "m1", criteria: {} });
    // While the block streams, or when it is something else, nothing is shown.
    expect(parseChatForm('{"form":"search","domain":"JO')).toBeNull();
    expect(parseChatForm('{"form":"delete-everything"}')).toBeNull();
    expect(parseChatForm('{"form":"search","domain":"CARS"}')).toBeNull();
  });

  it("keys a form by its content (stable across reloads)", () => {
    const a = parseChatForm('{"form":"search","domain":"JOBS","criteria":{"keywords":["FDE"]}}')!;
    const b = parseChatForm('{"form":"search","domain":"JOBS","criteria":{"keywords":["FDE"]}}')!;
    const c = parseChatForm('{"form":"search","domain":"JOBS","criteria":{"keywords":["PM"]}}')!;
    expect(formKey(a)).toBe(formKey(b));
    expect(formKey(a)).not.toBe(formKey(c));
  });
});

describe("@ mentions (database)", () => {
  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
  });

  it("finds CVs so they can be cited in the chat", async () => {
    const { importCvSeed } = await import("@/server/services/cv");
    await importCvSeed(
      {
        entries: [],
        variants: [{ key: "ai-fr", name: "AI Product (FR)", lang: "fr", header: { name: "Camille MARTIN", title: "AI", lines: [], links: [] }, sections: [] }],
      },
      USER,
    );
    const hits = await searchAll("ai product");
    expect(hits.find((h) => h.type === "cv")).toMatchObject({ title: "AI Product (FR)", subtitle: "CV · FR" });
  });
});
