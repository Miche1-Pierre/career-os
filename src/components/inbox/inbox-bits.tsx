"use client";

import { AlertCircle, CheckCircle2, CircleDot, Loader2, Sparkles } from "lucide-react";
import { INBOX_KIND_LABEL, type InboxKind, type InboxStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function InboxStatusBadge({ status }: { status: InboxStatus }) {
  const map: Record<InboxStatus, { label: string; className: string; icon: React.ReactNode }> = {
    NEW: { label: "Not analyzed", className: "bg-muted text-muted-foreground", icon: <CircleDot className="size-3" /> },
    QUEUED: { label: "Queued", className: "bg-highlight-50 text-highlight-700", icon: <Loader2 className="size-3 animate-spin" /> },
    PROCESSING: { label: "Analyzing…", className: "bg-highlight-50 text-highlight-700", icon: <Loader2 className="size-3 animate-spin" /> },
    READY: { label: "Ready for review", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", icon: <Sparkles className="size-3" /> },
    CONVERTED: { label: "Processed", className: "bg-muted text-muted-foreground", icon: <CheckCircle2 className="size-3" /> },
    ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground", icon: null },
    FAILED: { label: "Analysis failed", className: "bg-warning-50 text-warning-700", icon: <AlertCircle className="size-3" /> },
  };
  const m = map[status];
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-lg px-1.5 text-xs font-medium whitespace-nowrap", m.className)}>{m.icon}{m.label}</span>;
}

export function InboxKindBadge({ kind }: { kind: InboxKind }) {
  return <span className="inline-flex h-5 items-center rounded-lg border border-border px-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground">{INBOX_KIND_LABEL[kind]}</span>;
}
