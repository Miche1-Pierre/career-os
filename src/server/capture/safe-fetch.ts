import { lookup } from "node:dns/promises";
import net from "node:net";
import { AppError } from "@/server/context";

/**
 * SSRF-safe fetch for URL imports: http(s) only, public IPs only (checked on every redirect),
 * bounded size and time, allow-listed content types.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string) {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("VALIDATION", "Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new AppError("VALIDATION", "Only http(s) URLs can be imported");
  if (url.username || url.password) throw new AppError("VALIDATION", "URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new AppError("FORBIDDEN", "Local addresses cannot be imported");
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new AppError("VALIDATION", `Cannot resolve ${host}`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new AppError("FORBIDDEN", "Private network addresses cannot be imported");
  return url;
}

const ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "application/pdf", "application/json", "application/ld+json", "text/markdown"];

export interface FetchedResource {
  finalUrl: string;
  contentType: string;
  body: Buffer;
  status: number;
}

export async function safeFetch(raw: string): Promise<FetchedResource> {
  let current = await assertPublicUrl(raw);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 CareerOS/1.0",
          accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });
    } catch (error) {
      clearTimeout(timer);
      throw new AppError("UNAVAILABLE", `Could not fetch the page (${error instanceof Error ? error.message : "network error"})`);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      clearTimeout(timer);
      current = await assertPublicUrl(new URL(response.headers.get("location")!, current).toString());
      continue;
    }
    const contentType = (response.headers.get("content-type") ?? "text/html").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) {
      clearTimeout(timer);
      throw new AppError("VALIDATION", `Unsupported content type: ${contentType}`);
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      clearTimeout(timer);
      throw new AppError("VALIDATION", "Page too large to import");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          controller.abort();
          clearTimeout(timer);
          throw new AppError("VALIDATION", "Page too large to import");
        }
        chunks.push(value);
      }
    }
    clearTimeout(timer);
    if (response.status >= 400) {
      throw new AppError(
        "UNAVAILABLE",
        response.status === 401 || response.status === 403 || response.status === 999
          ? `The site refused access (${response.status}). It probably requires a login — copy the text of the page and paste it instead.`
          : `The site answered ${response.status}`,
      );
    }
    return { finalUrl: current.toString(), contentType, body: Buffer.concat(chunks), status: response.status };
  }
  throw new AppError("UNAVAILABLE", "Too many redirects");
}
