"use client";

import { useState } from "react";
import { MapPinned, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlaceInput } from "@/components/app/place-input";
import { useAction } from "@/hooks/use-action";
import { addPlaceAction, removePlaceAction } from "@/app/actions/moves";
import type { MoveView } from "@/server/services/moves";

/** Places that matter besides the workplace (club, station, school…): shown on the map, with walking times per listing. */
export function PlacesPanel({ move }: { move: MoveView }) {
  const { run, pending } = useAction();
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const near = move.workLat !== null && move.workLng !== null ? { lat: move.workLat, lng: move.workLng } : null;
  const places = move.places ?? [];

  const add = () =>
    run(() => addPlaceAction(move.id, { label: label.trim(), address: address.trim(), ...(coords ?? {}) }), {
      success: "Lieu ajouté",
      onSuccess: () => {
        setLabel("");
        setAddress("");
        setCoords(null);
      },
    });

  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <p className="flex items-center gap-1.5 heading-sm text-foreground">
        <MapPinned className="size-4 text-muted-foreground" /> Lieux importants
        <span className="text-xs font-normal text-muted-foreground">: club, gare, école… avec le temps à pied depuis chaque annonce</span>
      </p>
      {places.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full bg-muted-background py-0.5 pr-1 pl-2.5 text-xs" title={p.address}>
              <span className="size-2 rounded-full bg-violet-500" />
              {p.label}
              <button type="button" disabled={pending} onClick={() => run(() => removePlaceAction(move.id, p.id), { success: "Lieu retiré" })} aria-label={`Retirer ${p.label}`} className="rounded-full p-0.5 hover:bg-hover">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom (ex. Salle de sport)" maxLength={80} />
        <PlaceInput
          value={address}
          near={near}
          onChange={(v) => {
            setAddress(v);
            setCoords(null);
          }}
          onSelect={(p) => {
            setCoords({ lat: p.lat, lng: p.lng });
            if (!label.trim() && p.kind === "poi") setLabel(p.title.slice(0, 80));
          }}
          placeholder="Adresse ou nom du lieu"
        />
        <Button variant="outline" onClick={add} disabled={pending || !label.trim() || address.trim().length < 3}>
          <Plus /> Ajouter
        </Button>
      </div>
    </div>
  );
}
