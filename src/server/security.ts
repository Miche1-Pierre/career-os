import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Security model (personal app):
 *  - Host allow-list → protects the unauthenticated local app against DNS-rebinding.
 *  - Origin check on state-changing API calls → no cross-site requests from other websites (CSRF).
 *  - Optional APP_ACCESS_TOKEN → required as soon as the app is reachable from a network (VPS).
 */
export const SESSION_COOKIE = "cos_session";

function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

export function allowedHosts(): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "host.docker.internal", "0.0.0.0"]);
  for (const value of [process.env.APP_URL, ...(process.env.ALLOWED_HOSTS ?? "").split(",")]) {
    const v = value?.trim();
    if (!v) continue;
    try {
      hosts.add(new URL(v.includes("://") ? v : `http://${v}`).hostname.toLowerCase());
    } catch {
      hosts.add(v.toLowerCase());
    }
  }
  return hosts;
}

export function isAllowedHost(hostHeader: string | null): boolean {
  if ((process.env.ALLOWED_HOSTS ?? "").trim() === "*") return true;
  if (!hostHeader) return false;
  const name = hostnameOf(hostHeader);
  const hosts = allowedHosts();
  return hosts.has(name) || name.endsWith(".localhost");
}

export function isAllowedOrigin(origin: string, hostHeader: string | null): boolean {
  if (origin === "null") return false;
  try {
    const url = new URL(origin);
    if (hostHeader && url.host.toLowerCase() === hostHeader.toLowerCase()) return true;
    return isAllowedHost(url.host);
  } catch {
    return false;
  }
}

export function accessToken(): string | null {
  const t = process.env.APP_ACCESS_TOKEN?.trim();
  return t ? t : null;
}

export function sessionValue(token: string): string {
  return createHmac("sha256", token).update("career-os-session-v1").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAuthorizedRequest(headers: Headers, cookieValue: string | undefined): boolean {
  const token = accessToken();
  if (!token) return true;
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ") && safeEqual(auth.slice(7).trim(), token)) return true;
  if (cookieValue && safeEqual(cookieValue, sessionValue(token))) return true;
  return false;
}
