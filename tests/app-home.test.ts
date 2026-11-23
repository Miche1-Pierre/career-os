import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PORTS, DB_PORTS, ensureFreePorts, homeSettings, mergeSettings, parseEnv, prepareHome, serializeEnv, settingsFile } from "../scripts/app-home.mjs";

const tempHome = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "career-os-home-")), "CareerOS");

describe("Microsoft Store install: settings next to the user's data", () => {
  it("points every folder inside the home, with forward slashes, and the database at its own port", () => {
    const s = homeSettings({ home: "C:\\Users\\Léa\\Documents\\CareerOS", appPort: 3300, dbPort: 5500 });
    expect(s.APP_URL).toBe("http://localhost:3300");
    expect(s.CAREER_OS_DB_DIR).toBe("C:/Users/Léa/Documents/CareerOS/data/db");
    expect(s.APP_DATA_DIR).toBe("C:/Users/Léa/Documents/CareerOS/data/app");
    expect(s.DATABASE_URL).toBe("postgres://postgres:postgres@127.0.0.1:5500/postgres");
    expect(s.CAREER_OS_DISTRIBUTION).toBe("store");
    expect(s.CLAUDE_REQUIRES_KEY).toBe("true");
  });

  it("keeps what the user changed, refreshes what the install owns", () => {
    const owned = homeSettings({ home: "/h", appPort: 3301, dbPort: 5501 });
    const merged = mergeSettings({ AI_OUTPUT_LANGUAGE: "en", APP_PORT: "9999", EXTRA: "1" }, owned);
    expect(merged.AI_OUTPUT_LANGUAGE).toBe("en");
    expect(merged.EXTRA).toBe("1");
    expect(merged.APP_PORT).toBe("3301");
    expect(mergeSettings({}, owned).TZ).toBe("Europe/Paris");
  });

  it("reads back what it writes (comments, quotes, Windows line endings)", () => {
    expect(parseEnv('# note\r\nA=1\r\nB="deux mots"\r\n\r\nC=\'x=y\'\r\nbroken\r\n')).toEqual({ A: "1", B: "deux mots", C: "x=y" });
    const values = { APP_PORT: "3300", DOCUMENTS_ROOT: "C:/Users/a b/Documents/CareerOS/documents" };
    expect(parseEnv(serializeEnv(values))).toEqual(values);
  });

  it("creates the library on first launch and keeps its ports afterwards", async () => {
    const home = tempHome();
    const first = await prepareHome(home);
    expect(fs.existsSync(path.join(home, "documents", "Cover Letters"))).toBe(true);
    expect(fs.existsSync(path.join(home, "data", "db"))).toBe(true);
    expect(fs.readFileSync(path.join(home, "LISEZ-MOI.txt"), "utf8")).toContain("data\\db\\");
    expect(first.file).toBe(settingsFile(home));
    const appPort = Number(first.values.APP_PORT);
    expect(appPort).toBeGreaterThanOrEqual(APP_PORTS[0]);
    expect(appPort).toBeLessThanOrEqual(APP_PORTS[1]);
    expect(Number(first.values.DB_PORT)).toBeGreaterThanOrEqual(DB_PORTS[0]);

    fs.appendFileSync(first.file, "AI_OUTPUT_LANGUAGE=en\n");
    const again = await prepareHome(home);
    expect(again.values.APP_PORT).toBe(first.values.APP_PORT);
    expect(again.values.AI_OUTPUT_LANGUAGE).toBe("en");
  });

  it("moves to another port when another program took it, and saves the change", async () => {
    const home = tempHome();
    const { values } = await prepareHome(home);
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(Number(values.APP_PORT), "127.0.0.1", () => resolve()));
    try {
      const moved = await ensureFreePorts(home, values);
      expect(moved.APP_PORT).not.toBe(values.APP_PORT);
      expect(moved.APP_URL).toBe(`http://localhost:${moved.APP_PORT}`);
      expect(parseEnv(fs.readFileSync(settingsFile(home), "utf8")).APP_PORT).toBe(moved.APP_PORT);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
    const free = await ensureFreePorts(home, parseEnv(fs.readFileSync(settingsFile(home), "utf8")));
    expect(free.DB_PORT).toBe(values.DB_PORT);
  });
});
