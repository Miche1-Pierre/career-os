import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

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
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
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
  serverExternalPackages: ["unpdf", "mammoth", "linkedom", "@mozilla/readability", "@huggingface/transformers", "onnxruntime-node", "sharp"],
  // Dictation (local Whisper): transformers.js loads onnxruntime-node through createRequire, which file tracing does not
  // follow; ship it with the Linux binaries only (the image is Linux; macOS / Windows builds are ~220 MB).
  outputFileTracingIncludes: {
    "/api/transcribe": [
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/onnxruntime_binding.node",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime.so*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime_providers_shared.so",
      "./node_modules/onnxruntime-common/**/*",
    ],
  },
  // CPU only: the CUDA / TensorRT providers (≈ 260 MB) and other platforms' builds stay out of the image.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime_providers_cuda.so",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime_providers_tensorrt.so",
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
      { source: "/:path((?!api/files/).*)", headers: csp },
    ];
  },
};

export default nextConfig;
