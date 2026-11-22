"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}
type Usage = { available: true; fiveHour: UsageWindow | null; sevenDay: UsageWindow | null; plan: string | null } | { available: false; reason: string };

const REFRESH_MS = 120_000;

function tone(pct: number) {
  return pct >= 95 ? "bg-destructive" : pct >= 80 ? "bg-warning-500" : "bg-highlight-500";
}

function resetLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `réinitialisation à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : `réinitialisation ${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Bar({ label, w }: { label: string; w: UsageWindow }) {
  const pct = Math.max(0, Math.min(100, Math.round(w.utilization)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{pct} %</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted-background">
        <div className={cn("h-full rounded-full transition-[width]", tone(pct))} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Claude subscription usage (5-hour session and week), refreshed every 2 minutes, with a warning near the limit. */
export function ClaudeUsage() {
  const { state } = useSidebar();
  const [usage, setUsage] = useState<Usage | null>(null);
  const warned = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/ai/usage");
        const body = (await res.json()) as { data?: Usage };
        if (!alive || !body.data) return;
        setUsage(body.data);
        if (body.data.available) {
          for (const [key, label, w] of [
            ["5h", "la session de 5 h", body.data.fiveHour],
            ["7d", "la semaine", body.data.sevenDay],
          ] as const) {
            if (!w) continue;
            const level = w.utilization >= 95 ? "95" : w.utilization >= 80 ? "80" : null;
            if (level && !warned.current.has(`${key}:${level}:${w.resetsAt}`)) {
              warned.current.add(`${key}:${level}:${w.resetsAt}`);
              toast.warning(`Forfait Claude : ${Math.round(w.utilization)} % de ${label} utilisés`, { description: resetLabel(w.resetsAt) });
            }
          }
        }
      } catch {
        /* offline: keep the last value */
      }
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (state === "collapsed" || !usage) return null;
  if (!usage.available) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="truncate px-2 text-[11px] text-faint">Quota Claude indisponible</p>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-64">
          {usage.reason}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="space-y-1.5 px-2 py-1">
          {usage.fiveHour && <Bar label="Session (5 h)" w={usage.fiveHour} />}
          {usage.sevenDay && <Bar label="Semaine" w={usage.sevenDay} />}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64 space-y-0.5">
        <p>Forfait Claude{usage.plan ? ` (${usage.plan})` : ""}</p>
        {usage.fiveHour && <p>Session : {resetLabel(usage.fiveHour.resetsAt)}</p>}
        {usage.sevenDay && <p>Semaine : {resetLabel(usage.sevenDay.resetsAt)}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
