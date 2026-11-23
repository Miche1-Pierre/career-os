#!/usr/bin/env node
/**
 * Images for the Microsoft Store listing (Partner Center → Store listings), from the site's screenshots (demo data):
 *   docs/store/images/logo-300.png         app logo for the listing (300 × 300)
 *   docs/store/images/NN-<name>.png        desktop screenshots, 1920 × 1200 (the Store asks for 1366 × 768 or more)
 *
 *   node scripts/store-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "docs", "store", "images");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const logo = fs.readFileSync(path.join(root, "site", "favicon.svg"));
await sharp(logo, { density: 1200 })
  .resize(240, 240)
  .extend({ top: 30, bottom: 30, left: 30, right: 30, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(dir, "logo-300.png"));

// Order = order in the Store listing: the first one is the most visible.
const screens = ["home", "today", "board", "application", "analysis", "move-housing", "move-map", "cv-editor", "interviews", "analytics"];
for (const [i, name] of screens.entries()) {
  const file = path.join(dir, `${String(i + 1).padStart(2, "0")}-${name}.png`);
  await sharp(path.join(root, "site", "screens", `${name}.webp`)).resize(1920, 1200).png({ compressionLevel: 9 }).toFile(file);
}
console.log(`[store] ${screens.length} captures et le logo dans docs/store/images`);
