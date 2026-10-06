/**
 * In-process background queue (single Node process — perfect for a personal self-hosted app).
 * Captures are analyzed asynchronously: the user keeps working, the Inbox item turns "Ready for review".
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { inboxItems } from "@/server/db/schema";

interface QueueState {
  queue: string[];
  running: Set<string>;
  concurrency: number;
}

const g = globalThis as unknown as { __careerOsQueue?: QueueState };
const state: QueueState = (g.__careerOsQueue ??= { queue: [], running: new Set(), concurrency: Number(process.env.AI_CONCURRENCY ?? 2) });

export async function enqueueAnalysis(id: string) {
  if (state.queue.includes(id) || state.running.has(id)) return;
  await db.update(inboxItems).set({ status: "QUEUED", error: null }).where(eq(inboxItems.id, id));
  state.queue.push(id);
  pump();
}

function pump() {
  while (state.running.size < state.concurrency && state.queue.length) {
    const id = state.queue.shift()!;
    state.running.add(id);
    import("@/server/services/inbox")
      .then(({ runCaptureAnalysis }) => runCaptureAnalysis(id))
      .catch((error) => console.error(`[jobs] analysis of ${id} failed:`, error instanceof Error ? error.message : error))
      .finally(() => {
        state.running.delete(id);
        pump();
      });
  }
}

export function queueSnapshot() {
  return { queued: [...state.queue], running: [...state.running] };
}

/** On startup: items left QUEUED/PROCESSING by a restart are queued again. */
export async function recoverQueue() {
  const stuck = await db.select({ id: inboxItems.id }).from(inboxItems).where(inArray(inboxItems.status, ["QUEUED", "PROCESSING"]));
  for (const { id } of stuck) {
    state.queue.push(id);
  }
  if (stuck.length) console.log(`[jobs] re-queued ${stuck.length} capture(s)`);
  pump();
}
