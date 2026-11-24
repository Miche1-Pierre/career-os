#!/usr/bin/env node
/**
 * Microsoft Store logos (Partner Center → Store listings → Store logos), drawn in HTML and captured at their exact size
 * with the browser installed on Windows (Edge or Chrome, headless):
 *   docs/store/images/box-art-2160.png          1:1 Box art, 2160 × 2160
 *   docs/store/images/poster-art-1440x2160.png  Poster art (2:3), 1440 × 2160
 *   docs/store/images/hero-art-3840x2160.png    16:9 Super hero art, 3840 × 2160 (no product title: required for a trailer
 *                                               to play at the top of the listing)
 *
 *   node scripts/store-art.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browsers = [
  path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
];
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) throw new Error("Edge ou Chrome introuvable");

const out = path.join(root, "docs", "store", "images");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(process.env.TEMP ?? process.cwd(), "career-os-art-"));

for (const [page, file, width, height] of [
  ["box.html", "box-art-2160.png", 2160, 2160],
  ["poster.html", "poster-art-1440x2160.png", 1440, 2160],
  ["hero.html", "hero-art-3840x2160.png", 3840, 2160],
]) {
  const target = path.join(out, file);
  const shot = spawnSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`,
      "--allow-file-access-from-files",
      "--virtual-time-budget=8000",
      `--window-size=${width},${height}`,
      `--screenshot=${target}`,
      pathToFileURL(path.join(root, "docs", "store", "art", page)).href,
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  if (shot.status !== 0 || !fs.existsSync(target)) throw new Error(`capture de ${page} impossible`);
  const meta = await sharp(target).metadata();
  if (meta.width !== width || meta.height !== height) throw new Error(`${file} : ${meta.width} × ${meta.height} au lieu de ${width} × ${height}`);
  console.log(`[store] ${file} ${width} × ${height}`);
}
fs.rmSync(profile, { recursive: true, force: true });
