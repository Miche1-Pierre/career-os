import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  APP_PORTS,
  DB_PORTS,
  ensureFreePorts,
  homeSettings,
  localDir,
  lockFile,
  mergeSettings,
  moveDatabase,
  parseEnv,
  prepareHome,
  readLock,
  serializeEnv,
  settingsFile,
} from "../scripts/app-home.mjs";

/** A user profile with Documents\CareerOS (often synced by OneDrive) and the folder kept on the computer. */
const tempProfile = () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-home-"));
  return { profile, home: path.join(profile, "OneDrive", "Documents", "CareerOS"), local: path.join(profile, ".careeros") };
};

/** Everything in a folder, relative, with the bytes of each file (folders end with "/"). */
const snapshot = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const item = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        out[`${item}/`] = "";
        walk(item);
      } else out[item] = fs.readFileSync(path.join(dir, item)).toString("base64");
    }
  };
  walk("");
  return out;
};

/** Looks like a PostgreSQL data folder: PG_VERSION, nested files, and empty folders PostgreSQL needs. */
const fakeDatabase = (dir: string, marker = "1") => {
  for (const d of ["base/1", "global", "pg_tblspc", "pg_wal/archive_status"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, "PG_VERSION"), "17\n");
  fs.writeFileSync(path.join(dir, "global", "pg_control"), Buffer.from([0, 1, 2, 255, 254]));
  fs.writeFileSync(path.join(dir, "base", "1", "1259"), `rows ${marker}`.repeat(500));
  return snapshot(dir);
};

describe("where the data lives", () => {
  it("keeps the live database on this computer (%USERPROFILE%\\.careeros), out of Documents", () => {
    expect(localDir({})).toBe(path.resolve(os.homedir(), ".careeros"));
    expect(localDir({ CAREER_OS_LOCAL_DIR: "  /tmp/elsewhere  " })).toBe(path.resolve("/tmp/elsewhere"));

    const s = homeSettings({ home: "C:\\Users\\Léa\\OneDrive\\Documents\\CareerOS", local: "C:\\Users\\Léa\\.careeros", appPort: 3300, dbPort: 5500 });
    expect(s.CAREER_OS_DB_DIR).toBe("C:/Users/Léa/.careeros/db");
    // Documents, app files and backups stay in Documents\CareerOS (synced: fine, even welcome, for them).
    expect(s.DOCUMENTS_ROOT).toBe("C:/Users/Léa/OneDrive/Documents/CareerOS/documents");
    expect(s.APP_DATA_DIR).toBe("C:/Users/Léa/OneDrive/Documents/CareerOS/data/app");
    expect(s.BACKUPS_DIR).toBe("C:/Users/Léa/OneDrive/Documents/CareerOS/backups");
    expect(s.APP_URL).toBe("http://localhost:3300");
    expect(s.DATABASE_URL).toBe("postgres://postgres:postgres@127.0.0.1:5500/postgres");
    expect(s.CAREER_OS_DISTRIBUTION).toBe("store");
    expect(s.CLAUDE_REQUIRES_KEY).toBe("true");
  });

  it("guards the database with a lock next to it, which also tells a second launch where the app answers", () => {
    const { local } = tempProfile();
    const db = path.join(local, "db");
    expect(lockFile(db)).toBe(path.join(local, "career-os.lock"));
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(lockFile(db), "1234\nhttp://localhost:3301\n");
    expect(readLock(lockFile(db))).toEqual({ pid: 1234, url: "http://localhost:3301" });
    fs.writeFileSync(lockFile(db), "987"); // written by Store versions up to 0.1.7
    expect(readLock(lockFile(db))).toEqual({ pid: 987, url: null });
    expect(readLock(path.join(local, "absent.lock"))).toBeNull();
  });
});

describe("Microsoft Store install: settings next to the user's data", () => {
  it("keeps what the user changed, refreshes what the install owns (the database's folder included)", () => {
    const owned = homeSettings({ home: "/h", local: "/l", appPort: 3301, dbPort: 5501 });
    const merged = mergeSettings({ AI_OUTPUT_LANGUAGE: "en", APP_PORT: "9999", EXTRA: "1", CAREER_OS_DB_DIR: "/h/data/db" }, owned);
    expect(merged.AI_OUTPUT_LANGUAGE).toBe("en");
    expect(merged.EXTRA).toBe("1");
    expect(merged.APP_PORT).toBe("3301");
    expect(merged.CAREER_OS_DB_DIR).toBe(owned.CAREER_OS_DB_DIR);
    expect(mergeSettings({}, owned).TZ).toBe("Europe/Paris");
  });

  it("reads back what it writes (comments, quotes, Windows line endings)", () => {
    expect(parseEnv('# note\r\nA=1\r\nB="deux mots"\r\n\r\nC=\'x=y\'\r\nbroken\r\n')).toEqual({ A: "1", B: "deux mots", C: "x=y" });
    const values = { APP_PORT: "3300", DOCUMENTS_ROOT: "C:/Users/a b/Documents/CareerOS/documents" };
    expect(parseEnv(serializeEnv(values))).toEqual(values);
  });

  it("creates the library and the computer's folder on first launch, and keeps its ports afterwards", async () => {
    const { home, local } = tempProfile();
    const first = await prepareHome(home, local);
    expect(fs.existsSync(path.join(home, "documents", "Cover Letters"))).toBe(true);
    expect(fs.existsSync(path.join(home, "data", "app"))).toBe(true);
    expect(fs.existsSync(path.join(home, "data", "db"))).toBe(false);
    expect(fs.existsSync(local)).toBe(true);
    const readme = fs.readFileSync(path.join(home, "LISEZ-MOI.txt"), "utf8");
    expect(readme).toContain(path.join(local, "db"));
    expect(readme).toContain("Restaurer");
    expect(readme).toContain("\r\n");
    expect(fs.readFileSync(path.join(local, "LISEZ-MOI.txt"), "utf8")).toContain(home);
    expect(first.file).toBe(settingsFile(home));
    expect(first.values.CAREER_OS_DB_DIR).toBe(path.join(local, "db").replace(/\\/g, "/"));
    const appPort = Number(first.values.APP_PORT);
    expect(appPort).toBeGreaterThanOrEqual(APP_PORTS[0]);
    expect(appPort).toBeLessThanOrEqual(APP_PORTS[1]);
    expect(Number(first.values.DB_PORT)).toBeGreaterThanOrEqual(DB_PORTS[0]);

    fs.appendFileSync(first.file, "AI_OUTPUT_LANGUAGE=en\n");
    const again = await prepareHome(home, local);
    expect(again.values.APP_PORT).toBe(first.values.APP_PORT);
    expect(again.values.AI_OUTPUT_LANGUAGE).toBe("en");
  });

  it("rewrites the read-me of an older install, which said the database was in Documents", async () => {
    const { home, local } = tempProfile();
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, "LISEZ-MOI.txt"), "\uFEFFCareer OS : tes données\r\ndata\\db\\    ta base\r\n");
    await prepareHome(home, local);
    const readme = fs.readFileSync(path.join(home, "LISEZ-MOI.txt"), "utf8");
    expect(readme).not.toContain("data\\db\\");
    expect(readme).toContain(local);
  });

  it("moves to another port when another program took it, and saves the change", async () => {
    const { home, local } = tempProfile();
    const { values } = await prepareHome(home, local);
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(Number(values.APP_PORT), "127.0.0.1", () => resolve()));
    try {
      const moved = await ensureFreePorts(home, values, local);
      expect(moved.APP_PORT).not.toBe(values.APP_PORT);
      expect(moved.APP_URL).toBe(`http://localhost:${moved.APP_PORT}`);
      expect(moved.CAREER_OS_DB_DIR).toBe(values.CAREER_OS_DB_DIR);
      expect(parseEnv(fs.readFileSync(settingsFile(home), "utf8")).APP_PORT).toBe(moved.APP_PORT);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
    const free = await ensureFreePorts(home, parseEnv(fs.readFileSync(settingsFile(home), "utf8")), local);
    expect(free.DB_PORT).toBe(values.DB_PORT);
  });
});

describe("moving the database out of Documents, once", () => {
  const paths = () => {
    const { home, local } = tempProfile();
    return { from: path.join(home, "data", "db"), to: path.join(local, "db"), local };
  };
  const leftovers = (to: string) => [`${to}.copie`, `${to}.ancien-emplacement.txt`].filter((p) => fs.existsSync(p));

  it("copies every file and empty folder, checks them, then deletes the old folder", () => {
    const { from, to } = paths();
    const before = fakeDatabase(from);
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "moved" });
    expect(snapshot(to)).toEqual(before);
    expect(before["pg_wal/archive_status/"]).toBe("");
    expect(fs.existsSync(from)).toBe(false);
    expect(leftovers(to)).toEqual([]);
    // Next launches: nothing left to do.
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "none" });
  });

  it("keeps a real database working: rows written before the move are read after it", async () => {
    const { from, to } = paths();
    fs.mkdirSync(from, { recursive: true });
    const before = await PGlite.create(from);
    await before.exec("create table notes (body text not null); insert into notes values ('Candidature envoyée');");
    await before.close();
    expect(moveDatabase({ from, to }).status).toBe("moved");
    const after = await PGlite.create(to);
    const { rows } = await after.query<{ body: string }>("select body from notes");
    expect(rows.map((r) => r.body)).toEqual(["Candidature envoyée"]);
    await after.close();
  }, 60_000);

  it("does nothing for a new install, and tidies the empty folder an older one created", () => {
    const { from, to } = paths();
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "none" });
    fs.mkdirSync(from, { recursive: true });
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "none" });
    expect(fs.existsSync(from)).toBe(false);
  });

  it("never replaces a database already at the new place, nor deletes either one when they differ", () => {
    const { from, to } = paths();
    const old = fakeDatabase(from, "ancienne");
    const current = fakeDatabase(to, "actuelle");
    const result = moveDatabase({ from, to });
    expect(result.status).toBe("kept-both");
    expect(result.dir).toBe(to);
    expect(snapshot(from)).toEqual(old);
    expect(snapshot(to)).toEqual(current);
  });

  it("finishes a move stopped after the copy (same bytes at both places)", () => {
    const { from, to } = paths();
    const content = fakeDatabase(from);
    fakeDatabase(to);
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "moved" });
    expect(fs.existsSync(from)).toBe(false);
    expect(snapshot(to)).toEqual(content);
  });

  it("deletes the old folder at a later launch when it could not be deleted at first (the note names it)", () => {
    const { from, to } = paths();
    fakeDatabase(from, "ancienne");
    fakeDatabase(to, "utilisée depuis");
    fs.writeFileSync(`${to}.ancien-emplacement.txt`, `${from}\n`);
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "moved" });
    expect(fs.existsSync(from)).toBe(false);
    expect(leftovers(to)).toEqual([]);
  });

  it("starts over from a copy left half-done, and ignores a note whose move did not go through", () => {
    const { from, to } = paths();
    const content = fakeDatabase(from);
    fs.mkdirSync(`${to}.copie/base`, { recursive: true });
    fs.writeFileSync(`${to}.copie/base/partiel`, "x");
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(`${to}.ancien-emplacement.txt`, `${from}\n`);
    expect(moveDatabase({ from, to })).toEqual({ dir: to, status: "moved" });
    expect(snapshot(to)).toEqual(content);
    expect(leftovers(to)).toEqual([]);
  });

  it("keeps using the old folder when the move fails, with nothing deleted", () => {
    const { from, to } = paths();
    const content = fakeDatabase(from);
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(to, "autre chose.txt"), "pas une base");
    const result = moveDatabase({ from, to });
    expect(result.status).toBe("failed");
    expect(result.dir).toBe(from);
    expect(result.detail).toMatch(/ne contient pas de base/);
    expect(snapshot(from)).toEqual(content);
    expect(leftovers(to)).toEqual([]);
  });

  it("never deletes a folder that is the new place under another spelling or behind a link", () => {
    const { from, to, local } = paths();
    const content = fakeDatabase(to);
    expect(moveDatabase({ from: to, to })).toEqual({ dir: to, status: "none" });
    if (process.platform === "win32") expect(moveDatabase({ from: to.toUpperCase(), to }).status).toBe("none");
    const link = path.join(local, "lien");
    fs.symlinkSync(to, link, "junction");
    expect(moveDatabase({ from: link, to }).status).toBe("none");
    expect(moveDatabase({ from: to, to: link }).status).toBe("none");
    expect(snapshot(to)).toEqual(content);
    expect(fs.existsSync(from)).toBe(false);
  });
});
