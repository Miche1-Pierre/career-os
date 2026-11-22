import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { groupOrganizations, isLocationSuffix, locationsLabel, registrableDomain, siblingOrganizations, websiteDomain, websiteHost } from "@/lib/org-grouping";
import { fetchImage, getLogo, getSvglLogo, imageWidth, isSafeSvg, logoSources, sniffImageType, type LogoDeps } from "@/server/services/logos";
import { buildCvProposal, cvProfileExtractionSchema, foundInText, yearsStatedInText, type CvProfileExtraction } from "@/server/services/profile-import";
import { applyCvChoices, countProfileChanges, initialCvChoices, type CvProposal } from "@/lib/cv-import";
import { profileSchema, type Profile } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Website domain resolution (logos + grouping)
// ---------------------------------------------------------------------------

describe("website domain resolution", () => {
  it("extracts the host, with or without scheme, without www", () => {
    expect(websiteHost("https://www.alten.com/careers")).toBe("alten.com");
    expect(websiteHost("alten.fr")).toBe("alten.fr");
    expect(websiteHost("  HTTP://Careers.Alten.COM/  ")).toBe("careers.alten.com");
    expect(websiteHost("https://www2.example.org")).toBe("example.org");
    expect(websiteHost("https://café.fr")).toBe("xn--caf-dma.fr");
  });

  it("refuses missing, private, invalid and non-http websites", () => {
    for (const bad of [null, undefined, "", "   ", "localhost", "http://localhost:3000", "http://127.0.0.1", "http://192.168.1.10/logo", "http://[::1]/", "intranet", "ftp://alten.com", "mailto:jobs@alten.com", "https://user:pass@alten.com", "http://server.local", "http://app.internal", "not a url at all"]) {
      expect(websiteHost(bad), String(bad)).toBeNull();
    }
  });

  it("ignores job boards, ATS and shared platforms (they say nothing about the organization)", () => {
    for (const board of ["https://www.linkedin.com/company/alten", "https://www.welcometothejungle.com/fr/companies/zefir", "https://jobs.lever.co/zefir", "https://alten.teamtailor.com/jobs", "https://careers.smartrecruiters.com/Alten", "https://sites.google.com/view/mylab", "https://www.civiweb.com/FR/offre/1.aspx"]) {
      expect(websiteHost(board), board).toBeNull();
    }
  });

  it("computes the registrable domain with multi-part suffixes", () => {
    expect(registrableDomain("careers.alten.com")).toBe("alten.com");
    expect(registrableDomain("www.ox.ac.uk")).toBe("ox.ac.uk");
    expect(registrableDomain("jobs.alten.co.uk")).toBe("alten.co.uk");
    expect(registrableDomain("enseignementsup-recherche.gouv.fr")).toBe("enseignementsup-recherche.gouv.fr");
    expect(registrableDomain("mylab.github.io")).toBe("mylab.github.io");
    expect(registrableDomain("alten.com")).toBe("alten.com");
    expect(websiteDomain("https://inf.ethz.ch/")).toBe("ethz.ch");
  });
});

// ---------------------------------------------------------------------------
// Brand grouping
// ---------------------------------------------------------------------------

let seq = 0;
const org = (name: string, extra: { website?: string | null; city?: string | null; country?: string | null } = {}) => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  name,
  website: extra.website ?? null,
  city: extra.city ?? null,
  country: extra.country ?? null,
});
const names = (groups: ReturnType<typeof groupOrganizations>) => groups.map((g) => [g.name, g.members.map((m) => m.name)]);

describe("organization grouping by brand", () => {
  it("groups a brand with its location entities, the brand entity first", () => {
    const groups = groupOrganizations([org("Alten Canada", { country: "Canada" }), org("Alten"), org("Alten Chine", { country: "Chine" }), org("Zefir")]);
    expect(names(groups)).toEqual([
      ["Alten", ["Alten", "Alten Canada", "Alten Chine"]],
      ["Zefir", ["Zefir"]],
    ]);
    expect(groups[0].reasons).toContain("name");
  });

  it("groups location entities sharing the same brand even without the brand entity", () => {
    const groups = groupOrganizations([org("Alten Canada"), org("Alten Chine"), org("ALTEN Sud-Ouest")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Alten"); // spelling of the first member in canonical order
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].reasons).toContain("brand");
  });

  it("understands separators, legal suffixes, regions, multi-word places and glue words", () => {
    const groups = groupOrganizations([org("Capgemini Engineering"), org("Capgemini Engineering - Île-de-France"), org("Capgemini Engineering (United Kingdom) Ltd"), org("Institut Pasteur"), org("Institut Pasteur de Lille"), org("Zefir SAS"), org("Zefir")]);
    expect(names(groups)).toEqual([
      ["Capgemini Engineering", ["Capgemini Engineering", "Capgemini Engineering - Île-de-France", "Capgemini Engineering (United Kingdom) Ltd"]],
      ["Institut Pasteur", ["Institut Pasteur", "Institut Pasteur de Lille"]],
      ["Zefir", ["Zefir", "Zefir SAS"]],
    ]);
  });

  it("uses the organization's own city and country as location words", () => {
    expect(groupOrganizations([org("Acme"), org("Acme Kourou")])).toHaveLength(2);
    expect(groupOrganizations([org("Acme"), org("Acme Kourou", { city: "Kourou", country: "Guyane" })])).toHaveLength(1);
  });

  it("groups by website domain, but never through job boards", () => {
    const groups = groupOrganizations([org("Capgemini", { website: "https://www.capgemini.com" }), org("Capgemini Invent", { website: "capgemini.com/fr-fr/invent" }), org("Sopra Steria", { website: "https://www.linkedin.com/company/soprasteria" }), org("Thales", { website: "https://www.linkedin.com/company/thales" })]);
    expect(names(groups)).toEqual([
      ["Capgemini", ["Capgemini", "Capgemini Invent"]],
      ["Sopra Steria", ["Sopra Steria"]],
      ["Thales", ["Thales"]],
    ]);
    expect(groups[0].reasons).toEqual(["domain"]);
  });

  it("does not merge different organizations that share a generic or short prefix", () => {
    const groups = groupOrganizations([
      org("Air France"),
      org("Air Canada"),
      org("Université de Lyon"),
      org("Université de Lille"),
      org("Université Paris-Saclay"),
      org("Université Paris Cité"),
      org("Technical University of Munich"),
      org("Technical University of Denmark"),
      org("Grenoble INP"),
      org("Bordeaux INP"),
      org("Banque de France"),
      org("Banque de Luxembourg"),
      org("SAP France"),
      org("SAP Canada"),
      org("Orange Business"),
      org("Orange Bank"),
    ]);
    expect(groups.every((g) => g.members.length === 1)).toBe(true);
  });

  it("is deterministic whatever the input order", () => {
    const input = [org("Alten Canada"), org("Alten"), org("INSA Lyon"), org("INSA Toulouse"), org("Zefir"), org("Alten Chine"), org("Mistral AI")];
    const reference = JSON.stringify(groupOrganizations(input));
    for (let i = 0; i < 5; i++) {
      const shuffled = [...input].sort(() => (i % 2 ? 1 : -1) * (Math.random() - 0.5));
      expect(JSON.stringify(groupOrganizations(shuffled))).toBe(reference);
    }
    expect(names(groupOrganizations(input)).find(([n]) => n === "INSA")).toEqual(["INSA", ["INSA Lyon", "INSA Toulouse"]]);
  });

  it("lists the other sites of an organization", () => {
    const base = org("Alten");
    const canada = org("Alten Canada");
    const other = org("Zefir");
    expect(siblingOrganizations(canada.id, [base, canada, other])).toEqual({ brand: "Alten", siblings: [base] });
    expect(siblingOrganizations(other.id, [base, canada, other]).siblings).toEqual([]);
  });

  it("recognizes location suffixes", () => {
    expect(isLocationSuffix(["canada"])).toBe(true);
    expect(isLocationSuffix(["sud", "ouest"])).toBe(true);
    expect(isLocationSuffix(["de", "lille"])).toBe(true);
    expect(isLocationSuffix(["ile", "de", "france"])).toBe(true);
    expect(isLocationSuffix(["the"])).toBe(false);
    expect(isLocationSuffix(["invent"])).toBe(false);
    expect(isLocationSuffix(["engineering", "france"])).toBe(false);
    expect(isLocationSuffix(["kourou"], new Set(["kourou"]))).toBe(true);
  });

  it("summarizes the locations of a group", () => {
    expect(locationsLabel([org("A", { country: "Canada" }), org("B", { country: "Chine" }), org("C", { city: "Paris", country: "France" }), org("D", { country: "canada" })])).toEqual({ label: "Canada, Chine, France", more: 0 });
    expect(locationsLabel([org("A", { country: "Canada" }), org("B", { country: "Chine" }), org("C", { country: "France" }), org("D", { country: "Japon" })], 2)).toEqual({ label: "Canada, Chine", more: 2 });
  });
});

// ---------------------------------------------------------------------------
// Logos (server-side favicon cache)
// ---------------------------------------------------------------------------

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 1)]);
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(100, 2)]);

function stubDeps(routes: Record<string, () => Response>, addresses: Record<string, string[]> = {}): LogoDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    now: () => Date.now(),
    resolve: async (host) => addresses[host] ?? ["93.184.216.34"],
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const route = routes[url];
      return route ? route() : new Response("not found", { status: 404, headers: { "content-type": "image/png" } });
    }) as typeof fetch,
  };
}

describe("logos", () => {
  beforeEach(() => {
    process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-logos-"));
  });

  it("sniffs raster images from their magic bytes and refuses anything else", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(ICO)).toBe("image/x-icon");
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("GIF89a......"))).toBe("image/gif");
    expect(sniffImageType(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from("<!doctype html><html>"))).toBeNull();
    expect(sniffImageType(Buffer.from([0, 0, 1, 0, 0, 0]))).toBeNull(); // ICO with no image
  });

  it("tries Google (128 px), DuckDuckGo, then the site itself, for the host, its registrable domain, then www.", () => {
    expect(logoSources("careers.alten.com")).toEqual([
      "https://www.google.com/s2/favicons?domain=careers.alten.com&sz=128",
      "https://icons.duckduckgo.com/ip3/careers.alten.com.ico",
      "https://careers.alten.com/apple-touch-icon.png",
      "https://careers.alten.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain=alten.com&sz=128",
      "https://icons.duckduckgo.com/ip3/alten.com.ico",
      "https://alten.com/apple-touch-icon.png",
      "https://alten.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain=www.alten.com&sz=128",
      "https://icons.duckduckgo.com/ip3/www.alten.com.ico",
      "https://www.alten.com/apple-touch-icon.png",
      "https://www.alten.com/favicon.ico",
    ]);
    // Apex host: the apex, then www.
    expect(logoSources("ulaval.ca")).toHaveLength(8);
    expect(logoSources("ulaval.ca")[4]).toBe("https://www.google.com/s2/favicons?domain=www.ulaval.ca&sz=128");
  });

  it("measures icons and keeps looking until a sharp one is found", async () => {
    expect(imageWidth({ body: PNG, contentType: "image/png" })).toBe(PNG.readUInt32BE(16));
    const small = Buffer.from(PNG);
    small.writeUInt32BE(16, 16);
    const big = Buffer.from(PNG);
    big.writeUInt32BE(128, 16);
    const deps = stubDeps({
      "https://icons.duckduckgo.com/ip3/sharp.fr.ico": () => new Response(small, { headers: { "content-type": "image/png" } }),
      "https://sharp.fr/apple-touch-icon.png": () => new Response(big, { headers: { "content-type": "image/png" } }),
    });
    const logo = await getLogo("sharp.fr", deps);
    expect(imageWidth(logo!)).toBe(128);
    expect(deps.calls).toHaveLength(3); // stops at the first sharp icon
  });

  it("accepts only safe, standalone SVG from SVGL", async () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>')).toBe(true);
    expect(isSafeSvg('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>')).toBe(true);
    expect(isSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(isSafeSvg('<svg onload="x()"></svg>')).toBe(false);
    expect(isSafeSvg('<svg><foreignObject><div/></foreignObject></svg>')).toBe(false);
    expect(isSafeSvg("<html></html>")).toBe(false);
    const deps = stubDeps({
      "https://api.svgl.app/?search=Anthropic": () => Response.json([{ title: "Anthropic", route: { light: "https://svgl.app/library/anthropic_black.svg", dark: "https://svgl.app/library/anthropic_white.svg" } }]),
      "https://svgl.app/library/anthropic_black.svg": () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
    });
    const logo = await getSvglLogo("Anthropic", deps);
    expect(logo?.contentType).toBe("image/svg+xml");
    expect(await getSvglLogo("Anthropic", deps)).not.toBeNull(); // cached
    expect(deps.calls).toHaveLength(2);
    const none = stubDeps({ "https://api.svgl.app/?search=ALTEN%20Canada": () => Response.json({ error: "not found" }) });
    expect(await getSvglLogo("ALTEN Canada", none)).toBeNull();
  });

  it("fetches, validates and caches a logo on disk", async () => {
    const deps = stubDeps({ "https://alten.com/favicon.ico": () => new Response(PNG, { headers: { "content-type": "image/png" } }) });
    const first = await getLogo("alten.com", deps);
    expect(first?.contentType).toBe("image/png");
    expect(deps.calls).toEqual([
      "https://www.google.com/s2/favicons?domain=alten.com&sz=128",
      "https://icons.duckduckgo.com/ip3/alten.com.ico",
      "https://alten.com/apple-touch-icon.png",
      "https://alten.com/favicon.ico",
    ]);
    const again = await getLogo("alten.com", deps);
    expect(again?.body.equals(PNG)).toBe(true);
    expect(deps.calls).toHaveLength(4); // served from the disk cache
    expect(fs.readdirSync(path.join(process.env.APP_DATA_DIR!, "logos")).filter((f) => f.endsWith(".img"))).toHaveLength(1);
  });

  it("caches misses too", async () => {
    const deps = stubDeps({});
    expect(await getLogo("unknown-company.fr", deps)).toBeNull();
    expect(deps.calls).toHaveLength(8); // apex then www.
    expect(await getLogo("unknown-company.fr", deps)).toBeNull();
    expect(deps.calls).toHaveLength(8);
  });

  it("deduplicates concurrent requests for the same domain", async () => {
    const deps = stubDeps({ "https://icons.duckduckgo.com/ip3/zefir.fr.ico": () => new Response(ICO, { headers: { "content-type": "image/vnd.microsoft.icon" } }) });
    const [a, b, c] = await Promise.all([getLogo("zefir.fr", deps), getLogo("zefir.fr", deps), getLogo("zefir.fr", deps)]);
    expect([a?.contentType, b?.contentType, c?.contentType]).toEqual(["image/x-icon", "image/x-icon", "image/x-icon"]);
    expect(deps.calls).toHaveLength(8); // one resolution shared by the three requests
  });

  it("refuses non-images, SVG, oversized bodies, private hosts and redirects to them", async () => {
    const html = stubDeps({ "https://a.com/favicon.ico": () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) });
    expect(await fetchImage("https://a.com/favicon.ico", html)).toBeNull();
    const lying = stubDeps({ "https://a.com/favicon.ico": () => new Response("<html></html>", { headers: { "content-type": "image/png" } }) });
    expect(await fetchImage("https://a.com/favicon.ico", lying)).toBeNull();
    const svg = stubDeps({ "https://a.com/favicon.ico": () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }) });
    expect(await fetchImage("https://a.com/favicon.ico", svg)).toBeNull();
    const huge = stubDeps({ "https://a.com/favicon.ico": () => new Response(Buffer.concat([PNG, Buffer.alloc(300 * 1024)]), { headers: { "content-type": "image/png" } }) });
    expect(await fetchImage("https://a.com/favicon.ico", huge)).toBeNull();
    const privateHost = stubDeps({ "https://intranet.a.com/favicon.ico": () => new Response(PNG) }, { "intranet.a.com": ["10.0.0.5"] });
    expect(await fetchImage("https://intranet.a.com/favicon.ico", privateHost)).toBeNull();
    expect(privateHost.calls).toEqual([]);
    const redirect = stubDeps({ "https://a.com/favicon.ico": () => new Response(null, { status: 302, headers: { location: "https://evil.a.com/x.png" } }), "https://evil.a.com/x.png": () => new Response(PNG) }, { "evil.a.com": ["127.0.0.1"] });
    expect(await fetchImage("https://a.com/favicon.ico", redirect)).toBeNull();
    expect(redirect.calls).toEqual(["https://a.com/favicon.ico"]);
    const insecure = stubDeps({ "https://a.com/favicon.ico": () => new Response(null, { status: 301, headers: { location: "http://a.com/favicon.ico" } }) });
    expect(await fetchImage("https://a.com/favicon.ico", insecure)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CV import (pure parts)
// ---------------------------------------------------------------------------

const CV_TEXT = `Pierre Exemple
Ingénieur logiciel full-stack
Profil : développeur passionné par la santé numérique, 5 ans d'expérience en TypeScript et Python.
Compétences : TypeScript, React, Node.js, PostgreSQL, Python, Docker
Langues : Français (natif), Anglais (C1)
Formation : Master Informatique — Université de Lyon (2018-2020)`;

const emptyProfile = (): Profile => profileSchema.parse({});

describe("CV import", () => {
  it("uses exactly the keys of the profile", () => {
    expect(Object.keys(cvProfileExtractionSchema.shape).sort()).toEqual(Object.keys(profileSchema.shape).sort());
  });

  it("finds values in the CV text and flags the others", () => {
    expect(foundInText("TypeScript", CV_TEXT)).toBe(true);
    expect(foundInText("Anglais — C1", CV_TEXT)).toBe(true);
    expect(foundInText("Master Informatique — Université de Lyon (2018-2020)", CV_TEXT)).toBe(true);
    expect(foundInText("Kubernetes", CV_TEXT)).toBe(false);
    expect(yearsStatedInText(5, CV_TEXT)).toBe(true);
    expect(yearsStatedInText(8, CV_TEXT)).toBe(false);
  });

  it("cleans the extraction and marks what is not in the CV", () => {
    const raw: CvProfileExtraction = {
      fullName: "  Pierre Exemple ",
      headline: "Ingénieur logiciel full-stack",
      summary: null,
      yearsOfExperience: 8,
      skills: ["TypeScript", "typescript", "React", "Kubernetes", " "],
      languages: ["Anglais — C1"],
      education: [],
      targetRoles: [],
      targetDomains: [],
      preferredLocations: [],
      dealBreakers: [],
    };
    const { proposed, unverified } = buildCvProposal(raw, CV_TEXT);
    expect(proposed.fullName).toBe("Pierre Exemple");
    expect(proposed.summary).toBe("");
    expect(proposed.skills).toEqual(["TypeScript", "React", "Kubernetes"]);
    expect(unverified.items.skills).toEqual(["Kubernetes"]);
    expect(unverified.yearsOfExperience).toBe(true);
    expect(unverified.text).toEqual([]);
  });

  it("proposes safe defaults and merges accepted fields without losing data", () => {
    const current: Profile = { ...emptyProfile(), headline: "Mon titre", skills: ["Go", "React"] };
    const proposal: CvProposal = {
      proposed: { fullName: "Pierre Exemple", headline: "Ingénieur logiciel", summary: "", yearsOfExperience: 5, skills: ["React", "TypeScript", "Kubernetes"], languages: [], education: [], targetRoles: [], targetDomains: [], preferredLocations: [], dealBreakers: [] },
      unverified: { text: [], yearsOfExperience: false, items: { skills: ["Kubernetes"] } },
      warnings: [],
      meta: { provider: "claude-code", model: "haiku", promptVersion: "cv_profile_import_v1", durationMs: 1, characters: 1, truncated: false, pageCount: 1 },
    };
    const choices = initialCvChoices(current, proposal);
    expect(choices.text).toEqual({ fullName: true, headline: false, summary: false }); // never overwrite by default
    expect(choices.years).toBe(true);
    expect(choices.lists.skills).toEqual({ accept: true, mode: "merge", included: ["React", "TypeScript"] }); // unverified item left out
    expect(choices.lists.languages.accept).toBe(false);
    const next = applyCvChoices(current, proposal, choices);
    expect(next).toMatchObject({ fullName: "Pierre Exemple", headline: "Mon titre", yearsOfExperience: 5, skills: ["Go", "React", "TypeScript"] });
    expect(countProfileChanges(current, next)).toBe(3);
    const replaced = applyCvChoices(current, proposal, { ...choices, lists: { ...choices.lists, skills: { accept: true, mode: "replace", included: ["TypeScript"] } } });
    expect(replaced.skills).toEqual(["TypeScript"]);
    expect(profileSchema.parse(next)).toEqual(next);
  });

  it("merges list items ignoring case and accents", () => {
    const current: Profile = { ...emptyProfile(), languages: ["Français (natif)"] };
    const proposal: CvProposal = {
      proposed: { fullName: "", headline: "", summary: "", yearsOfExperience: null, skills: [], languages: ["Francais (natif)", "Anglais (B2)"], education: [], targetRoles: [], targetDomains: [], preferredLocations: [], dealBreakers: [] },
      unverified: { text: [], yearsOfExperience: false, items: {} },
      warnings: [],
      meta: { provider: "none", model: null, promptVersion: "cv_profile_import_v1", durationMs: 0, characters: 0, truncated: false, pageCount: null },
    };
    const choices = initialCvChoices(current, proposal);
    expect(choices.text).toEqual({ fullName: false, headline: false, summary: false });
    expect(choices.years).toBe(false);
    expect(applyCvChoices(current, proposal, choices).languages).toEqual(["Français (natif)", "Anglais (B2)"]);
  });
});
