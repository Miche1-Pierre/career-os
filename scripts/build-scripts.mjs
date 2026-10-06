// Bundles the runtime scripts executed outside Next.js (migrations at container start) into dist/.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: { migrate: path.join(root, "src/server/db/migrate.ts") },
  outdir: path.join(root, "dist"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  alias: { "@": path.join(root, "src") },
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
