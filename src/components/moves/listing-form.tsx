"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput, FormField, NumberInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { createListingAction, updateListingAction } from "@/app/actions/moves";
import { FURNISHED, HOUSING_TYPES, HOUSING_TYPE_LABEL, type Furnished, type HousingType, type ListingContacts } from "@/lib/relocation";
import type { HousingListing } from "@/server/db/schema";

interface FormState {
  title: string;
  url: string;
  type: HousingType | "";
  address: string;
  district: string;
  distanceKm: number | null;
  rent: number | null;
  charges: number | null;
  allInclusive: boolean;
  chargesInclude: string;
  deposit: number | null;
  depositText: string;
  availableFrom: string | null;
  minLeaseMonths: number | null;
  leaseText: string;
  furnished: Furnished;
  roomSizeM2: number | null;
  privateBathroom: boolean;
  housemates: number | null;
  housemateProfile: string;
  contacts: ListingContacts;
  notes: string;
}

const empty: FormState = {
  title: "",
  url: "",
  type: "",
  address: "",
  district: "",
  distanceKm: null,
  rent: null,
  charges: null,
  allInclusive: false,
  chargesInclude: "",
  deposit: null,
  depositText: "",
  availableFrom: null,
  minLeaseMonths: null,
  leaseText: "",
  furnished: "UNKNOWN",
  roomSizeM2: null,
  privateBathroom: false,
  housemates: null,
  housemateProfile: "",
  contacts: {},
  notes: "",
};

function fromListing(l: HousingListing): FormState {
  return {
    title: l.title,
    url: l.url ?? "",
    type: l.type ?? "",
    address: l.address ?? "",
    district: l.district ?? "",
    distanceKm: l.distanceKm,
    rent: l.rent,
    charges: l.charges,
    allInclusive: l.allInclusive,
    chargesInclude: (l.chargesInclude ?? []).join(", "),
    deposit: l.deposit,
    depositText: l.depositText ?? "",
    availableFrom: l.availableFrom,
    minLeaseMonths: l.minLeaseMonths,
    leaseText: l.leaseText ?? "",
    furnished: l.furnished,
    roomSizeM2: l.roomSizeM2,
    privateBathroom: !!l.privateBathroom,
    housemates: l.housemates,
    housemateProfile: l.housemateProfile ?? "",
    contacts: l.contacts ?? {},
    notes: l.notes ?? "",
  };
}

const FURNISHED_LABEL: Record<Furnished, string> = { YES: "Furnished", SEMI: "Semi-furnished", NO: "Not furnished", UNKNOWN: "Unknown" };

export function ListingFormDialog({
  open,
  onOpenChange,
  moveId,
  listing,
  currency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moveId: string;
  listing?: HousingListing | null;
  currency: string;
  onSaved?: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <ListingFormBody key={listing?.id ?? "new"} onOpenChange={onOpenChange} moveId={moveId} listing={listing} currency={currency} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function ListingFormBody({
  onOpenChange,
  moveId,
  listing,
  currency,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  moveId: string;
  listing?: HousingListing | null;
  currency: string;
  onSaved?: (id: string) => void;
}) {
  const { run, pending } = useAction();
  const [f, setF] = useState<FormState>(() => (listing ? fromListing(listing) : empty));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }));
  const setContact = (key: keyof ListingContacts, value: string) => setF((s) => ({ ...s, contacts: { ...s.contacts, [key]: value || null } }));

  const submit = () => {
    const payload = {
      title: f.title.trim(),
      url: f.url.trim() || null,
      type: f.type || null,
      address: f.address.trim() || null,
      district: f.district.trim() || null,
      distanceKm: f.distanceKm,
      distanceEstimated: f.distanceKm !== null,
      rent: f.rent,
      charges: f.allInclusive && f.charges === null ? 0 : f.charges,
      allInclusive: f.allInclusive,
      chargesInclude: f.chargesInclude
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      deposit: f.deposit,
      depositText: f.depositText.trim() || null,
      availableFrom: f.availableFrom,
      minLeaseMonths: f.minLeaseMonths,
      leaseText: f.leaseText.trim() || null,
      furnished: f.furnished,
      roomSizeM2: f.roomSizeM2,
      privateBathroom: f.privateBathroom,
      housemates: f.housemates,
      housemateProfile: f.housemateProfile.trim() || null,
      contacts: f.contacts,
      notes: f.notes.trim() || null,
    };
    if (listing) {
      run(() => updateListingAction(listing.id, payload), { success: "Listing saved", onSuccess: () => (onOpenChange(false), onSaved?.(listing.id)) });
    } else {
      run(() => createListingAction({ ...payload, moveId }), {
        success: (d) => (d.created ? "Listing added" : "Already tracked: listing updated"),
        onSuccess: (d) => (onOpenChange(false), onSaved?.(d.id)),
      });
    }
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{listing ? "Edit listing" : "Add a listing"}</DialogTitle>
          <DialogDescription>Enter what the listing says. Leave a field empty when it is not stated: it will show up as a question to ask.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <FormField label="Title" htmlFor="l-title" required className="sm:col-span-2">
              <Input id="l-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Cohabs Saint-Gilles, room with private shower" autoFocus />
            </FormField>
            <FormField label="Listing link" htmlFor="l-url" className="sm:col-span-2" hint="The same link is never added twice: it updates the existing listing.">
              <Input id="l-url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
            </FormField>
            <FormField label="Type">
              <Select value={f.type || "none"} onValueChange={(v) => set("type", v === "none" ? "" : (v as HousingType))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {HOUSING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {HOUSING_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Furnished">
              <Select value={f.furnished} onValueChange={(v) => set("furnished", v as Furnished)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FURNISHED.map((x) => (
                    <SelectItem key={x} value={x}>
                      {FURNISHED_LABEL[x]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </section>

          <section className="space-y-3">
            <h3 className="heading-sm text-foreground">Cost ({currency} / month)</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Rent (without charges)" htmlFor="l-rent">
                <NumberInput id="l-rent" value={f.rent} onChange={(v) => set("rent", v)} />
              </FormField>
              <FormField label="Charges" htmlFor="l-charges">
                <NumberInput id="l-charges" value={f.charges} onChange={(v) => set("charges", v)} />
              </FormField>
              <div className="flex items-end gap-2 pb-2">
                <Switch id="l-allin" checked={f.allInclusive} onCheckedChange={(v) => set("allInclusive", v)} />
                <label htmlFor="l-allin" className="text-sm">
                  All inclusive
                </label>
              </div>
              <FormField label="Charges cover (comma separated)" htmlFor="l-incl" className="sm:col-span-3">
                <Input id="l-incl" value={f.chargesInclude} onChange={(e) => set("chargesInclude", e.target.value)} placeholder="water, gas, electricity, wifi, weekly cleaning" />
              </FormField>
              <FormField label="Deposit" htmlFor="l-dep">
                <NumberInput id="l-dep" value={f.deposit} onChange={(v) => set("deposit", v)} />
              </FormField>
              <FormField label="Deposit details" htmlFor="l-dept" className="sm:col-span-2">
                <Input id="l-dept" value={f.depositText} onChange={(e) => set("depositText", e.target.value)} placeholder="2 months of rent, blocked account" />
              </FormField>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="heading-sm text-foreground">Conditions</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Available from" htmlFor="l-av">
                <DateInput id="l-av" value={f.availableFrom} onChange={(v) => set("availableFrom", v)} />
              </FormField>
              <FormField label="Minimum lease (months)" htmlFor="l-lease">
                <NumberInput id="l-lease" value={f.minLeaseMonths} onChange={(v) => set("minLeaseMonths", v)} />
              </FormField>
              <FormField label="Room size (m²)" htmlFor="l-m2">
                <NumberInput id="l-m2" value={f.roomSizeM2} onChange={(v) => set("roomSizeM2", v)} />
              </FormField>
              <FormField label="Lease details" htmlFor="l-leaset" className="sm:col-span-3">
                <Input id="l-leaset" value={f.leaseText} onChange={(e) => set("leaseText", e.target.value)} placeholder="6-month contract, renewable" />
              </FormField>
              <FormField label="People in the home" htmlFor="l-hm">
                <NumberInput id="l-hm" value={f.housemates} onChange={(v) => set("housemates", v)} />
              </FormField>
              <FormField label="Housemates" htmlFor="l-hmp" className="sm:col-span-2">
                <Input id="l-hmp" value={f.housemateProfile} onChange={(e) => set("housemateProfile", e.target.value)} placeholder="Young professionals, interns" />
              </FormField>
              <div className="flex items-center gap-2">
                <Switch id="l-bath" checked={f.privateBathroom} onCheckedChange={(v) => set("privateBathroom", v)} />
                <label htmlFor="l-bath" className="text-sm">
                  Private bathroom
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="heading-sm text-foreground">Location</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Address" htmlFor="l-addr" className="sm:col-span-2" hint="Located automatically to compute the commute.">
                <Input id="l-addr" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Rue Jourdan 155, 1060 Saint-Gilles" />
              </FormField>
              <FormField label="Neighbourhood" htmlFor="l-dist">
                <Input id="l-dist" value={f.district} onChange={(e) => set("district", e.target.value)} />
              </FormField>
              <FormField label="Distance to work (km)" htmlFor="l-km" hint="Only if the address is unknown.">
                <NumberInput id="l-km" value={f.distanceKm} onChange={(v) => set("distanceKm", v)} step={0.1} />
              </FormField>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="heading-sm text-foreground">Contact (in order of preference)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="1. Website / app" htmlFor="l-app">
                <Input id="l-app" value={f.contacts.app ?? ""} onChange={(e) => setContact("app", e.target.value)} placeholder="https://cohabs.com" />
              </FormField>
              <FormField label="2. Email" htmlFor="l-mail">
                <Input id="l-mail" value={f.contacts.email ?? ""} onChange={(e) => setContact("email", e.target.value)} />
              </FormField>
              <FormField label="3. Phone" htmlFor="l-phone">
                <Input id="l-phone" value={f.contacts.phone ?? ""} onChange={(e) => setContact("phone", e.target.value)} />
              </FormField>
              <FormField label="WhatsApp" htmlFor="l-wa">
                <Input id="l-wa" value={f.contacts.whatsapp ?? ""} onChange={(e) => setContact("whatsapp", e.target.value)} />
              </FormField>
              <FormField label="Agency / owner" htmlFor="l-mgr" className="sm:col-span-2">
                <Input id="l-mgr" value={f.contacts.manager ?? ""} onChange={(e) => setContact("manager", e.target.value)} />
              </FormField>
            </div>
          </section>

          <FormField label="Notes" htmlFor="l-notes">
            <Textarea id="l-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="highlight" onClick={submit} disabled={!f.title.trim() || pending}>
            {listing ? "Save" : "Add listing"}
          </Button>
        </DialogFooter>
    </>
  );
}
