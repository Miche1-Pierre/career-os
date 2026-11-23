// Career OS (Microsoft Store package): unpacks app.zip once per version, run by CareerOS.exe with the bundled Node.js.
//
//   node unpack.mjs <app.zip> <runtime folder> <version>
//
// → <runtime folder>\<version>\ (with a .ready marker), older versions removed. Node.js rather than Windows' tar:
// the app has paths longer than 260 characters once unpacked under a long user name, which tar cannot create.
// Reads the zip written by scripts/package-windows.mjs (stored or deflated entries, Zip64 fields when present).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [zipPath, runtime, version] = process.argv.slice(2);
if (!zipPath || !runtime || !version) {
  console.error("usage: node unpack.mjs <app.zip> <runtime folder> <version>");
  process.exit(2);
}
const target = path.join(runtime, version);
const ready = path.join(target, ".ready");
if (fs.existsSync(ready)) process.exit(0);

const staging = `${target}.unpacking`;
fs.rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
fs.rmSync(target, { recursive: true, force: true, maxRetries: 5 });
fs.mkdirSync(staging, { recursive: true });

const fd = fs.openSync(zipPath, "r");
const size = fs.fstatSync(fd).size;
const read = (position, length) => {
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, position);
  return buf;
};

// End of central directory (and its Zip64 version when the archive needs it).
const tailLength = Math.min(size, 65_557);
const tail = read(size - tailLength, tailLength);
let eocd = -1;
for (let i = tailLength - 22; i >= 0; i--) {
  if (tail.readUInt32LE(i) === 0x06054b50) {
    eocd = i;
    break;
  }
}
if (eocd < 0) throw new Error("archive illisible (fin introuvable)");
let entries = tail.readUInt16LE(eocd + 10);
let cdOffset = tail.readUInt32LE(eocd + 16);
if (entries === 0xffff || cdOffset === 0xffffffff) {
  const locator = eocd - 20;
  if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error("archive Zip64 illisible");
  const zip64 = read(Number(tail.readBigUInt64LE(locator + 8)), 56);
  entries = Number(zip64.readBigUInt64LE(32));
  cdOffset = Number(zip64.readBigUInt64LE(48));
}

const root = path.resolve(staging);
let files = 0;
let position = cdOffset;
for (let n = 0; n < entries; n++) {
  const header = read(position, 46);
  if (header.readUInt32LE(0) !== 0x02014b50) throw new Error(`archive abîmée (entrée ${n})`);
  const method = header.readUInt16LE(10);
  let compressed = header.readUInt32LE(20);
  let uncompressed = header.readUInt32LE(24);
  const nameLength = header.readUInt16LE(28);
  const extraLength = header.readUInt16LE(30);
  const commentLength = header.readUInt16LE(32);
  let local = header.readUInt32LE(42);
  const rest = read(position + 46, nameLength + extraLength);
  const name = rest.subarray(0, nameLength).toString("utf8");
  // Zip64 extended information: the 64-bit values replace the 0xFFFFFFFF ones, in this order.
  for (let e = nameLength; e + 4 <= nameLength + extraLength; ) {
    const id = rest.readUInt16LE(e);
    const length = rest.readUInt16LE(e + 2);
    if (id === 0x0001) {
      let p = e + 4;
      if (uncompressed === 0xffffffff) {
        uncompressed = Number(rest.readBigUInt64LE(p));
        p += 8;
      }
      if (compressed === 0xffffffff) {
        compressed = Number(rest.readBigUInt64LE(p));
        p += 8;
      }
      if (local === 0xffffffff) local = Number(rest.readBigUInt64LE(p));
    }
    e += 4 + length;
  }
  position += 46 + nameLength + extraLength + commentLength;

  const clean = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!clean || clean === "./") continue;
  const out = path.resolve(root, clean);
  if (out !== root && !out.startsWith(root + path.sep)) throw new Error(`chemin refusé dans l'archive : ${name}`);
  if (clean.endsWith("/")) {
    fs.mkdirSync(out, { recursive: true });
    continue;
  }
  const localHeader = read(local, 30);
  if (localHeader.readUInt32LE(0) !== 0x04034b50) throw new Error(`archive abîmée (${name})`);
  const data = read(local + 30 + localHeader.readUInt16LE(26) + localHeader.readUInt16LE(28), compressed);
  let content;
  if (method === 0) content = data;
  else if (method === 8) content = zlib.inflateRawSync(data);
  else throw new Error(`compression non prise en charge (${method}) : ${name}`);
  if (content.length !== uncompressed) throw new Error(`taille inattendue : ${name}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, content);
  files++;
}
fs.closeSync(fd);

if (!fs.existsSync(path.join(staging, "server.js"))) throw new Error("application incomplète après décompression");
fs.renameSync(staging, target);
fs.writeFileSync(ready, `${new Date().toISOString()}\n`);
console.log(`[unpack] ${files} fichiers dans ${target}`);

// Older versions, after an update: only disk space, never an error.
for (const entry of fs.readdirSync(runtime)) {
  if (entry === version) continue;
  try {
    fs.rmSync(path.join(runtime, entry), { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    console.log(`[unpack] ancienne version non supprimée (${entry}) : ${error instanceof Error ? error.message : error}`);
  }
}
