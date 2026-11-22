"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    notes: move?.notes ?? "",
    opportunity: { id: move?.opportunityId ?? null, name: null },
  }));
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((x) => ({ ...x, [k]: v }));

  const submit = () => {
    const payload = {
      title: s.title.trim(),
      city: s.city.trim() || null,
      country: s.country.trim() || null,
      currency: s.currency.trim().toUpperCase() || "EUR",
      arrivalDate: s.arrivalDate,
      departureDate: s.departureDate,
      workAddress: s.workAddress.trim() || null,
      notes: s.notes.trim() || null,
      opportunityId: s.opportunity.id,
    };
    if (move) run(() => updateMoveAction(move.id, payload), { success: "Saved", onSuccess: () => onOpenChange(false) });
    else run(() => createMoveAction(payload), { success: "Move created", onSuccess: (d) => (onOpenChange(false), router.push(`/moves/${d.id}`)) });
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{move ? "Edit move" : "New move"}</DialogTitle>
          <DialogDescription>Where you are going, when, and where you will work: commutes and budget are computed from it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name" htmlFor="m-title" required className="sm:col-span-2">
            <Input id="m-title" value={s.title} onChange={(e) => set("title", e.target.value)} placeholder="BlackFin · Brussels" autoFocus />
          </FormField>
          <FormField label="City" htmlFor="m-city">
            <Input id="m-city" value={s.city} onChange={(e) => set("city", e.target.value)} />
          </FormField>
          <FormField label="Country" htmlFor="m-country">
            <Input id="m-country" value={s.country} onChange={(e) => set("country", e.target.value)} />
          </FormField>
          <FormField label="Arrival / start" htmlFor="m-from">
            <DateInput id="m-from" value={s.arrivalDate} onChange={(v) => set("arrivalDate", v)} />
          </FormField>
          <FormField label="End (if known)" htmlFor="m-to">
            <DateInput id="m-to" value={s.departureDate} onChange={(v) => set("departureDate", v)} />
          </FormField>
          <FormField label="Workplace address" htmlFor="m-work" className="sm:col-span-2" hint="Located automatically (OpenStreetMap) to compute walking times.">
            <Input id="m-work" value={s.workAddress} onChange={(e) => set("workAddress", e.target.value)} placeholder="Avenue Louise 106, 1050 Ixelles" />
          </FormField>
          <FormField label="Currency" htmlFor="m-cur">
            <Input id="m-cur" value={s.currency} maxLength={3} onChange={(e) => set("currency", e.target.value)} />
          </FormField>
          {!move && opportunities.length > 0 && (
            <FormField label="Linked application" className="sm:col-span-1">
              <EntityCombobox options={opportunities} value={s.opportunity} onChange={(v) => set("opportunity", v)} placeholder="Optional" allowCreate={false} />
            </FormField>
          )}
          <FormField label="Notes" htmlFor="m-notes" className="sm:col-span-2">
            <Textarea id="m-notes" value={s.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="highlight" onClick={submit} disabled={!s.title.trim() || pending}>
            {move ? "Save" : "Create"}
          </Button>
        </DialogFooter>
    </>
  );
}
