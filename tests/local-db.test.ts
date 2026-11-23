import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { portInUse, startLocalDb } from "../scripts/local-db.mjs";

describe("local database (no Docker)", () => {
  it("serves a folder over the PostgreSQL protocol, refuses a second owner and keeps the data across restarts", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-localdb-"));
    const port = 56000 + Math.floor(Math.random() * 2000);
    const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;

    const first = await startLocalDb({ dir, port });
    expect(await portInUse(port)).toBe(true);
    // A second server on the same folder/port is refused (the files are never opened twice).
    await expect(startLocalDb({ dir, port })).rejects.toThrow(/déjà utilisé/);

    let sql = postgres(url, { max: 1, onnotice: () => {} });
    await sql`create table notes (id serial primary key, body text not null, at timestamptz default now())`;
    await sql`insert into notes (body) values (${"Candidature envoyée"})`;
    await sql.end();
    await first.stop();
    expect(await portInUse(port)).toBe(false);

    const second = await startLocalDb({ dir, port });
    sql = postgres(url, { max: 1, onnotice: () => {} });
    const rows = await sql<{ body: string }[]>`select body from notes`;
    expect(rows.map((r) => r.body)).toEqual(["Candidature envoyée"]);
    await sql.end();
    await second.stop();
  }, 120_000);
});
