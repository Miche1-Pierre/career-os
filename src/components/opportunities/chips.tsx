"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { tagColorClass } from "@/components/app/badges";
import { useAppData } from "@/components/app/app-data";
import { STAGE_CATEGORY_META, type StageCategory } from "@/lib/constants";
import { formatISODate, type DueKind } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { nextActionOf, type NextActionSource } from "./applications-params";

const isTruncated = (el: HTMLElement | null) => !!el && el.scrollWidth > el.clientWidth + 1;

/**
 * Chip that never overflows its cell: the label is cut with an ellipsis and the full text shows in a tooltip
 * (only when cut, unless `details` adds something worth showing anyway).
 */
export function TruncatedChip({ text, details, icon, className }: { text: string; details?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && (!!details || isTruncated(ref.current)))}>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-lg px-1.5 text-xs font-medium whitespace-nowrap tabular-nums", className)}>
          {icon}
          <span ref={ref} className="min-w-0 truncate">
            {text}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          <div>{text}</div>
          {details && <div className="opacity-80">{details}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function StageChip({ label, category, className }: { label: string; category: StageCategory; className?: string }) {
  const meta = STAGE_CATEGORY_META[category];
  return <TruncatedChip text={label} icon={<span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />} className={cn("gap-1.5", meta.badge, className)} />;
}

// Same tones as DueBadge: overdue dates are deliberately loud.
const DUE_TONE: Record<DueKind, string> = {
  overdue: "bg-linear-to-b from-warning-400 to-warning-500 text-white [text-shadow:0_1px_1.5px_rgba(0,0,0,0.08)] dark:from-red-500 dark:to-red-600",
  today: "bg-info-100 text-info-900",
  tomorrow: "bg-info-50 text-info-800",
  soon: "bg-info-50 text-info-800",
  week: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300",
  later: "bg-transparent px-0 text-muted-foreground",
};

/** Deadline, follow-up or expected answer, whichever comes next. */
export function NextActionChip({ row, hideEmpty, className }: { row: NextActionSource; hideEmpty?: boolean; className?: string }) {
  const { today, dateLocale } = useAppData();
  const action = nextActionOf(row, today, dateLocale);
  if (!action) return hideEmpty ? null : <span className="text-sm text-faint">—</span>;
  return (
    <TruncatedChip
      text={action.text}
      details={`${formatISODate(action.date, "long", dateLocale)}${action.time ? ` à ${action.time}` : ""}`}
      icon={action.tone === "overdue" ? <AlertTriangle className="size-3 shrink-0" /> : <CalendarClock className="size-3 shrink-0 opacity-70" />}
      className={cn(DUE_TONE[action.tone], className)}
    />
  );
}

/** Up to `max` tags on one line; each one shrinks with an ellipsis, all of them are listed in the tooltip. */
export function TagChips({ tags, max = 2, className }: { tags: string[]; max?: number; className?: string }) {
  const { tags: known } = useAppData();
  const rowRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.length - shown.length;
  const cut = () => !!rowRef.current && [...rowRef.current.querySelectorAll<HTMLElement>("[data-tag-label]")].some((el) => isTruncated(el));
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && (hidden > 0 || cut()))}>
      <TooltipTrigger asChild>
        <span ref={rowRef} className={cn("flex max-w-full min-w-0 items-center gap-1", className)}>
          {shown.map((tag) => (
            <span key={tag} className={cn("inline-flex h-5 min-w-0 items-center rounded-lg px-1.5 text-xs font-medium whitespace-nowrap", tagColorClass(known.find((t) => t.name.toLowerCase() === tag.toLowerCase())?.color))}>
              <span data-tag-label className="min-w-0 truncate">
                {tag}
              </span>
            </span>
          ))}
          {hidden > 0 && <span className="shrink-0 text-xs text-faint">+{hidden}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tags.join(", ")}</TooltipContent>
    </Tooltip>
  );
}
