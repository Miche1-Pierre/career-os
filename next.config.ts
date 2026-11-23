import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
/** Self-contained build made on Windows (the prebuilt app of the Windows install). */
const windowsBuild = process.platform === "win32";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Microphone allowed for this origin only (dictation in the chat bar).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      // OpenStreetMap tiles for the housing map.
      "img-src 'self' data: blob: https://tile.openstreetmap.org",
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
  // The Docker image and the Windows install run the self-contained server (.next/standalone, NEXT_OUTPUT=standalone set
  // by the Dockerfile and the release workflow). A local `npm run build:local` runs `next start`, which does not support
  // that output, so it gets a regular build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  serverExternalPackages: ["unpdf", "mammoth", "linkedom", "@mozilla/readability", "@huggingface/transformers", "onnxruntime-node", "sharp", "@react-pdf/renderer"],
  // Dictation (local Whisper): transformers.js loads onnxruntime-node through createRequire, which file tracing does not
  // follow; ship it with the binaries of the platform being built only: Linux for the Docker image, Windows x64 for
  // the Windows install (built on Windows). macOS / other builds are ~220 MB and stay out.
  outputFileTracingIncludes: {
    "/api/transcribe": [
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      ...(windowsBuild
        ? ["./node_modules/onnxruntime-node/bin/napi-v6/win32/x64/*"]
        : [
            "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/onnxruntime_binding.node",
            "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime.so*",
            "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime_providers_shared.so",
          ]),
      "./node_modules/onnxruntime-common/**/*",
    ],
  },
  // CPU only: the CUDA / TensorRT providers (≈ 260 MB) and other platforms' builds stay out.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
      ...(windowsBuild
        ? ["./node_modules/onnxruntime-node/bin/napi-v6/linux/**/*", "./node_modules/onnxruntime-node/bin/napi-v6/win32/arm64/**/*"]
        : [
            "./node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
            "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime_providers_cuda.so",
            "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime_providers_tensorrt.so",
          ]),
      "./node_modules/onnxruntime-web/**/*",
    ],
  },
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
      { source: "/:path((?!api/files/|api/cv/).*)", headers: csp },
    ];
  },
};

export default nextConfig;
