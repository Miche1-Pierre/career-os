import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["unpdf", "mammoth", "linkedom", "@mozilla/readability"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // Uploads go through the proxy (security checks) — allow MAX_UPLOAD_MB + multipart overhead.
    proxyClientMaxBodySize: "40mb",
  },
  async headers() {
    const csp = securityHeaders.filter((h) => h.key === "Content-Security-Policy");
    const base = securityHeaders.filter((h) => h.key !== "Content-Security-Policy");
    return [
      { source: "/:path*", headers: base },
      // Served documents (PDF viewer) set their own policy.
      { source: "/:path((?!api/files/).*)", headers: csp },
    ];
  },
};

export default nextConfig;
