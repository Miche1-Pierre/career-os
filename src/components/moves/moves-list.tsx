"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Home, MapPin, Plane, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import type { ComboOption } from "@/components/app/entity-combobox";
import { useAppData } from "@/components/app/app-data";
import { MOVE_STATUS_LABEL } from "@/lib/relocation";
import { formatISODate } from "@/lib/dates";
import type { MoveView } from "@/server/services/moves";
import { cn } from "@/lib/utils";
import { MoveFormDialog } from "./move-form";
import { money, savingsTone, signedMoney } from "./format";

export function MovesList({ moves, opportunities, autoCreate }: { moves: MoveView[]; opportunities: ComboOption[]; autoCreate?: boolean }) {
  const [open, setOpen] = useState(!!autoCreate);
  const { dateLocale } = useAppData();
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Installations"
        description="Tout pour s'installer après une offre : logement, budget, puis démarches et voyage."
        actions={
          <Button variant="highlight" onClick={() => setOpen(true)}>
            <Plus /> Nouvelle installation
          </Button>
        }
      />
      {moves.length === 0 ? (
        <EmptyState icon={Plane} title="Aucune installation" description="Crée-en une depuis une offre acceptée (bouton sur la candidature) ou ici. Tu peux aussi demander dans le chat : « J'ai signé chez X, prépare mon installation »." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {moves.map((m) => {
            const chosen = m.summary.chosen ? m.listings.find((l) => l.id === m.summary.chosen!.id) : null;
            const savings = chosen?.budget?.savings ?? m.summary.bestSavings?.savings ?? null;
            return (
              <Link key={m.id} href={`/moves/${m.id}`} className="group space-y-3 rounded-2xl border border-border bg-background p-4 shadow-card transition-colors hover:bg-hover dark:shadow-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate heading-base text-foreground">{m.title}</h2>
                    <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      {(m.city || m.country) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {[m.city, m.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {m.arrivalDate && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {formatISODate(m.arrivalDate, "medium", dateLocale)}
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge size="sm" variant="info">
                    {MOVE_STATUS_LABEL[m.status]}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Arrivée</div>
                    <div className="font-medium tabular-nums">{m.summary.daysUntilArrival === null ? "–" : m.summary.daysUntilArrival > 0 ? `dans ${m.summary.daysUntilArrival} j` : "arrivé"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Logement</div>
                    <div className="inline-flex items-center gap-1 font-medium">
                      <Home className="size-3.5 text-muted-foreground" />
                      {chosen ? money(chosen.total, m.currency) : `${m.summary.open} actives`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{chosen ? "Épargne" : "Meilleure épargne"}</div>
                    <div className={cn("font-medium tabular-nums", savingsTone(savings))}>{savings === null ? "–" : `${signedMoney(savings, m.currency)}/mois`}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <MoveFormDialog open={open} onOpenChange={setOpen} opportunities={opportunities} />
    </PageContainer>
  );
}
