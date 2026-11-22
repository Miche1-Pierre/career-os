"use client";

import { useAppData } from "@/components/app/app-data";
import { ACTOR_LABEL, type Actor } from "@/lib/constants";
import { formatInstant } from "@/lib/dates";
import type { AuditLog } from "@/server/db/schema";

const FIELD_LABEL: Record<string, string> = {
  status: "Statut",
  nextFollowUpAt: "Prochaine relance",
  deadline: "Date limite",
  organizationId: "Organisation",
  appliedAt: "Date de candidature",
  priority: "Priorité",
  tags: "Tags",
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "a créé",
  UPDATE: "a modifié",
  DELETE: "a supprimé",
  PURGE: "a supprimé définitivement",
  RESTORE: "a restauré",
  ARCHIVE: "a archivé",
  UNARCHIVE: "a désarchivé",
  STATUS_CHANGE: "a changé le statut",
  RENAME: "a renommé",
  CAPTURE: "a capturé",
  ANALYSIS: "a analysé",
  ANALYSIS_SUBMITTED: "a soumis une analyse",
  CLEAR_ANALYSIS: "a effacé l’analyse",
  ATTACH_DOCUMENT: "a joint un document",
  DETACH_DOCUMENT: "a retiré un document",
  NEW_VERSION: "a ajouté une version",
  EDIT_VERSION: "a modifié une version",
  DELETE_VERSION: "a supprimé une version",
  LINK_CONTACT: "a lié un contact",
  UNLINK_CONTACT: "a délié un contact",
  LOG_EVENT: "a ajouté un événement",
  EDIT_EVENT: "a modifié un événement",
  DELETE_EVENT: "a supprimé un événement",
  FOLLOW_UP: "a enregistré une relance",
  SCHEDULE_FOLLOW_UP: "a planifié une relance",
  REORDER: "a réordonné",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "∅";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 120);
}

export function DetailHistory({ audit }: { audit: AuditLog[] }) {
  const { timezone, dateLocale, userName } = useAppData();
  if (!audit.length) return <p className="text-sm text-muted-foreground">Aucune modification enregistrée pour l’instant.</p>;
  return (
    <ol className="space-y-2">
      {audit.map((a) => {
        const who = a.actor === "USER" ? userName || "Vous" : ACTOR_LABEL[a.actor as Actor] ?? a.actor;
        return (
          <li key={a.id} className="rounded-xl border border-separator bg-background px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{who}</span> <span className="text-muted-foreground">{ACTION_LABEL[a.action] ?? a.action.toLowerCase().replace(/_/g, " ")}</span>
                {a.summary && <span className="text-muted-foreground"> — {a.summary}</span>}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatInstant(a.createdAt, { timeZone: timezone, locale: dateLocale })}</span>
            </div>
            {a.changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {a.changes.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground/80">{FIELD_LABEL[c.field] ?? c.field}</span> : {show(c.from)} → {show(c.to)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
