import { and, desc, eq } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import { auditLogs, type AuditChange } from "@/server/db/schema";
import type { Ctx } from "@/server/context";

export type AuditEntity = "opportunity" | "organization" | "contact" | "document" | "interview" | "task" | "inbox" | "settings" | "stage" | "tag";

export async function logAudit(
  tx: DBOrTx,
  entry: { entityType: AuditEntity; entityId: string; action: string; changes?: AuditChange[]; summary?: string | null },
  ctx: Ctx,
) {
  await tx.insert(auditLogs).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changes: entry.changes ?? [],
    summary: entry.summary ?? null,
    actor: ctx.actor,
  });
}

const LONG_TEXT_FIELDS = new Set(["description", "notes", "summary", "preparation", "feedback", "body", "rawText"]);

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

/** Field-level diff for audit logs. Long texts are recorded as "changed" without their content. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const a = normalize(before[field]);
    const b = normalize(after[field]);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (LONG_TEXT_FIELDS.has(field)) changes.push({ field, from: a ? "(text)" : null, to: b ? "(text)" : null });
    else changes.push({ field, from: a, to: b });
  }
  return changes;
}

export async function listAudit(entityType: AuditEntity, entityId: string, limit = 100) {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
