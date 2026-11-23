/**
 * Application kit: stored in `opportunities.details.kit`, next to the posting details (the MCP contracts of
 * create/update_opportunity do not change). "J'ai postulé" attaches the chosen documents, notes the channel and moves
 * the application to Applied (existing follow-up rules apply).
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { opportunities } from "@/server/db/schema";
import { kitSchema, KIT_CHANNEL_LABEL, parseKit, type Kit } from "@/lib/kit";
import { familyOf } from "@/lib/constants";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";
import { attachDocument } from "./documents";
import { changeStatus, getOpportunity } from "./opportunities";
import { addEvent } from "./timeline";

export async function updateKit(id: string, raw: unknown, ctx: Ctx) {
  const patch = kitSchema.partial().parse(raw);
  const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!row) throw notFound("Opportunity");
  const next: Kit = { ...(parseKit(row.details) ?? {}), ...patch };
  await db
    .update(opportunities)
    .set({ details: { ...((row.details as Record<string, unknown>) ?? {}), kit: next } as typeof opportunities.$inferInsert.details })
    .where(eq(opportunities.id, id));
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "UPDATE", summary: "Kit de candidature" }, ctx);
  return next;
}

export async function applyWithKit(id: string, ctx: Ctx) {
  const opp = await getOpportunity(id);
  const kit = parseKit(opp.details) ?? {};
  const attached = new Set(opp.documents.map((d) => d.version.id));
  const names: string[] = [];
  for (const [versionId, role] of [
    [kit.cvVersionId, "CV"],
    [kit.letterVersionId, "COVER_LETTER"],
  ] as const) {
    if (!versionId) continue;
    if (!attached.has(versionId)) await attachDocument({ opportunityId: id, documentVersionId: versionId, role }, ctx);
    const doc = opp.documents.find((d) => d.version.id === versionId);
    names.push(doc ? `${doc.document.name} v${doc.version.version}` : role === "CV" ? "CV" : "lettre");
  }
  const channel = kit.channel ? KIT_CHANNEL_LABEL[kit.channel] : null;
  await addEvent(db, { opportunityId: id, type: "NOTE", title: `Candidature envoyée${channel ? ` via ${channel}` : ""}`, body: names.length ? `Avec : ${names.join(", ")}.` : null }, ctx);
  const status = familyOf(opp.type) === "EDUCATION" ? "APPLICATION_SUBMITTED" : "APPLIED";
  return changeStatus(id, { status }, ctx);
}
