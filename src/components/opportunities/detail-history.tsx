"use client";

import { useAppData } from "@/components/app/app-data";
import { ACTOR_LABEL, type Actor } from "@/lib/constants";
import { formatInstant } from "@/lib/dates";
import type { AuditLog } from "@/server/db/schema";

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  nextFollowUpAt: "Next follow-up",
  deadline: "Deadline",
  organizationId: "Organization",
  appliedAt: "Applied on",
  priority: "Priority",
  tags: "Tags",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "∅";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 120);
}

export function DetailHistory({ audit }: { audit: AuditLog[] }) {
  const { timezone, dateLocale, userName } = useAppData();
  if (!audit.length) return <p className="text-sm text-muted-foreground">No change recorded yet.</p>;
  return (
    <ol className="space-y-2">
      {audit.map((a) => {
        const who = a.actor === "USER" ? userName || "You" : ACTOR_LABEL[a.actor as Actor] ?? a.actor;
        return (
          <li key={a.id} className="rounded-xl border border-separator bg-background px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{who}</span> <span className="text-muted-foreground">{a.action.toLowerCase().replace(/_/g, " ")}</span>
                {a.summary && <span className="text-muted-foreground"> — {a.summary}</span>}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatInstant(a.createdAt, { timeZone: timezone, locale: dateLocale })}</span>
            </div>
            {a.changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {a.changes.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground/80">{FIELD_LABEL[c.field] ?? c.field}</span>: {show(c.from)} → {show(c.to)}
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
