"use client";

import { useMemo, useState } from "react";
import { Download, Home, LayoutGrid, List as ListIcon, Map as MapIcon, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/app/empty-state";
import { BOARD_STATUSES, LISTING_STATUS_META, type ListingStatus } from "@/lib/relocation";
import type { ListingView, MoveView } from "@/server/services/moves";
import { normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";
import { FIT_ORDER, money, savingsTone, signedMoney, STATUS_BADGE } from "./format";
import { HousingMap } from "./housing-map";

type Scope = "open" | "all" | "closed";

export function HousingView({ move, onOpenListing, onAdd }: { move: MoveView; onOpenListing: (id: string) => void; onAdd: () => void }) {
  const [view, setView] = useState<"list" | "board" | "map">("list");
  const [scope, setScope] = useState<Scope>("open");
  const [q, setQ] = useState("");
  const cur = move.currency;

  const rows = useMemo(() => {
    const needle = normalizeText(q);
    return move.listings
      .filter((l) => (scope === "all" ? true : scope === "open" ? l.open : !l.open))
      .filter((l) => !needle || normalizeText([l.title, l.address, l.district, l.contacts?.manager].filter(Boolean).join(" ")).includes(needle))
      .sort(
        (a, b) =>
          Number(b.status === "CHOSEN") - Number(a.status === "CHOSEN") ||
          Number(b.pick === "YES") - Number(a.pick === "YES") ||
          FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
          (b.budget?.savings ?? -1e9) - (a.budget?.savings ?? -1e9),
      );
  }, [move.listings, scope, q]);

  const closedCount = move.listings.filter((l) => !l.open).length;

  if (!move.listings.length) {
    return (
      <EmptyState icon={Home} title="Aucune annonce" description="Ajoute les annonces trouvées (lien, prix, contact) ou demande à Claude de chercher et de les remplir pour toi. Chacune affiche son coût total, son trajet et ce qu'elle te laisse d'épargne.">
        <Button variant="highlight" onClick={onAdd}>
          <Plus /> Ajouter une annonce
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v as Scope)} variant="outline" size="sm">
          <ToggleGroupItem value="open">Actives ({move.summary.open})</ToggleGroupItem>
          <ToggleGroupItem value="closed">Fermées ({closedCount})</ToggleGroupItem>
          <ToggleGroupItem value="all">Toutes</ToggleGroupItem>
        </ToggleGroup>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" className="h-8 w-44" />
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "list" | "board" | "map")} variant="outline" size="sm">
            <ToggleGroupItem value="list" aria-label="Liste">
              <ListIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Tableau">
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="map" aria-label="Carte">
              <MapIcon />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/v1/moves/${move.id}/listings.csv`}>
              <Download /> Excel
            </a>
          </Button>
          <Button variant="highlight" size="sm" onClick={onAdd}>
            <Plus /> Ajouter
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <ListingTable rows={rows} currency={cur} onOpen={onOpenListing} />
      ) : view === "map" ? (
        <HousingMap move={move} listings={rows} onOpen={onOpenListing} />
      ) : (
        <Board listings={move.listings} currency={cur} onOpen={onOpenListing} showClosed={scope !== "open"} />
      )}
    </div>
  );
}

function IssueChips({ l, max = 2 }: { l: ListingView; max?: number }) {
  const shown = l.issues.filter((i) => i.level === "ko" || i.level === "warn").slice(0, max);
  if (!shown.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((i) => (
        <Badge key={i.key} size="sm" variant={i.level === "ko" ? "destructive" : "outline"}>
          {i.label.length > 40 ? `${i.label.slice(0, 38)}…` : i.label}
        </Badge>
      ))}
    </div>
  );
}

function ListingTable({ rows, currency, onOpen }: { rows: ListingView[]; currency: string; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">Rien ici.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-background">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-separator text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Annonce</th>
            <th className="px-3 py-2 text-right font-medium">Total / mois</th>
            <th className="px-3 py-2 text-right font-medium">Épargne</th>
            <th className="px-3 py-2 text-right font-medium">Trajet</th>
            <th className="px-3 py-2 font-medium">Bail</th>
            <th className="px-3 py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} onClick={() => onOpen(l.id)} className={cn("cursor-pointer border-b border-separator last:border-0 hover:bg-hover", !l.open && "opacity-60")}>
              <td className="max-w-[340px] px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  {l.pick === "YES" && <Star className="size-3.5 shrink-0 fill-warning-400 text-warning-500" />}
                  <span className="truncate font-medium">{l.title}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{[l.district ?? l.address, l.contacts?.manager].filter(Boolean).join(" · ")}</div>
                <IssueChips l={l} />
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                <div className="font-medium">{money(l.total, currency)}</div>
                {l.total !== null && l.rent !== null && !l.allInclusive && l.charges !== null && <div className="text-xs text-muted-foreground">{`${l.rent} + ${l.charges}`}</div>}
                {l.allInclusive && <div className="text-xs text-muted-foreground">tout compris</div>}
              </td>
              <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", savingsTone(l.budget?.savings))}>{l.budget ? signedMoney(l.budget.savings, currency) : "–"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {l.commuteKm !== null ? (
                  <>
                    <div>{`${l.walkMin} min`}</div>
                    <div className="text-xs text-muted-foreground">{`${l.distanceEstimated && l.lat === null ? "≈" : ""}${l.commuteKm} km${l.budget?.transport ? " · transports" : " · à pied"}`}</div>
                  </>
                ) : (
                  <span className="text-muted-foreground">–</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs">
                <div>{l.minLeaseMonths !== null ? `${l.minLeaseMonths} mois min.` : <span className="text-muted-foreground">?</span>}</div>
                <div className="text-muted-foreground">{l.availableFrom ? `dès le ${l.availableFrom}` : l.availableText ?? ""}</div>
              </td>
              <td className="px-3 py-2.5">
                <Badge size="sm" variant={STATUS_BADGE[LISTING_STATUS_META[l.status].tone]}>
                  {LISTING_STATUS_META[l.status].label}
                </Badge>
                {l.visitDate && l.status === "VISIT_PLANNED" && <div className="mt-1 text-xs text-muted-foreground">{`${l.visitDate}${l.visitTime ? ` ${l.visitTime}` : ""}`}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Board({ listings, currency, onOpen, showClosed }: { listings: ListingView[]; currency: string; onOpen: (id: string) => void; showClosed: boolean }) {
  const columns: { key: string; title: string; items: ListingView[] }[] = BOARD_STATUSES.map((s: ListingStatus) => ({ key: s, title: LISTING_STATUS_META[s].label, items: listings.filter((l) => l.status === s) }));
  if (showClosed) columns.push({ key: "closed", title: "Fermées", items: listings.filter((l) => !l.open) });
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-3">
        {columns
          .filter((c) => c.items.length || ["NEW", "SHORTLISTED", "CONTACTED", "VISIT_PLANNED"].includes(c.key))
          .map((c) => (
            <div key={c.key} className="w-64 shrink-0 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="heading-sm text-foreground">{c.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.items.length}</span>
              </div>
              <div className="min-h-24 space-y-2 rounded-2xl bg-muted-background p-2">
                {c.items.map((l) => (
                  <button key={l.id} type="button" onClick={() => onOpen(l.id)} className="block w-full rounded-xl border border-border bg-background p-2.5 text-left shadow-card transition-colors hover:bg-hover dark:shadow-none">
                    <div className="flex items-start gap-1.5">
                      {l.pick === "YES" && <Star className="mt-0.5 size-3.5 shrink-0 fill-warning-400 text-warning-500" />}
                      <span className="line-clamp-2 text-sm font-medium">{l.title}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="tabular-nums">{money(l.total, currency)}</span>
                      <span className={cn("tabular-nums", savingsTone(l.budget?.savings))}>{l.budget ? signedMoney(l.budget.savings, currency) : ""}</span>
                    </div>
                    {l.walkMin !== null && <div className="text-xs text-muted-foreground">{`${l.walkMin} min à pied`}</div>}
                    <IssueChips l={l} max={1} />
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
