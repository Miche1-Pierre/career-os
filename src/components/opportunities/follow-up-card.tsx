"use client";

import { useState } from "react";
import { CalendarPlus, Mail, MoreHorizontal, Pause, Play, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DueBadge } from "@/components/app/badges";
import { DateInput } from "@/components/app/fields";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { followUpAction } from "@/app/actions/opportunities";
import { formatISODate } from "@/lib/dates";
import type { OpportunityDetail } from "@/server/services/opportunities";
import { EmailDialog } from "./email-dialog";

export function FollowUpCard({ opp, closed, intervalLabel }: { opp: OpportunityDetail; closed: boolean; intervalLabel: string }) {
  const { dateLocale } = useAppData();
  const { run, pending } = useAction();
  const [emailOpen, setEmailOpen] = useState(false);
  const [date, setDate] = useState<string | null>(opp.nextFollowUpAt);
  const submitted = !!opp.appliedAt;
  const act = (action: Parameters<typeof followUpAction>[1], success: string) => run(() => followUpAction(opp.id, action), { success });

  return (
    <div className="surface px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between heading-sm text-muted-foreground">
        <span>Prochaine relance</span>
        {opp.followUpCount > 0 && <span className="text-xs font-medium tabular-nums">{opp.followUpCount} envoyée{opp.followUpCount > 1 ? "s" : ""}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-base text-foreground">
        {closed ? (
          <span className="text-muted-foreground">Clôturée</span>
        ) : opp.followUpPaused ? (
          <span className="text-muted-foreground">En pause</span>
        ) : opp.nextFollowUpAt ? (
          <>
            {formatISODate(opp.nextFollowUpAt, "medium", dateLocale)}
            <DueBadge date={opp.nextFollowUpAt} />
          </>
        ) : (
          <span className="text-muted-foreground">{submitted ? "Aucune planifiée" : "Après la candidature"}</span>
        )}
      </div>
      {!closed && submitted && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button size="xs" onClick={() => act({ action: "done" }, "Relance enregistrée — la suivante est planifiée")} disabled={pending}>
            <Send /> Faite
          </Button>
          <Button size="xs" variant="outline" onClick={() => setEmailOpen(true)}>
            <Mail /> Rédiger
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="xs" variant="outline">
                <CalendarPlus /> Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2" align="start">
              <p className="text-xs text-muted-foreground">Planifier la prochaine relance</p>
              <DateInput value={date} onChange={setDate} />
              <div className="flex flex-wrap gap-1">
                {[3, 5, 7, 10, 14, 30].map((d) => (
                  <Button key={d} size="xs" variant="secondary" onClick={() => act({ action: "schedule", days: d }, `Relance dans ${d} jours`)}>
                    +{d} j
                  </Button>
                ))}
              </div>
              <Button size="sm" className="w-full" disabled={!date} onClick={() => date && act({ action: "schedule", date }, "Relance planifiée")}>
                Enregistrer la date
              </Button>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Plus d’options de relance">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Reporter</DropdownMenuLabel>
              {[1, 3, 7].map((d) => (
                <DropdownMenuItem key={d} onClick={() => act({ action: "snooze", days: d }, `Reportée de ${d} jour${d > 1 ? "s" : ""}`)}>
                  +{d} jour{d > 1 ? "s" : ""}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {opp.followUpPaused ? (
                <DropdownMenuItem onClick={() => act({ action: "resume" }, "Relances reprises")}>
                  <Play /> Reprendre les relances
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => act({ action: "pause" }, "Relances en pause")}>
                  <Pause /> Mettre les relances en pause
                </DropdownMenuItem>
              )}
              {opp.nextFollowUpAt && <DropdownMenuItem onClick={() => act({ action: "clear" }, "Relance supprimée")}>Supprimer la prochaine relance</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {!closed && <p className="mt-1.5 text-xs text-muted-foreground">Règle : {intervalLabel}</p>}
      {emailOpen && <EmailDialog opportunityId={opp.id} open={emailOpen} onOpenChange={setEmailOpen} onSent={() => act({ action: "done", channel: "EMAIL" }, "Relance enregistrée")} />}
    </div>
  );
}
