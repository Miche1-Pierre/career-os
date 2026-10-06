"use client";

import { AlertTriangle, CalendarClock, CircleDashed, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  OPPORTUNITY_TYPE_META,
  PRIORITY_META,
  STAGE_CATEGORY_META,
  type OpportunityType,
  type Priority,
  type StageCategory,
} from "@/lib/constants";
import { dueStatus, formatISODate, type DueKind } from "@/lib/dates";
import type { FieldProvenance } from "@/lib/schemas";
import { useAppData } from "./app-data";

export function StageBadge({ label, category, className, size = "sm" }: { label: string; category: StageCategory; className?: string; size?: "sm" | "md" }) {
  const meta = STAGE_CATEGORY_META[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        size === "md" ? "h-6 rounded-[9px] px-[9px] heading-xs" : "h-5 rounded-lg px-1.5 text-xs font-medium",
        meta.badge,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {label}
    </span>
  );
}

export function CategoryDot({ category, className }: { category: StageCategory; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STAGE_CATEGORY_META[category].dot, className)} />;
}

export function PriorityDot({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === "NORMAL" || priority === "LOW") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-block size-2 shrink-0 rounded-full", PRIORITY_META[priority].dot, className)} aria-label={`${PRIORITY_META[priority].label} priority`} />
      </TooltipTrigger>
      <TooltipContent>{PRIORITY_META[priority].label} priority</TooltipContent>
    </Tooltip>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.badge)}>
      <span className={cn("size-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function TypeBadge({ type, className }: { type: OpportunityType; className?: string }) {
  const meta = OPPORTUNITY_TYPE_META[type];
  return (
    <Badge variant="outline" size="sm" className={cn("font-normal", className)}>
      {meta.label}
    </Badge>
  );
}

const DUE_CLASS: Record<DueKind, string> = {
  overdue: "bg-linear-to-b from-warning-400 to-warning-500 text-white [text-shadow:0_1px_1.5px_rgba(0,0,0,0.08)] dark:from-red-500 dark:to-red-600",
  today: "bg-info-100 text-info-900",
  tomorrow: "bg-info-50 text-info-800",
  soon: "bg-info-50 text-info-800",
  week: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300",
  later: "bg-transparent px-0! text-muted-foreground",
};

/** Deadline / due date badge. Overdue dates are deliberately loud. */
export function DueBadge({ date, time, prefix, className, showDate = false }: { date: string; time?: string | null; prefix?: string; className?: string; showDate?: boolean }) {
  const { today, dateLocale } = useAppData();
  const status = dueStatus(date, today);
  const label = status.kind === "later" && !showDate ? formatISODate(date, "dayMonth", dateLocale) : status.label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-lg px-1.5 text-xs font-medium whitespace-nowrap tabular-nums", DUE_CLASS[status.kind], className)}>
          {status.kind === "overdue" ? <AlertTriangle className="size-3" /> : <CalendarClock className="size-3 opacity-70" />}
          {prefix ? `${prefix} ` : ""}
          {label}
          {showDate && status.kind !== "later" ? ` · ${formatISODate(date, "dayMonth", dateLocale)}` : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {formatISODate(date, "long", dateLocale)}
        {time ? ` · ${time}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

// Sparkle chip colors (tinted 50 surface, 700 label).
const TAG_COLORS: Record<string, string> = {
  slate: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300",
  red: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  amber: "bg-golden-50 text-golden-800 dark:bg-golden-950 dark:text-golden-300",
  green: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  teal: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  sky: "bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  pink: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
};
export const TAG_COLOR_NAMES = Object.keys(TAG_COLORS);

export function tagColorClass(color: string | null | undefined) {
  return TAG_COLORS[color ?? "slate"] ?? TAG_COLORS.slate;
}

export function TagBadge({ name, className, onRemove }: { name: string; className?: string; onRemove?: () => void }) {
  const { tags } = useAppData();
  const color = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.color;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-lg px-1.5 text-xs font-medium whitespace-nowrap", tagColorClass(color), className)}>
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-0.5 rounded-md opacity-60 hover:opacity-100" aria-label={`Remove ${name}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function TagList({ tags, max = 4, className }: { tags: string[]; max?: number; className?: string }) {
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((t) => (
        <TagBadge key={t} name={t} />
      ))}
      {tags.length > max && <span className="text-xs text-faint">+{tags.length - max}</span>}
    </span>
  );
}

/** Small marker telling where a value comes from (AI extraction, inference, user). */
export function ProvenanceMark({ provenance, className }: { provenance?: FieldProvenance | null; className?: string }) {
  if (!provenance || provenance.source === "USER_ENTERED") return null;
  const inferred = provenance.source === "INFERRED";
  const unverified = provenance.verified === false;
  const who = provenance.by === "CLAUDE" ? "Claude" : provenance.by === "AI" ? "AI" : provenance.by === "DEMO" ? "Demo" : "Import";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm align-middle",
            inferred ? "text-golden-700 dark:text-golden-400" : unverified ? "text-orange-600 dark:text-orange-400" : "text-highlight-500",
            className,
          )}
          aria-label={inferred ? "Inferred value" : "Extracted value"}
        >
          {inferred ? <Wand2 className="size-3" /> : <Sparkles className="size-3" />}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <div className="space-y-1 text-xs">
          <div className="font-medium">
            {inferred ? "Inferred" : "Extracted"} by {who}
            {provenance.confidence ? ` · ${provenance.confidence.toLowerCase()} confidence` : ""}
          </div>
          {provenance.evidence && <div className="italic opacity-90">“{provenance.evidence}”</div>}
          {unverified && <div className="text-golden-300 dark:text-golden-800">Not found verbatim in the source — double-check.</div>}
          {inferred && <div className="opacity-80">Deduced, not stated explicitly. Edit it to confirm.</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function UnknownValue({ label = "Unknown" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-faint italic">
      <CircleDashed className="size-3" />
      {label}
    </span>
  );
}
