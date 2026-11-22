"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleHelp,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Phone,
  Sparkles,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateInput, TimeInput } from "@/components/app/fields";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { deleteListingAction, draftListingMessageAction, setListingStatusAction, updateListingAction } from "@/app/actions/moves";
import { firstPhone, HOUSING_TYPE_LABEL, LISTING_STATUSES, LISTING_STATUS_META, whatsappLink, type ListingStatus } from "@/lib/relocation";
import type { ListingView } from "@/server/services/moves";
import { cn } from "@/lib/utils";
import { useChat } from "@/components/chat/chat-dock";
import { mapsDirections, money, savingsTone, signedMoney } from "./format";

const FURNISHED_LABEL = { YES: "Meublé", SEMI: "Semi-meublé", NO: "Non meublé", UNKNOWN: "Inconnu" } as const;

function Row({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-right text-sm", muted && "text-muted-foreground")}>{children}</span>
    </div>
  );
}

const ask = <span className="text-muted-foreground italic">à demander</span>;

export function ListingSheet({
  listing,
  open,
  onOpenChange,
  currency,
  workAddress,
  onEdit,
}: {
  listing: ListingView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  workAddress: string | null;
  onEdit: (l: ListingView) => void;
}) {
  const { run } = useAction();
  const confirm = useConfirm();
  const chat = useChat();
  const [notes, setNotes] = useState("");
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const notesKey = listing ? `${listing.id}:${listing.notes ?? ""}` : null;
  if (notesKey !== notesFor) {
    setNotesFor(notesKey);
    setNotes(listing?.notes ?? "");
  }
  if (!listing) return null;
  const l = listing;
  const c = l.contacts ?? {};
  const phone = firstPhone(c.whatsapp) ?? firstPhone(c.phone);
  const blocking = l.issues.filter((i) => i.level === "ko");
  const warnings = l.issues.filter((i) => i.level === "warn");
  const unknowns = l.issues.filter((i) => i.level === "unknown");
  const directions = mapsDirections(workAddress, l.address);

  const setStatus = async (status: ListingStatus) => {
    let reason: string | null = null;
    if (status === "EXCLUDED" && !l.excludedReason) {
      reason = window.prompt("Pourquoi l'écarter ? (gardé pour comparer plus tard)");
      if (!reason) return;
    }
    if ((status === "CHOSEN" || status === "DECLINED") && !(await confirm({ title: status === "CHOSEN" ? "Choisir ce logement ?" : "Refuser cette annonce ?", description: status === "CHOSEN" ? "Le budget utilisera ce logement. Tu pourras changer plus tard." : "Elle passe dans les annonces fermées.", confirmLabel: "Confirmer" })))
      return;
    run(() => setListingStatusAction(l.id, status, reason), { success: `${LISTING_STATUS_META[status].label}` });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="space-y-2 border-b border-separator pb-4">
            <div className="flex items-center gap-2 pr-8">
              <Select value={l.status} onValueChange={(v) => setStatus(v as ListingStatus)}>
                <SelectTrigger size="sm" className="w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LISTING_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={l.pick === "YES" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => run(() => updateListingAction(l.id, { pick: l.pick === "YES" ? null : "YES" }))}
                aria-pressed={l.pick === "YES"}
              >
                <Star className={cn(l.pick === "YES" && "fill-current text-warning-500")} /> Mon top
              </Button>
              <Button variant={l.familyApproved ? "secondary" : "ghost"} size="sm" onClick={() => run(() => updateListingAction(l.id, { familyApproved: !l.familyApproved }))} aria-pressed={l.familyApproved}>
                {l.familyApproved ? "Validé famille ✓" : "Validé famille ?"}
              </Button>
            </div>
            <SheetTitle className="heading-lg text-left">{l.title}</SheetTitle>
            <SheetDescription className="text-left">
              {[l.type ? HOUSING_TYPE_LABEL[l.type] : null, l.district ?? l.address].filter(Boolean).join(" · ") || "Annonce de logement"}
            </SheetDescription>
            <div className="flex flex-wrap gap-2">
              {l.url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Ouvrir l’annonce
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => chat.mention({ type: "listing", id: l.id, label: l.title, href: `/moves/${l.moveId}?tab=housing&listing=${l.id}` })}
              >
                <Sparkles /> Demander à Claude
              </Button>
              <Button variant="outline" size="sm" onClick={() => onEdit(l)}>
                <Pencil /> Modifier
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (await confirm({ title: "Supprimer cette annonce ?", description: "Elle disparaît de l'installation. Choisis plutôt « Écarté » pour en garder une trace.", destructive: true, confirmLabel: "Supprimer" }))
                    run(() => deleteListingAction(l.id), { success: "Annonce supprimée", onSuccess: () => onOpenChange(false) });
                }}
              >
                <Trash2 /> Supprimer
              </Button>
            </div>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-8">
            {(blocking.length > 0 || warnings.length > 0) && (
              <div className="space-y-1.5 rounded-xl bg-warning-50 p-3">
                {[...blocking, ...warnings].map((i) => (
                  <p key={i.key + i.label} className="flex items-start gap-2 text-sm text-warning-700">
                    {i.level === "ko" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                    {i.label}
                  </p>
                ))}
              </div>
            )}

            <section>
              <h3 className="heading-sm text-foreground">Coût par mois</h3>
              <div className="divide-y divide-separator">
                <Row label="Loyer">{l.rent !== null ? money(l.rent, currency) : ask}</Row>
                <Row label="Charges">{l.charges !== null ? money(l.charges, currency) : l.allInclusive ? "Inclus" : ask}</Row>
                {(l.chargesInclude ?? []).length > 0 && <Row label="Les charges couvrent" muted>{l.chargesInclude.join(", ")}</Row>}
                <Row label="Total">
                  <span className="heading-sm">{l.total !== null ? money(l.total, currency) : "–"}</span>
                </Row>
                {l.budget && (
                  <Row label="Épargne chaque mois">
                    <span className={cn("heading-sm", savingsTone(l.budget.savings))}>{signedMoney(l.budget.savings, currency)}</span>
                  </Row>
                )}
                <Row label="Garantie">{l.deposit !== null ? money(l.deposit, currency) : l.depositText ?? ask}</Row>
                {(l.fees ?? []).map((f) => (
                  <Row key={f.label} label={f.label}>
                    {money(f.amount, currency)}
                  </Row>
                ))}
              </div>
            </section>

            <section>
              <h3 className="heading-sm text-foreground">Conditions</h3>
              <div className="divide-y divide-separator">
                <Row label="Disponible">{l.availableFrom ?? l.availableText ?? ask}</Row>
                <Row label="Bail minimum">{l.minLeaseMonths !== null ? `${l.minLeaseMonths} mois` : l.leaseText ?? ask}</Row>
                {l.leaseText && l.minLeaseMonths !== null && <Row label="" muted>{l.leaseText}</Row>}
                <Row label="Meublé">{l.furnished === "UNKNOWN" ? ask : FURNISHED_LABEL[l.furnished]}</Row>
                <Row label="Chambre">{[l.roomSizeM2 ? `${l.roomSizeM2} m²` : null, l.privateBathroom === null ? null : l.privateBathroom ? "salle de bain privée" : "salle de bain partagée"].filter(Boolean).join(" · ") || ask}</Row>
                <Row label="Personnes dans le logement">{l.housemates ?? ask}</Row>
                {l.housemateProfile && <Row label="Colocataires" muted>{l.housemateProfile}</Row>}
              </div>
            </section>

            <section>
              <h3 className="heading-sm text-foreground">Emplacement</h3>
              <div className="divide-y divide-separator">
                <Row label="Adresse">{l.address ?? ask}</Row>
                <Row label="Trajet jusqu'au travail">
                  {l.commuteKm !== null ? (
                    <>
                      {l.distanceEstimated && l.lat === null ? "≈ " : ""}
                      {l.commuteKm.toLocaleString("fr-FR")} km · ~{l.walkMin} min à pied
                    </>
                  ) : (
                    <span className="text-muted-foreground">Ajoute l’adresse</span>
                  )}
                </Row>
              </div>
              {directions && (
                <Button variant="link" size="sm" asChild className="mt-1">
                  <a href={directions} target="_blank" rel="noopener noreferrer">
                    <MapPin /> Itinéraire sur Google Maps
                  </a>
                </Button>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="heading-sm text-foreground">Contact</h3>
                {c.manager && <span className="text-xs text-muted-foreground">{c.manager}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="highlight" size="sm" onClick={() => setMessageOpen(true)}>
                  <MessageSquareText /> Préparer un message
                </Button>
                {c.app && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={/^https?:/.test(c.app) ? c.app.split(" ")[0] : `https://www.google.com/search?q=${encodeURIComponent(c.app)}`} target="_blank" rel="noopener noreferrer">
                      <Globe /> Site / app
                    </a>
                  </Button>
                )}
                {c.email && (
                  <Button variant="outline" size="sm" onClick={() => copy(c.email!)}>
                    <Mail /> {c.email}
                  </Button>
                )}
                {phone && (
                  <Button variant="outline" size="sm" onClick={() => copy(phone)}>
                    <Phone /> {phone}
                  </Button>
                )}
              </div>
              {unknowns.length > 0 && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CircleHelp className="mt-0.5 size-3.5 shrink-0" />
                  À demander : {unknowns.map((u) => u.label.replace(/\?$/, "").toLowerCase()).join(", ")}.
                </p>
              )}
              {l.status === "SHORTLISTED" || l.status === "NEW" ? (
                <Button variant="ghost" size="sm" onClick={() => run(() => setListingStatusAction(l.id, "CONTACTED"), { success: "Marqué comme contacté" })}>
                  J’ai envoyé le message
                </Button>
              ) : null}
            </section>

            <section className="space-y-2">
              <h3 className="heading-sm text-foreground">Visite</h3>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <DateInput value={l.visitDate} onChange={(v) => run(() => updateListingAction(l.id, { visitDate: v }), { success: v ? "Visite planifiée (dans le calendrier)" : "Visite retirée" })} />
                <TimeInput value={l.visitTime} onChange={(v) => run(() => updateListingAction(l.id, { visitTime: v }))} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="heading-sm text-foreground">Notes</h3>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (l.notes ?? "") && run(() => updateListingAction(l.id, { notes: notes || null }), { success: "Notes enregistrées" })} rows={3} placeholder="Impressions, réponses reçues, questions…" />
              {l.history.length > 0 && (
                <ol className="space-y-1 border-l border-separator pl-3">
                  {[...l.history].reverse().slice(0, 12).map((h, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{h.at.slice(0, 10)}</span> · {h.text}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {l.sources.length > 1 && (
              <section className="space-y-1">
                <h3 className="heading-sm text-foreground">Vu sur</h3>
                {l.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-highlight-600 hover:underline">
                    {s.name}
                  </a>
                ))}
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <MessageDialog open={messageOpen} onOpenChange={setMessageOpen} listing={l} phone={phone} />
    </>
  );
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copié"),
    () => toast.error("Copie impossible"),
  );
}

function MessageDialog({ open, onOpenChange, listing, phone }: { open: boolean; onOpenChange: (o: boolean) => void; listing: ListingView; phone: string | null }) {
  const { run, pending } = useAction();
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => {
    if (!open) return;
    run(() => draftListingMessageAction(listing.id, lang), {
      onSuccess: (d) => {
        setSubject(d.subject);
        setBody(d.body);
      },
    });
  }, [open, lang, listing.id, run]);
  const email = listing.contacts?.email;
  const wa = phone ? whatsappLink(phone, body) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Premier message</DialogTitle>
          <DialogDescription>Ne demande que ce que l’annonce ne dit pas. Modifie-le, puis envoie-le toi-même.</DialogDescription>
        </DialogHeader>
        <Tabs value={lang} onValueChange={(v) => setLang(v as "fr" | "en")}>
          <TabsList>
            <TabsTrigger value="fr">Français</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Objet" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={cn(pending && "opacity-60")} />
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(`${subject}\n\n${body}`)}>
              <Copy /> Copier
            </Button>
            {email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                  <Mail /> Ouvrir dans la messagerie
                </a>
              </Button>
            )}
            {wa && (
              <Button variant="outline" size="sm" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> Ouvrir WhatsApp
                </a>
              </Button>
            )}
          </div>
          <Badge variant="outline">Rien n’est envoyé automatiquement</Badge>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
