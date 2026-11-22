import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import { notifications, opportunities, pipelineStages, type Notification } from "@/server/db/schema";

export interface NotificationInput {
  key: string;
  kind: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  action?: Notification["action"];
}

/**
 * Notification architecture: rules emit notifications (idempotent by key). The in-app channel reads them; other
 * channels (email, Telegram, Discord, browser push) can subscribe to `emitNotification` without touching the rules.
 */
export interface NotificationChannel {
  name: string;
  deliver(notification: Notification): Promise<void>;
}

const channels: NotificationChannel[] = [];

export function registerNotificationChannel(channel: NotificationChannel) {
  if (!channels.some((c) => c.name === channel.name)) channels.push(channel);
}

export async function emitNotification(input: NotificationInput, tx: DBOrTx = db): Promise<Notification | null> {
  const [row] = await tx
    .insert(notifications)
    .values({
      key: input.key,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      action: input.action ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) {
    for (const channel of channels) {
      channel.deliver(row).catch((error) => console.error(`[notifications] channel ${channel.name} failed`, error));
    }
  }
  return row ?? null;
}

/** Active notifications, hiding those whose opportunity is closed, archived or deleted. */
export async function listNotifications(options: { limit?: number } = {}) {
  const rows = await db
    .select()
    .from(notifications)
    .where(isNull(notifications.dismissedAt))
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 50);
  const oppIds = rows.filter((r) => r.entityType === "opportunity" && r.entityId).map((r) => r.entityId!);
  if (!oppIds.length) return rows;
  const alive = await db
    .select({ id: opportunities.id, category: pipelineStages.category, deletedAt: opportunities.deletedAt, archivedAt: opportunities.archivedAt })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(inArray(opportunities.id, oppIds));
  const ok = new Set(alive.filter((a) => !a.deletedAt && !a.archivedAt && a.category !== "WON" && a.category !== "LOST").map((a) => a.id));
  return rows.filter((r) => r.entityType !== "opportunity" || !r.entityId || ok.has(r.entityId));
}

export async function markNotificationRead(id: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), isNull(notifications.readAt)));
}

export async function markAllNotificationsRead() {
  await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
}

export async function dismissNotification(id: string) {
  await db.update(notifications).set({ dismissedAt: new Date(), readAt: new Date() }).where(eq(notifications.id, id));
}

export async function dismissNotificationsFor(entityId: string, kinds?: string[], tx: DBOrTx = db) {
  await tx
    .update(notifications)
    .set({ dismissedAt: new Date() })
    .where(and(eq(notifications.entityId, entityId), isNull(notifications.dismissedAt), kinds?.length ? inArray(notifications.kind, kinds) : undefined));
}
