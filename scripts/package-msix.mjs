#!/usr/bin/env node
/**
 * Microsoft Store package (MSIX), built on Windows after scripts/package-windows.mjs (which assembles release/career-os):
 *
 *   release/msix/layout/                     CareerOS.exe, node\node.exe, app.zip, app.version, Assets\, AppxManifest.xml
 *   release/career-os-<version>-x64.msix     when the Windows SDK's makeappx is available (GitHub's Windows runners)
 *
 * Identity, from Partner Center (Product management → Product identity), as environment variables:
 *   MSIX_IDENTITY_NAME            Package/Identity/Name           (e.g. 12345Pseudo.CareerOS)
 *   MSIX_PUBLISHER                Package/Identity/Publisher      (e.g. CN=1A2B3C4D-…)
 *   MSIX_PUBLISHER_DISPLAY_NAME   Package/Properties/PublisherDisplayName
 *   MSIX_VERSION                  a.b.c.0, higher at each submission (default: package.json version + ".0")
 * Without them the package gets test values: fine to try it locally, refused by the Store.
 *
 * The app goes in as its archive (career-os-windows-x64.zip): MSIX refuses file names with brackets, which the app's
 * pages use ([id]…). CareerOS.exe unpacks it once per version into the package's private storage.
 *
 * The package is not signed: the Store signs it after certification. To try the layout on this PC (Developer Mode on):
 *   Add-AppxPackage -Register release\msix\layout\AppxManifest.xml
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, "release", "career-os");
const out = path.join(root, "release", "msix");
const layout = path.join(out, "layout");
const log = (m) => console.log(`[msix] ${m}`);
const fail = (m) => {
  console.error(`[msix] ${m}`);
  process.exit(1);
};

const zip = path.join(root, "release", "career-os-windows-x64.zip");
if (!fs.existsSync(path.join(stage, "server.js")) || !fs.existsSync(zip)) fail("release/career-os manquant : lance d'abord node scripts/package-windows.mjs");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.MSIX_VERSION?.trim() || `${pkg.version.replace(/[-+].*$/, "")}.0`;
if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}\.0$/.test(version)) fail(`MSIX_VERSION invalide (${version}) : quatre nombres, le dernier à 0`);
const identity = {
  IDENTITY_NAME: process.env.MSIX_IDENTITY_NAME?.trim() || "CareerOS.Test",
  PUBLISHER: process.env.MSIX_PUBLISHER?.trim() || "CN=CareerOS-Test",
  PUBLISHER_DISPLAY_NAME: process.env.MSIX_PUBLISHER_DISPLAY_NAME?.trim() || "Career OS (test)",
  VERSION: version,
};
if (!process.env.MSIX_IDENTITY_NAME) log("identité de test (MSIX_IDENTITY_NAME non défini) : paquet refusé par le Store, utile pour essayer");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(layout, "Assets"), { recursive: true });

// The app, as the install command ships it. app.version names the folder it is unpacked into: a new build, even with
// the same version number, gets a fresh folder.
fs.copyFileSync(zip, path.join(layout, "app.zip"));
fs.copyFileSync(path.join(root, "packaging", "windows", "unpack.mjs"), path.join(layout, "unpack.mjs"));
const zipHash = fs.readFileSync(`${zip}.sha256`, "utf8").trim().split(/\s+/)[0].slice(0, 10);
fs.writeFileSync(path.join(layout, "app.version"), `${version}-${zipHash}\n`);
log(`application : app.zip (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} Mo)`);

// Node.js: the official binary running this script (GitHub's setup-node installs it from nodejs.org).
const nodeExe = process.env.MSIX_NODE?.trim() || process.execPath;
fs.mkdirSync(path.join(layout, "node"), { recursive: true });
fs.copyFileSync(nodeExe, path.join(layout, "node", "node.exe"));
const nodeLicense = path.join(path.dirname(nodeExe), "LICENSE");
if (fs.existsSync(nodeLicense)) fs.copyFileSync(nodeLicense, path.join(layout, "node", "LICENSE"));
log(`Node.js ${process.version}`);

// Launcher without a console window, compiled with the C# compiler that ships with Windows.
const csc = path.join(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!fs.existsSync(csc)) fail(`compilateur C# introuvable (${csc})`);
const built = spawnSync(
  csc,
  ["/nologo", "/target:winexe", "/optimize+", `/win32icon:${path.join(root, "scripts", "career-os.ico")}`, "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll", `/out:${path.join(layout, "CareerOS.exe")}`, path.join(root, "packaging", "windows", "CareerOS.cs")],
  { stdio: "inherit" },
);
if (built.status !== 0) fail("le lanceur CareerOS.exe n'a pas compilé");

// Tile and taskbar images from the logo.
const logo = fs.readFileSync(path.join(root, "site", "favicon.svg"));
const square = (size, pad) => sharp(logo, { density: 1200 }).resize(size - 2 * pad, size - 2 * pad).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();
await square(50, 3).toFile(path.join(layout, "Assets", "StoreLogo.png"));
await square(44, 2).toFile(path.join(layout, "Assets", "Square44x44Logo.png"));
await square(150, 30).toFile(path.join(layout, "Assets", "Square150x150Logo.png"));
const mark = await sharp(logo, { density: 1200 }).resize(96, 96).png().toBuffer();
await sharp({ create: { width: 310, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: mark, left: 107, top: 27 }])
  .png()
  .toFile(path.join(layout, "Assets", "Wide310x150Logo.png"));

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let manifest = fs.readFileSync(path.join(root, "packaging", "windows", "AppxManifest.xml"), "utf8");
for (const [k, v] of Object.entries(identity)) manifest = manifest.replaceAll(`{{${k}}}`, xml(v));
manifest = manifest.replace(/<!--[\s\S]*?-->\s*/, "");
fs.writeFileSync(path.join(layout, "AppxManifest.xml"), manifest);
log(`version ${version}, identité ${identity.IDENTITY_NAME}`);

// Longest path once unpacked (C:\Users\<name>\AppData\Local\CareerOS-Store\<version>-<hash>\…), for information.
let longest = "";
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (p.length > longest.length) longest = p;
    if (e.isDirectory()) walk(p);
  }
})(stage);
log(`chemin le plus long une fois décompressé : ~${60 + version.length + 11 + path.relative(stage, longest).length} caractères (nom d'utilisateur de 15 lettres)`);

// makeappx: newest Windows SDK found.
const kits = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
const sdk = fs.existsSync(kits)
  ? fs
      .readdirSync(kits)
      .filter((v) => /^10\./.test(v) && fs.existsSync(path.join(kits, v, "x64", "makeappx.exe")))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .at(-1)
  : null;
if (!sdk) {
  log("makeappx introuvable (Windows SDK non installé) : dossier prêt dans release/msix/layout, paquet non créé");
  process.exit(0);
}
const msix = path.join(root, "release", `career-os-${version}-x64.msix`);
const packed = spawnSync(path.join(kits, sdk, "x64", "makeappx.exe"), ["pack", "/d", layout, "/p", msix, "/o"], { stdio: "inherit" });
if (packed.status !== 0) fail("makeappx a échoué");
log(`${path.basename(msix)} : ${(fs.statSync(msix).size / 1024 / 1024).toFixed(1)} Mo (SDK ${sdk})`);
