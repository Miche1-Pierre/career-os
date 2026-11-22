"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Briefcase, CalendarDays, ChevronRight, Home, MapPin, MoreHorizontal, Pencil, PiggyBank, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/app/page-header";
import { List, ListIcon, SectionHeader, ValueCard } from "@/components/app/sparkle";
import { useConfirm } from "@/components/app/confirm";
import { useAppData } from "@/components/app/app-data";
import { useAction } from "@/hooks/use-action";
import { archiveMoveAction, deleteMoveAction, updateMoveAction } from "@/app/actions/moves";
import { MOVE_STATUSES, MOVE_STATUS_LABEL, type MoveStatus } from "@/lib/relocation";
import { addDays, formatISODate } from "@/lib/dates";
import type { ListingView, MoveView } from "@/server/services/moves";
import { cn } from "@/lib/utils";
import { useChat } from "@/components/chat/chat-dock";
import { HousingView } from "./housing-view";
import { BudgetView } from "./budget-view";
import { ListingSheet } from "./listing-sheet";
import { ListingFormDialog } from "./listing-form";
import { MoveFormDialog } from "./move-form";
import { money, savingsTone, signedMoney } from "./format";

export function MoveDetail({ move, initialTab, initialListing }: { move: MoveView; initialTab: string; initialListing: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();
  const chat = useChat();
  const { run } = useAction();
  const { dateLocale } = useAppData();
  const [tab, setTab] = useState(initialTab);
  const [listingId, setListingId] = useState<string | null>(initialListing);
  const [editing, setEditing] = useState<ListingView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [moveFormOpen, setMoveFormOpen] = useState(false);
  const listing = move.listings.find((l) => l.id === listingId) ?? null;
  const cur = move.currency;

  const syncUrl = (t: string, l: string | null) => {
    const p = new URLSearchParams();
    if (t !== "overview") p.set("tab", t);
    if (l) p.set("listing", l);
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  const changeTab = (t: string) => {
    setTab(t);
    syncUrl(t, null);
    setListingId(null);
  };
  const openListing = (id: string | null) => {
    setListingId(id);
    syncUrl(tab, id);
  };
  const addListing = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const dates =
    move.arrivalDate || move.departureDate
      ? [move.arrivalDate ? formatISODate(move.arrivalDate, "medium", dateLocale) : "?", move.departureDate ? formatISODate(move.departureDate, "medium", dateLocale) : null].filter(Boolean).join(" → ")
      : null;

  return (
    <PageContainer wide className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/moves" className="hover:text-foreground">
          Installations
        </Link>
        <ChevronRight className="size-3.5 text-faint" />
        <span className="truncate">{move.title}</span>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge size="sm" variant="info">
              {MOVE_STATUS_LABEL[move.status]}
            </Badge>
            {move.archivedAt && <Badge size="sm">Archivé</Badge>}
          </div>
          <h1 className="heading-2xl text-foreground">{move.title}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 copy-sm text-muted-foreground">
            {(move.city || move.country) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {[move.city, move.country].filter(Boolean).join(", ")}
              </span>
            )}
            {dates && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {dates}
                {move.stayMonths ? ` · ${move.stayMonths} mois` : ""}
              </span>
            )}
            {move.opportunityId && (
              <Link href={`/applications/${move.opportunityId}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <Briefcase className="size-3.5" />
                {move.organizationName ?? move.opportunityTitle}
              </Link>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={move.status} onValueChange={(v) => run(() => updateMoveAction(move.id, { status: v as MoveStatus }), { success: "Statut mis à jour" })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOVE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {MOVE_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => chat.mention({ type: "move", id: move.id, label: move.title, href: `/moves/${move.id}` })}>
            <Sparkles /> Demander à Claude
          </Button>
          <Button variant="outline" onClick={() => setMoveFormOpen(true)}>
            <Pencil /> Modifier
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost-secondary" size="icon" aria-label="Plus d'actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => run(() => archiveMoveAction(move.id, !move.archivedAt), { success: move.archivedAt ? "Désarchivé" : "Archivé" })}>
                {move.archivedAt ? <ArchiveRestore /> : <Archive />} {move.archivedAt ? "Désarchiver" : "Archiver"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: "Supprimer cette installation ?", description: "Ses annonces et son budget sont supprimés avec elle.", destructive: true, confirmLabel: "Supprimer" }))
                    run(() => deleteMoveAction(move.id), { success: "Installation supprimée", onSuccess: () => router.push("/moves") });
                }}
              >
                <Trash2 /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Aperçu</TabsTrigger>
          <TabsTrigger value="housing">
            Logement {move.summary.open > 0 && <span className="text-xs text-muted-foreground tabular-nums">{move.summary.open}</span>}
          </TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <Overview move={move} onTab={changeTab} onOpenListing={(id) => (changeTab("housing"), openListing(id))} onEdit={() => setMoveFormOpen(true)} />
        </TabsContent>
        <TabsContent value="housing" className="pt-5">
          <HousingView move={move} onOpenListing={openListing} onAdd={addListing} />
        </TabsContent>
        <TabsContent value="budget" className="pt-5">
          <BudgetView move={move} />
        </TabsContent>
      </Tabs>

      <ListingSheet
        listing={listing}
        open={!!listing}
        onOpenChange={(o) => !o && openListing(null)}
        currency={cur}
        workAddress={move.workAddress}
        onEdit={(l) => {
          setEditing(l);
          setFormOpen(true);
        }}
      />
      <ListingFormDialog open={formOpen} onOpenChange={setFormOpen} moveId={move.id} listing={editing} currency={cur} onSaved={(id) => !editing && openListing(id)} />
      <MoveFormDialog open={moveFormOpen} onOpenChange={setMoveFormOpen} move={move} />
    </PageContainer>
  );
}

function Overview({ move, onTab, onOpenListing, onEdit }: { move: MoveView; onTab: (t: string) => void; onOpenListing: (id: string) => void; onEdit: () => void }) {
  const { today, dateLocale } = useAppData();
  const s = move.summary;
  const cur = move.currency;
  const chosen = s.chosen ? move.listings.find((l) => l.id === s.chosen!.id) : null;

  const actions: { key: string; icon: typeof Home; tone?: "warning" | "highlight" | "info"; title: string; sub?: string; onClick: () => void }[] = [];
  if (!move.workAddress) actions.push({ key: "work", icon: TriangleAlert, tone: "warning", title: "Ajouter l'adresse du lieu de travail", sub: "Nécessaire pour les temps de marche et les frais de transport", onClick: onEdit });
  if (!move.budgetPlan.income) actions.push({ key: "income", icon: PiggyBank, tone: "warning", title: "Renseigner ton revenu net", sub: "L'épargne de chaque logement en dépend", onClick: () => onTab("budget") });
  for (const l of move.listings) {
    if (l.status === "VISIT_PLANNED" && l.visitDate && l.visitDate >= today)
      actions.push({ key: `v${l.id}`, icon: CalendarDays, tone: "info", title: `Visite · ${l.title}`, sub: `${formatISODate(l.visitDate, "medium", dateLocale)}${l.visitTime ? ` à ${l.visitTime}` : ""}`, onClick: () => onOpenListing(l.id) });
  }
  for (const l of move.listings) {
    if (l.status === "SHORTLISTED") actions.push({ key: `c${l.id}`, icon: Home, tone: "highlight", title: `Contacter · ${l.title}`, sub: [l.contacts?.app ? "site / app" : null, l.contacts?.email ? "email" : null, l.contacts?.phone || l.contacts?.whatsapp ? "téléphone" : null].filter(Boolean).join(" · ") || "pas encore de contact", onClick: () => onOpenListing(l.id) });
    if (l.status === "CONTACTED" && l.contactedAt && l.contactedAt <= addDays(today, -3))
      actions.push({ key: `f${l.id}`, icon: Home, title: `Relancer · ${l.title}`, sub: `Contacté le ${formatISODate(l.contactedAt, "dayMonth", dateLocale)}, pas de réponse notée`, onClick: () => onOpenListing(l.id) });
  }
  const fresh = move.listings.filter((l) => l.status === "NEW");
  if (fresh.length)
    actions.push({
      key: "review",
      icon: Home,
      tone: "highlight",
      title: `Trier ${fresh.length} nouvelle${fresh.length > 1 ? "s" : ""} annonce${fresh.length > 1 ? "s" : ""}`,
      sub: "Mets une étoile à tes préférées, puis passe celles à contacter en « À contacter »",
      onClick: () => onTab("housing"),
    });

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <ValueCard
          title="Arrivée"
          icon={CalendarDays}
          value={s.daysUntilArrival === null ? "–" : s.daysUntilArrival > 0 ? `${s.daysUntilArrival} jours` : s.daysUntilArrival === 0 ? "Aujourd'hui" : "Arrivé"}
          subtitle={move.arrivalDate ? formatISODate(move.arrivalDate, "long", dateLocale) : "Date non définie"}
        />
        <ValueCard
          title="Logement"
          icon={Home}
          variant={chosen ? "default" : s.open ? "highlight" : "default"}
          value={chosen ? money(chosen.total, cur) : `${s.open}`}
          subtitle={chosen ? chosen.title : `annonces actives · ${s.toContact} à contacter · ${s.visitsPlanned} visites`}
        />
        <ValueCard
          title={chosen ? "Épargne / mois" : "Meilleure épargne / mois"}
          icon={PiggyBank}
          value={<span className={cn(savingsTone(chosen?.budget?.savings ?? s.bestSavings?.savings))}>{chosen?.budget ? signedMoney(chosen.budget.savings, cur) : s.bestSavings ? signedMoney(s.bestSavings.savings, cur) : "–"}</span>}
          subtitle={chosen ? "avec le logement choisi" : s.bestSavings ? s.bestSavings.title : "Ajoute des annonces avec un prix"}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader title="Prochaines étapes" count={actions.length} />
        {actions.length ? (
          <List>
            {actions.slice(0, 12).map((a) => (
              <button key={a.key} type="button" onClick={a.onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover">
                <ListIcon icon={a.icon} tone={a.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.title}</span>
                  {a.sub && <span className="block truncate text-xs text-muted-foreground">{a.sub}</span>}
                </span>
                <ChevronRight className="size-4 text-faint" />
              </button>
            ))}
          </List>
        ) : (
          <p className="copy-sm text-muted-foreground">Rien en attente. Ajoute des annonces dans Logement, ou demande à Claude de chercher pour toi dans le chat.</p>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <SectionHeader title="Lieu de travail" />
          <p className="copy-sm">{move.workAddress ?? <span className="text-muted-foreground">Non renseigné</span>}</p>
          {move.workAddress && move.workLat === null && <p className="text-xs text-warning-700">Adresse non localisée : les temps de marche utilisent les distances saisies sur chaque annonce.</p>}
        </div>
        {move.notes && (
          <div className="space-y-2">
            <SectionHeader title="Notes" />
            <p className="copy-sm whitespace-pre-line text-muted-foreground">{move.notes}</p>
          </div>
        )}
      </section>
    </div>
  );
}
