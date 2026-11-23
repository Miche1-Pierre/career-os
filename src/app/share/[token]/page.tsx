import type { Metadata } from "next";
import { CalendarDays, ExternalLink, Footprints, Heart, House, MapPin, ShieldCheck, Star } from "lucide-react";
import { getSharedMove, type SharedListing } from "@/server/services/shares";
import { HOUSING_TYPE_LABEL, type Furnished } from "@/lib/relocation";
import { formatISODate } from "@/lib/dates";
import { money, signedMoney, savingsTone } from "@/components/moves/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Logements partagés",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const FURNISHED_TEXT: Record<Furnished, string | null> = { YES: "Meublé", SEMI: "Semi-meublé", NO: "Non meublé", UNKNOWN: null };

/** Read-only shortlist for the family (link made in the app: Logement › Partager). */
export default async function SharedShortlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedMove(token);
  if (!shared) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <House className="size-8 text-faint" />
        <h1 className="heading-lg text-foreground">Lien indisponible</h1>
        <p className="copy-sm text-muted-foreground">Ce lien a expiré ou a été désactivé. Demande un nouveau lien à la personne qui te l’a envoyé.</p>
      </main>
    );
  }
  const dates = [shared.arrivalDate, shared.departureDate].filter(Boolean).map((d) => formatISODate(d!, "medium", "fr-FR"));
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 print:py-0">
      <header className="space-y-2">
        <p className="label-xs text-muted-foreground">Logement · lecture seule</p>
        <h1 className="heading-2xl text-foreground">{shared.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 copy-sm text-muted-foreground">
          {(shared.city || shared.country) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {[shared.city, shared.country].filter(Boolean).join(", ")}
            </span>
          )}
          {dates.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {dates.join(" → ")}
            </span>
          )}
          <span>
            {shared.listings.length} annonce{shared.listings.length > 1 ? "s" : ""} en cours
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1 print:hidden">
          <PrintButton />
          <span className="text-xs text-faint">Montants en {shared.currency}, par mois sauf mention contraire.</span>
        </div>
      </header>

      {shared.listings.length ? (
        <div className="space-y-3">
          {shared.listings.map((l) => (
            <ListingCard key={l.id} l={l} currency={shared.currency} showSavings={shared.showSavings} />
          ))}
        </div>
      ) : (
        <p className="copy-sm text-muted-foreground">Aucune annonce en cours pour l’instant.</p>
      )}

      <footer className="border-t border-separator pt-4 text-xs text-faint">
        Partagé depuis Career OS le {formatISODate(shared.updatedAt.slice(0, 10), "long", "fr-FR")}. Les contacts des propriétaires et les notes personnelles ne sont pas partagés.
      </footer>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function ListingCard({ l, currency, showSavings }: { l: SharedListing; currency: string; showSavings: boolean }) {
  const breakdown = l.allInclusive ? "tout compris" : l.rent !== null && l.charges !== null ? `${money(l.rent, currency)} + ${money(l.charges, currency)} de charges` : null;
  const available = l.availableFrom ? `dès le ${formatISODate(l.availableFrom, "medium", "fr-FR")}` : l.availableText;
  const shownIssues = l.issues.filter((i) => i.level === "ko" || i.level === "warn");
  return (
    <article className="surface-list break-inside-avoid space-y-3 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-1.5 heading-base text-foreground">
            {l.pick === "YES" && <Star className="size-4 shrink-0 fill-warning-400 text-warning-500" aria-label="Favori" />}
            {l.url ? (
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline">
                <span className="truncate">{l.title}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground print:hidden" />
              </a>
            ) : (
              <span className="truncate">{l.title}</span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">{[l.type ? HOUSING_TYPE_LABEL[l.type] : null, l.district].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {l.status === "CHOSEN" && (
            <Badge size="sm" variant="success">
              Choisi
            </Badge>
          )}
          {l.familyApproved && (
            <Badge size="sm" variant="info">
              <Heart className="size-3" /> Validé en famille
            </Badge>
          )}
          {l.status !== "CHOSEN" && <Badge size="sm">{l.statusLabel}</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground">Total / mois</p>
          <p className="heading-xl text-foreground tabular-nums">{money(l.total, currency)}</p>
          {breakdown && <p className="text-xs text-muted-foreground">{breakdown}</p>}
        </div>
        {showSavings && l.savings !== null && (
          <div>
            <p className="text-xs text-muted-foreground">Épargne / mois</p>
            <p className={cn("heading-lg tabular-nums", savingsTone(l.savings))}>{signedMoney(l.savings, currency)}</p>
          </div>
        )}
        {l.walkMin !== null && (
          <p className="inline-flex items-center gap-1 pb-0.5 text-sm text-foreground">
            <Footprints className="size-4 text-muted-foreground" />
            {l.walkMin} min à pied du travail
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Fact label="Disponible" value={available} />
        <Fact label="Bail minimum" value={l.minLeaseMonths !== null ? `${l.minLeaseMonths} mois` : null} />
        <Fact label="Garantie" value={l.deposit !== null ? money(l.deposit, currency) : l.depositText} />
        <Fact label="Meublé" value={FURNISHED_TEXT[l.furnished]} />
        <Fact label="Chambre" value={l.roomSizeM2 !== null ? `${l.roomSizeM2} m²` : null} />
        <Fact label="Salle de bain" value={l.privateBathroom === null ? null : l.privateBathroom ? "Privée" : "Partagée"} />
        <Fact label="Colocataires" value={l.housemates !== null ? String(l.housemates) : null} />
        <Fact label="Charges comprises" value={l.chargesInclude.length ? l.chargesInclude.join(", ") : null} />
      </dl>

      {shownIssues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shownIssues.map((i) => (
            <Badge key={i.key + i.label} size="sm" variant={i.level === "ko" ? "destructive" : "outline"}>
              {i.label}
            </Badge>
          ))}
        </div>
      )}
      {l.fit === "ok" && !shownIssues.length && (
        <p className="inline-flex items-center gap-1 text-xs text-success-700">
          <ShieldCheck className="size-3.5" /> Dates, bail et ameublement compatibles
        </p>
      )}
    </article>
  );
}
