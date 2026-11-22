/**
 * Organization logos (favicons), fetched server-side and cached on disk.
 *
 * Privacy: only the organization's website domain leaves the machine (DuckDuckGo icon service, then the site's own
 * /favicon.ico). The browser only ever talks to /api/logos/:id, so the CSP stays `img-src 'self'`.
 * Set LOGOS=off to disable every outbound request (the UI then shows letter avatars).
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { isPrivateAddress } from "@/server/capture/safe-fetch";
import { storageConfig } from "@/server/storage";
import { registrableDomain } from "@/lib/org-grouping";

export const LOGO_MAX_BYTES = 256 * 1024;
const LOGO_MIN_BYTES = 32;
const HIT_TTL_MS = 30 * 24 * 3600_000;
const MISS_TTL_MS = 3 * 24 * 3600_000;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

export type LogoContentType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/x-icon" | "image/svg+xml";

export interface Logo {
  body: Buffer;
  contentType: LogoContentType;
}

export function logosEnabled(): boolean {
  return (process.env.LOGOS ?? "").trim().toLowerCase() !== "off";
}

/**
 * Raster image type from the magic bytes, or null. SVG is refused on purpose (it can carry scripts).
 */
export function sniffImageType(bytes: Uint8Array): LogoContentType | null {
  const b = bytes;
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  // ICO: reserved 0, type 1, at least one image.
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && (b[4] | (b[5] << 8)) > 0) return "image/x-icon";
  return null;
}

/** Content types a favicon may be announced with (the bytes are sniffed anyway). */
function acceptableContentType(header: string | null): boolean {
  if (!header) return true;
  const type = header.split(";")[0].trim().toLowerCase();
  if (type === "image/svg+xml") return false;
  return type.startsWith("image/") || type === "application/octet-stream" || type === "binary/octet-stream";
}

export interface LogoDeps {
  fetch: typeof fetch;
  /** Resolves a hostname to its addresses (DNS). */
  resolve: (host: string) => Promise<string[]>;
  now: () => number;
}

const defaultDeps: LogoDeps = {
  fetch: (...args) => fetch(...args),
  resolve: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
  now: () => Date.now(),
};

async function assertPublicHost(host: string, deps: LogoDeps) {
  if (net.isIP(host)) throw new Error("IP addresses are not fetched");
  const addresses = await deps.resolve(host).catch(() => [] as string[]);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Host is not public");
}

/** Fetches one candidate URL: https only, public hosts only (re-checked on redirects), bounded size and time. */
export async function fetchImage(raw: string, deps: LogoDeps = defaultDeps): Promise<Logo | null> {
  let url = new URL(raw);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (url.protocol !== "https:" || url.username || url.password) return null;
    try {
      await assertPublicHost(url.hostname, deps);
    } catch {
      return null;
    }
    let response: Response;
    try {
      response = await deps.fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // No cookies, no referrer: Node's fetch sends neither.
        headers: { accept: "image/avif,image/webp,image/png,image/x-icon,image/*;q=0.8", "user-agent": "CareerOS/1.0 (favicon)" },
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300 || !acceptableContentType(response.headers.get("content-type"))) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (Number(response.headers.get("content-length") ?? 0) > LOGO_MAX_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = await readCapped(response, LOGO_MAX_BYTES);
    if (!body || body.byteLength < LOGO_MIN_BYTES) return null;
    const contentType = sniffImageType(body);
    return contentType ? { body, contentType } : null;
  }
  return null;
}

async function readCapped(response: Response, max: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

/** Candidate URLs for a host, best first (Google's 128 px icon service gives the sharpest results). */
export function logoSources(host: string): string[] {
  const hosts = [...new Set([host, registrableDomain(host)])];
  return hosts.flatMap((h) => [
    `https://www.google.com/s2/favicons?domain=${h}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${h}.ico`,
    `https://${h}/apple-touch-icon.png`,
    `https://${h}/favicon.ico`,
  ]);
}

/** Pixel width of a PNG or the largest image of an ICO (0 when unknown). */
export function imageWidth(logo: Logo): number {
  const b = logo.body;
  if (logo.contentType === "image/png" && b.length >= 24) return b.readUInt32BE(16);
  if (logo.contentType === "image/x-icon" && b.length >= 6) {
    const count = b.readUInt16LE(4);
    let max = 0;
    for (let i = 0; i < count && 6 + i * 16 < b.length; i++) max = Math.max(max, b[6 + i * 16] || 256);
    return max;
  }
  return 0;
}

const SHARP_PX = 64;

function cachePaths(host: string) {
  const key = createHash("sha256").update(host).digest("hex").slice(0, 40);
  const dir = path.join(storageConfig.dataDir, "logos");
  return { dir, image: path.join(dir, `${key}.img`), miss: path.join(dir, `${key}.miss`) };
}

async function fresh(file: string, ttl: number, now: number): Promise<boolean | null> {
  try {
    const st = await fs.stat(file);
    return now - st.mtimeMs < ttl;
  } catch {
    return null; // absent
  }
}

async function writeAtomic(file: string, data: Buffer | string) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

const inflight = globalThis as unknown as { __careerOsLogoInflight?: Map<string, Promise<Logo | null>> };
const pending = (inflight.__careerOsLogoInflight ??= new Map());

/**
 * Logo of a website host (see websiteHost in lib/org-grouping): served from the disk cache (30 days, misses 3 days),
 * fetched otherwise. A stale logo is kept when the refresh fails.
 */
export async function getLogo(host: string, deps: LogoDeps = defaultDeps): Promise<Logo | null> {
  const existing = pending.get(host);
  if (existing) return existing;
  const job = resolveLogo(host, deps).finally(() => pending.delete(host));
  pending.set(host, job);
  return job;
}

async function resolveLogo(host: string, deps: LogoDeps): Promise<Logo | null> {
  const files = cachePaths(host);
  const now = deps.now();
  const imageFresh = await fresh(files.image, HIT_TTL_MS, now);
  const cached = imageFresh === null ? null : await readCached(files.image);
  if (imageFresh && cached) return cached;
  if (!cached && (await fresh(files.miss, MISS_TTL_MS, now))) return null;

  // First sharp icon wins; otherwise keep the largest one found.
  let found: Logo | null = null;
  for (const source of logoSources(host)) {
    const logo = await fetchImage(source, deps);
    if (!logo) continue;
    const width = imageWidth(logo);
    if (!found || width > imageWidth(found)) found = logo;
    if (width >= SHARP_PX || width === 0) break;
  }
  try {
    await fs.mkdir(files.dir, { recursive: true });
    if (found) {
      await writeAtomic(files.image, found.body);
      await fs.rm(files.miss, { force: true });
    } else if (cached) {
      // Keep serving the stale logo; retry after the miss TTL.
      await fs.utimes(files.image, new Date(now - HIT_TTL_MS + MISS_TTL_MS), new Date(now - HIT_TTL_MS + MISS_TTL_MS));
    } else {
      await writeAtomic(files.miss, new Date(now).toISOString());
    }
  } catch {
    // Cache is best effort (read-only data dir…).
  }
  return found ?? cached;
}

async function readCached(file: string): Promise<Logo | null> {
  try {
    const body = await fs.readFile(file);
    const contentType = sniffImageType(body);
    return contentType ? { body, contentType } : null;
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// SVGL (svgl.app): vector logos of well-known brands, matched by exact name
// ---------------------------------------------------------------------------

const SVG_MAX_BYTES = 200 * 1024;

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A standalone SVG without scripts, event handlers, external references or foreign HTML. */
export function isSafeSvg(text: string): boolean {
  const t = text.trim();
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t)) return false;
  return !/<script|<foreignobject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']\s*(https?:|\/\/|data:text)|href\s*=\s*["']\s*(https?:|\/\/|data:text)/i.test(t);
}

interface SvglItem {
  title: string;
  route: string | { light?: string; dark?: string };
}

/** Logo from SVGL when an entry's title is exactly the organization's name (cached like favicons). */
export async function getSvglLogo(name: string, deps: LogoDeps = defaultDeps): Promise<Logo | null> {
  const key = normName(name);
  if (key.length < 2) return null;
  const files = cachePaths(`svgl:${key}`);
  const svgFile = files.image.replace(/\.img$/, ".svg");
  const now = deps.now();
  if (await fresh(svgFile, HIT_TTL_MS, now)) {
    try {
      return { body: await fs.readFile(svgFile), contentType: "image/svg+xml" };
    } catch {
      /* refetch */
    }
  }
  if (await fresh(files.miss, MISS_TTL_MS, now)) return null;
  let logo: Logo | null = null;
  try {
    const res = await deps.fetch(`https://api.svgl.app/?search=${encodeURIComponent(name.replace(/\(.*?\)/g, "").trim())}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const items = res.ok ? ((await res.json()) as SvglItem[] | { error: string }) : [];
    const item = Array.isArray(items) ? items.find((i) => normName(i.title) === key) : undefined;
    const route = item ? (typeof item.route === "string" ? item.route : (item.route.light ?? item.route.dark)) : null;
    if (route && route.startsWith("https://svgl.app/")) {
      const svg = await deps.fetch(route, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = svg.ok ? await svg.text() : "";
      if (text.length > 0 && text.length <= SVG_MAX_BYTES && isSafeSvg(text)) logo = { body: Buffer.from(text, "utf8"), contentType: "image/svg+xml" };
    }
  } catch {
    logo = null;
  }
  try {
    await fs.mkdir(files.dir, { recursive: true });
    if (logo) await writeAtomic(svgFile, logo.body);
    else await writeAtomic(files.miss, new Date(now).toISOString());
  } catch {
    /* best effort */
  }
  return logo;
}
