import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_SCHEMA_VERSION } from "@/lib/constants";
import { USER } from "@/server/context";
import * as s from "@/server/db/schema";
import { startChat } from "@/server/chat/chat";
import { createBackup, exportAll, importAll, parseExport, restoreBackup } from "@/server/services/data-transfer";
import { createTestDb, useTempStorage } from "./helpers/db";

// Claude Code is replaced by a stand-in: it does not know the sessions of a conversation restored from a backup made
// on another computer, and answers otherwise.
const calls: (string | null)[] = [];
let failure: string | null = null;
vi.mock("../bridge/claude-runner.mjs", () => ({
  streamClaude: (options: { sessionId?: string | null }, onEvent: (event: Record<string, unknown>) => void) => {
    calls.push(options.sessionId ?? null);
    if (failure) onEvent({ type: "error", message: failure });
    else if (options.sessionId) onEvent({ type: "error", message: `Claude Code stopped (exit 1) No conversation found with session ID: ${options.sessionId}` });
    else {
      onEvent({ type: "session", sessionId: "nouvelle-session" });
      onEvent({ type: "text", delta: "Bonjour" });
      onEvent({ type: "done", text: "Bonjour", sessionId: "nouvelle-session", model: "sonnet", costUsd: 0, durationMs: 5 });
    }
    return { done: Promise.resolve(), cancel: () => {} };
  },
}));

const saved = { ...process.env };
afterAll(() => {
  process.env = { ...saved };
});

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
const startedAt = new Date("2026-11-20T09:30:00.000Z");

/** One conversation with the assistant: a question, an answer that used a tool, a Claude session to resume. */
async function addConversation(db: Db) {
  const [thread] = await db.insert(s.chatThreads).values({ title: "Relance Zefir", sessionId: "session-du-premier-pc", createdAt: startedAt, updatedAt: startedAt }).returning();
  await db.insert(s.chatMessages).values([
    { threadId: thread.id, role: "user", content: "Rédige la relance pour Zefir", context: { path: "/applications", mentions: [] }, createdAt: startedAt },
    { threadId: thread.id, role: "assistant", content: "Voici un brouillon…", tools: [{ name: "render_email_template", summary: "Relance" }], model: "sonnet", costUsd: 0.01, durationMs: 1200, createdAt: new Date(startedAt.getTime() + 1000) },
  ]);
  return thread;
}

describe("conversations with the assistant in exports and backups", () => {
  beforeEach(() => {
    useTempStorage();
  });

  it("exports them and restores them on another computer, with their Claude session and tool calls", async () => {
    const { db } = await createTestDb();
    const thread = await addConversation(db);
    const file = await exportAll();
    expect(file.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(file.counts.chatThreads).toBe(1);
    expect(file.counts.chatMessages).toBe(2);

    const { db: other } = await createTestDb();
    const counts = await importAll(JSON.parse(JSON.stringify(file)), "replace", USER);
    expect(counts.chatThreads).toBe(1);
    expect(counts.chatMessages).toBe(2);
    const [restored] = await other.select().from(s.chatThreads);
    expect(restored).toMatchObject({ id: thread.id, title: "Relance Zefir", sessionId: "session-du-premier-pc" });
    expect(restored.createdAt).toEqual(startedAt);
    const messages = await other.select().from(s.chatMessages).where(eq(s.chatMessages.threadId, thread.id)).orderBy(s.chatMessages.createdAt);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].context).toEqual({ path: "/applications", mentions: [] });
    expect(messages[1].tools).toEqual([{ name: "render_email_template", summary: "Relance" }]);
    // Merging the same file again adds nothing.
    expect(await importAll(JSON.parse(JSON.stringify(file)), "merge", USER)).toMatchObject({ chatThreads: 0, chatMessages: 0 });
  });

  it("brings them back when a daily backup is restored", async () => {
    const { db } = await createTestDb();
    const thread = await addConversation(db);
    const backup = await createBackup("manual");
    expect(backup.counts.chatMessages).toBe(2);
    await db.insert(s.chatMessages).values({ threadId: thread.id, role: "user", content: "Message écrit après la sauvegarde" });
    await restoreBackup(backup.name, USER);
    expect(await db.select().from(s.chatMessages)).toHaveLength(2);
  });

  it("keeps today's conversations when an older backup (made before they were saved) is restored", async () => {
    const { db } = await createTestDb();
    await addConversation(db);
    const current = await exportAll();
    const { chatThreads, chatMessages, ...older } = current.data;
    expect(chatThreads).toHaveLength(1);
    expect(chatMessages).toHaveLength(2);
    const v5 = JSON.parse(JSON.stringify({ ...current, schemaVersion: 5, data: older }));
    expect(parseExport(JSON.parse(JSON.stringify(v5))).schemaVersion).toBe(EXPORT_SCHEMA_VERSION);

    const counts = await importAll(v5, "replace", USER);
    expect(counts.chatThreads).toBe(0);
    expect(counts.opportunities).toBe(current.counts.opportunities);
    expect(await db.select().from(s.chatThreads)).toHaveLength(1);
    expect(await db.select().from(s.chatMessages)).toHaveLength(2);
  });
});

describe("continuing a restored conversation", () => {
  beforeEach(() => {
    useTempStorage();
    process.env.AI_PROVIDER = "claude-code";
    process.env.CLAUDE_CODE_MODE = "cli";
    delete process.env.CLAUDE_REQUIRES_KEY;
    calls.length = 0;
    failure = null;
  });

  const run = async (threadId: string) => {
    const stream = await startChat({ threadId, message: "Et maintenant ?" }, "http://localhost:3000");
    const text = await new Response(stream).text();
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; text?: string; message?: string });
  };

  it("starts a new Claude session when this computer does not have the old one, instead of failing", async () => {
    const { db } = await createTestDb();
    const thread = await addConversation(db);
    const events = await run(thread.id);
    expect(calls).toEqual(["session-du-premier-pc", null]);
    expect(events.find((e) => e.type === "error")).toBeUndefined();
    expect(events.find((e) => e.type === "done")?.text).toBe("Bonjour");
    const [after] = await db.select().from(s.chatThreads).where(eq(s.chatThreads.id, thread.id));
    expect(after.sessionId).toBe("nouvelle-session");
    const messages = await db.select().from(s.chatMessages).where(eq(s.chatMessages.threadId, thread.id)).orderBy(s.chatMessages.createdAt);
    expect(messages).toHaveLength(4);
    expect(messages.at(-1)).toMatchObject({ role: "assistant", content: "Bonjour", error: null });
  });

  it("does not retry other errors", async () => {
    const { db } = await createTestDb();
    const thread = await addConversation(db);
    failure = "rate limit reached (429)";
    const events = await run(thread.id);
    expect(calls).toEqual(["session-du-premier-pc"]);
    expect(events.find((e) => e.type === "error")?.message).toMatch(/très sollicité/);
    const [after] = await db.select().from(s.chatThreads).where(eq(s.chatThreads.id, thread.id));
    expect(after.sessionId).toBe("session-du-premier-pc");
  });
});
