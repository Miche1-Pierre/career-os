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
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { mapsDirections, money, savingsTone, signedMoney } from "./format";

const FURNISHED_LABEL = { YES: "Furnished", SEMI: "Semi-furnished", NO: "Not furnished", UNKNOWN: "Unknown" } as const;

function Row({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-right text-sm", muted && "text-muted-foreground")}>{children}</span>
    </div>
  );
}

const ask = <span className="text-muted-foreground italic">to ask</span>;

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
      reason = window.prompt("Why exclude it? (kept for later comparisons)");
      if (!reason) return;
    }
    if ((status === "CHOSEN" || status === "DECLINED") && !(await confirm({ title: status === "CHOSEN" ? "Choose this home?" : "Decline this listing?", description: status === "CHOSEN" ? "The budget will use this home. You can change it later." : "It moves to the closed listings.", confirmLabel: "Confirm" })))
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
                <Star className={cn(l.pick === "YES" && "fill-current text-warning-500")} /> My top
              </Button>
              <Button variant={l.familyApproved ? "secondary" : "ghost"} size="sm" onClick={() => run(() => updateListingAction(l.id, { familyApproved: !l.familyApproved }))} aria-pressed={l.familyApproved}>
                {l.familyApproved ? "Family OK ✓" : "Family OK?"}
              </Button>
            </div>
            <SheetTitle className="heading-lg text-left">{l.title}</SheetTitle>
            <SheetDescription className="text-left">
              {[l.type ? HOUSING_TYPE_LABEL[l.type] : null, l.district ?? l.address].filter(Boolean).join(" · ") || "Housing listing"}
            </SheetDescription>
            <div className="flex flex-wrap gap-2">
              {l.url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Open listing
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onEdit(l)}>
                <Pencil /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (await confirm({ title: "Delete this listing?", description: "It disappears from the move. Use « Excluded » instead to keep a trace.", destructive: true, confirmLabel: "Delete" }))
                    run(() => deleteListingAction(l.id), { success: "Listing deleted", onSuccess: () => onOpenChange(false) });
                }}
              >
                <Trash2 /> Delete
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
              <h3 className="heading-sm text-foreground">Cost per month</h3>
              <div className="divide-y divide-separator">
                <Row label="Rent">{l.rent !== null ? money(l.rent, currency) : ask}</Row>
                <Row label="Charges">{l.charges !== null ? money(l.charges, currency) : l.allInclusive ? "Included" : ask}</Row>
                {(l.chargesInclude ?? []).length > 0 && <Row label="Charges cover" muted>{l.chargesInclude.join(", ")}</Row>}
                <Row label="Total">
                  <span className="heading-sm">{l.total !== null ? money(l.total, currency) : "–"}</span>
                </Row>
                {l.budget && (
                  <Row label="You save each month">
                    <span className={cn("heading-sm", savingsTone(l.budget.savings))}>{signedMoney(l.budget.savings, currency)}</span>
                  </Row>
                )}
                <Row label="Deposit">{l.deposit !== null ? money(l.deposit, currency) : l.depositText ?? ask}</Row>
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
                <Row label="Available">{l.availableFrom ?? l.availableText ?? ask}</Row>
                <Row label="Minimum lease">{l.minLeaseMonths !== null ? `${l.minLeaseMonths} months` : l.leaseText ?? ask}</Row>
                {l.leaseText && l.minLeaseMonths !== null && <Row label="" muted>{l.leaseText}</Row>}
                <Row label="Furnished">{l.furnished === "UNKNOWN" ? ask : FURNISHED_LABEL[l.furnished]}</Row>
                <Row label="Room">{[l.roomSizeM2 ? `${l.roomSizeM2} m²` : null, l.privateBathroom === null ? null : l.privateBathroom ? "private bathroom" : "shared bathroom"].filter(Boolean).join(" · ") || ask}</Row>
                <Row label="People in the home">{l.housemates ?? ask}</Row>
                {l.housemateProfile && <Row label="Housemates" muted>{l.housemateProfile}</Row>}
              </div>
            </section>

            <section>
              <h3 className="heading-sm text-foreground">Location</h3>
              <div className="divide-y divide-separator">
                <Row label="Address">{l.address ?? ask}</Row>
                <Row label="To work">
                  {l.commuteKm !== null ? (
                    <>
                      {l.distanceEstimated && l.lat === null ? "≈ " : ""}
                      {l.commuteKm.toLocaleString("fr-FR")} km · ~{l.walkMin} min walk
                    </>
                  ) : (
                    <span className="text-muted-foreground">Add the address</span>
                  )}
                </Row>
              </div>
              {directions && (
                <Button variant="link" size="sm" asChild className="mt-1">
                  <a href={directions} target="_blank" rel="noopener noreferrer">
                    <MapPin /> Route on Google Maps
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
                  <MessageSquareText /> Prepare a message
                </Button>
                {c.app && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={/^https?:/.test(c.app) ? c.app.split(" ")[0] : `https://www.google.com/search?q=${encodeURIComponent(c.app)}`} target="_blank" rel="noopener noreferrer">
                      <Globe /> Website / app
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
                  To ask: {unknowns.map((u) => u.label.replace(/\?$/, "").toLowerCase()).join(", ")}.
                </p>
              )}
              {l.status === "SHORTLISTED" || l.status === "NEW" ? (
                <Button variant="ghost" size="sm" onClick={() => run(() => setListingStatusAction(l.id, "CONTACTED"), { success: "Marked as contacted" })}>
                  I sent the message
                </Button>
              ) : null}
            </section>

            <section className="space-y-2">
              <h3 className="heading-sm text-foreground">Visit</h3>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <DateInput value={l.visitDate} onChange={(v) => run(() => updateListingAction(l.id, { visitDate: v }), { success: v ? "Visit planned (in the calendar)" : "Visit removed" })} />
                <TimeInput value={l.visitTime} onChange={(v) => run(() => updateListingAction(l.id, { visitTime: v }))} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="heading-sm text-foreground">Notes</h3>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (l.notes ?? "") && run(() => updateListingAction(l.id, { notes: notes || null }), { success: "Notes saved" })} rows={3} placeholder="Impressions, answers received, questions…" />
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
                <h3 className="heading-sm text-foreground">Seen on</h3>
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
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
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
          <DialogTitle>First message</DialogTitle>
          <DialogDescription>Only asks what the listing does not say. Edit it, then send it yourself.</DialogDescription>
        </DialogHeader>
        <Tabs value={lang} onValueChange={(v) => setLang(v as "fr" | "en")}>
          <TabsList>
            <TabsTrigger value="fr">Français</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
        </Tabs>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" aria-label="Subject" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={cn(pending && "opacity-60")} />
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(`${subject}\n\n${body}`)}>
              <Copy /> Copy
            </Button>
            {email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                  <Mail /> Open in mail app
                </a>
              </Button>
            )}
            {wa && (
              <Button variant="outline" size="sm" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> Open WhatsApp
                </a>
              </Button>
            )}
          </div>
          <Badge variant="outline">Nothing is sent automatically</Badge>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
