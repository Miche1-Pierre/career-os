import { NextResponse, type NextRequest } from "next/server";
import { accessToken, isAllowedHost, isAllowedOrigin, isAuthorizedRequest, SESSION_COOKIE } from "@/server/security";

const PUBLIC_PATHS = ["/unlock", "/api/health", "/favicon.ico", "/icon.svg", "/manifest.webmanifest"];

export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (!isAllowedHost(host)) {
    return new NextResponse(`Host "${host}" is not allowed. Add it to ALLOWED_HOSTS if this is expected.`, { status: 421 });
  }

  const { pathname } = request.nextUrl;
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (pathname.startsWith("/api/") && mutating) {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin, host)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-origin request refused" } }, { status: 403 });
    }
  }

  if (accessToken() && !PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!isAuthorizedRequest(request.headers, request.cookies.get(SESSION_COOKIE)?.value)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/unlock";
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
