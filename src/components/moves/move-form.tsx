"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlaceInput } from "@/components/app/place-input";
import { COUNTRIES, countryInfo } from "@/lib/countries";
import { CURRENCIES } from "@/lib/fx";
import { DateInput, FormField } from "@/components/app/fields";
import { EntityCombobox, type ComboOption } from "@/components/app/entity-combobox";
import { useAction } from "@/hooks/use-action";
import { createMoveAction, updateMoveAction } from "@/app/actions/moves";
import type { Move } from "@/server/db/schema";

interface State {
  title: string;
  city: string;
  country: string;
  currency: string;
  arrivalDate: string | null;
  departureDate: string | null;
  workAddress: string;
  /** Coordinates of a picked suggestion (the server geocodes typed addresses itself). */
  workCoords: { lat: number; lng: number } | null;
  cityCoords: { lat: number; lng: number } | null;
  /** The user chose the currency: stop deriving it from the country. */
  currencyTouched: boolean;
  notes: string;
  opportunity: { id: string | null; name: string | null };
}

export function MoveFormDialog({ open, onOpenChange, move, opportunities = [] }: { open: boolean; onOpenChange: (o: boolean) => void; move?: Move | null; opportunities?: ComboOption[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <MoveFormBody key={move?.id ?? "new"} onOpenChange={onOpenChange} move={move} opportunities={opportunities} />
      </DialogContent>
    </Dialog>
  );
}

function MoveFormBody({ onOpenChange, move, opportunities }: { onOpenChange: (o: boolean) => void; move?: Move | null; opportunities: ComboOption[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [s, setS] = useState<State>(() => ({
    title: move?.title ?? "",
    city: move?.city ?? "",
    country: move?.country ?? "",
    currency: move?.currency ?? "EUR",
    arrivalDate: move?.arrivalDate ?? null,
    departureDate: move?.departureDate ?? null,
    workAddress: move?.workAddress ?? "",
    workCoords: null,
    cityCoords: move?.workLat != null && move?.workLng != null ? { lat: move.workLat, lng: move.workLng } : null,
    currencyTouched: !!move,
    notes: move?.notes ?? "",
    opportunity: { id: move?.opportunityId ?? null, name: null },
  }));
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((x) => ({ ...x, [k]: v }));
  /** Country typed or picked: the currency follows until the user picks one. */
  const setCountry = (country: string, code?: string | null) =>
    setS((x) => {
      const info = code ? COUNTRIES.find((c) => c.code === code) : countryInfo(country);
      return { ...x, country, currency: !x.currencyTouched && info ? info.currency : x.currency };
    });
  const currencies = CURRENCIES.includes(s.currency as (typeof CURRENCIES)[number]) ? [...CURRENCIES] : [s.currency, ...CURRENCIES];

  const submit = () => {
    const payload = {
      title: s.title.trim(),
      city: s.city.trim() || null,
      country: s.country.trim() || null,
      currency: s.currency.trim().toUpperCase() || "EUR",
      arrivalDate: s.arrivalDate,
      departureDate: s.departureDate,
      workAddress: s.workAddress.trim() || null,
      ...(s.workCoords ? { workLat: s.workCoords.lat, workLng: s.workCoords.lng } : {}),
      notes: s.notes.trim() || null,
      opportunityId: s.opportunity.id,
    };
    if (move) run(() => updateMoveAction(move.id, payload), { success: "Enregistré", onSuccess: () => onOpenChange(false) });
    else run(() => createMoveAction(payload), { success: "Installation créée", onSuccess: (d) => (onOpenChange(false), router.push(`/moves/${d.id}`)) });
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{move ? "Modifier l'installation" : "Nouvelle installation"}</DialogTitle>
          <DialogDescription>Où tu vas, quand, et où tu travailleras : les trajets et le budget en dépendent.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nom" htmlFor="m-title" required className="sm:col-span-2">
            <Input id="m-title" value={s.title} onChange={(e) => set("title", e.target.value)} placeholder="BlackFin · Bruxelles" autoFocus />
          </FormField>
          <FormField label="Ville" htmlFor="m-city">
            <PlaceInput
              id="m-city"
              mode="city"
              value={s.city}
              onChange={(v) => set("city", v)}
              onSelect={(p) => {
                setS((x) => ({ ...x, city: p.city ?? p.label, cityCoords: { lat: p.lat, lng: p.lng } }));
                if (p.country) setCountry(p.country, p.countryCode);
              }}
              placeholder="Bruxelles"
            />
          </FormField>
          <FormField label="Pays" htmlFor="m-country">
            <Input id="m-country" list="m-countries" value={s.country} onChange={(e) => setCountry(e.target.value)} autoComplete="off" />
            <datalist id="m-countries">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Arrivée / début" htmlFor="m-from">
            <DateInput id="m-from" value={s.arrivalDate} onChange={(v) => set("arrivalDate", v)} />
          </FormField>
          <FormField label="Fin (si connue)" htmlFor="m-to">
            <DateInput id="m-to" value={s.departureDate} onChange={(v) => set("departureDate", v)} />
          </FormField>
          <FormField label="Adresse du lieu de travail" htmlFor="m-work" className="sm:col-span-2" hint="Choisis une suggestion : elle sert aux temps de marche et à la carte.">
            <PlaceInput
              id="m-work"
              value={s.workAddress}
              near={s.cityCoords}
              onChange={(v) => setS((x) => ({ ...x, workAddress: v, workCoords: null }))}
              onSelect={(p) => set("workCoords", { lat: p.lat, lng: p.lng })}
              placeholder="Avenue Louise 106, 1050 Ixelles"
            />
          </FormField>
          <FormField label="Devise" htmlFor="m-cur" hint={s.currencyTouched ? undefined : "Suit le pays"}>
            <Select value={s.currency} onValueChange={(v) => setS((x) => ({ ...x, currency: v, currencyTouched: true }))}>
              <SelectTrigger id="m-cur" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {!move && opportunities.length > 0 && (
            <FormField label="Candidature liée" className="sm:col-span-1">
              <EntityCombobox options={opportunities} value={s.opportunity} onChange={(v) => set("opportunity", v)} placeholder="Facultatif" allowCreate={false} />
            </FormField>
          )}
          <FormField label="Notes" htmlFor="m-notes" className="sm:col-span-2">
            <Textarea id="m-notes" value={s.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="highlight" onClick={submit} disabled={!s.title.trim() || pending}>
            {move ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
    </>
  );
}
