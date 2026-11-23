"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { ListingView, MoveView } from "@/server/services/moves";
import { money } from "./format";

const FIT_COLOR: Record<ListingView["fit"], string> = { ok: "#16a34a", unknown: "#2563eb", warn: "#d97706", ko: "#a8a29e" };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Map of the move (CARTO basemap, OpenStreetMap data): the workplace, a walking-distance circle and every located listing
 * (colour = fit: green OK, blue to check, amber warning, grey blocking). Click a pin to open the listing.
 */
export function HousingMap({ move, listings, onOpen }: { move: MoveView; listings: ListingView[]; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((L) => {
      if (disposed || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: true, attributionControl: true });
      // CARTO basemaps (OpenStreetMap data): light or dark to match the theme. OSM's own tile servers refuse apps
      // that do not identify themselves, and their policy discourages app use.
      const dark = document.documentElement.classList.contains("dark");
      L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "voyager"}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 19,
        subdomains: "abcd",
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      }).addTo(map);
      const points: [number, number][] = [];
      if (move.workLat !== null && move.workLng !== null) {
        const work: [number, number] = [move.workLat, move.workLng];
        points.push(work);
        L.circle(work, { radius: move.budgetPlan.walkThresholdKm * 1000, color: "#2563eb", weight: 1, fillOpacity: 0.05, dashArray: "4 4" }).addTo(map);
        L.marker(work, {
          icon: L.divIcon({ className: "", html: '<div style="background:#111827;color:#fff;border-radius:8px;padding:2px 6px;font:600 11px/16px system-ui;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)">Travail</div>', iconAnchor: [24, 10] }),
        })
          .bindTooltip(escapeHtml(move.workAddress ?? "Lieu de travail"))
          .addTo(map);
      }
      for (const l of listings) {
        if (l.lat === null || l.lng === null) continue;
        const p: [number, number] = [l.lat, l.lng];
        points.push(p);
        const label = `${escapeHtml(l.title)}<br/>${l.total !== null ? money(l.total, move.currency) : "prix ?"}${l.walkMin !== null ? ` · ${l.walkMin} min à pied` : ""}`;
        L.circleMarker(p, { radius: l.pick === "YES" ? 9 : 7, color: "#fff", weight: 2, fillColor: FIT_COLOR[l.fit], fillOpacity: 0.95 })
          .bindTooltip(label)
          .on("click", () => onOpenRef.current(l.id))
          .addTo(map);
      }
      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
      else if (points.length === 1) map.setView(points[0], 14);
      else map.setView([50.8466, 4.3528], 12);
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [move, listings]);

  const located = listings.filter((l) => l.lat !== null).length;
  return (
    <div className="space-y-2">
      <div ref={ref} className="h-[520px] w-full overflow-hidden rounded-2xl border border-border" />
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {located}/{listings.length} annonces localisées
        </span>
        {(
          [
            ["ok", "compatible"],
            ["unknown", "à vérifier"],
            ["warn", "point d'attention"],
            ["ko", "bloquant"],
          ] as const
        ).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: FIT_COLOR[k] }} />
            {label}
          </span>
        ))}
        <span>Cercle : distance à pied ({move.budgetPlan.walkThresholdKm} km)</span>
      </p>
    </div>
  );
}
