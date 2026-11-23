import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureLibraryFolders, libraryStatus } from "@/server/storage";

const previous = process.env.DOCUMENTS_ROOT;
afterEach(() => {
  if (previous === undefined) delete process.env.DOCUMENTS_ROOT;
  else process.env.DOCUMENTS_ROOT = previous;
});

describe("documents library on first start", () => {
  it("creates the missing library and its sub-folders, and leaves existing files alone", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-library-"));
    const root = path.join(base, "Documents", "CareerOS");
    process.env.DOCUMENTS_ROOT = root;

    expect(await ensureLibraryFolders(["CV", "Cover Letters"])).toBe(true);
    expect(fs.statSync(path.join(root, "CV")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(root, "Cover Letters")).isDirectory()).toBe(true);
    expect(await libraryStatus()).toMatchObject({ exists: true, writable: true });

    fs.writeFileSync(path.join(root, "CV", "mon-cv.pdf"), "pdf");
    expect(await ensureLibraryFolders(["CV"])).toBe(true);
    expect(fs.readFileSync(path.join(root, "CV", "mon-cv.pdf"), "utf8")).toBe("pdf");
  });

  it("reports failure instead of throwing when the folder cannot be created", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-library-"));
    const file = path.join(base, "not-a-folder");
    fs.writeFileSync(file, "x");
    process.env.DOCUMENTS_ROOT = path.join(file, "CareerOS");
    expect(await ensureLibraryFolders(["CV"])).toBe(false);
  });
});
