"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { PlaceHit, PlaceSearchMode } from "@/lib/place-search";
import { cn } from "@/lib/utils";

/**
 * Text field that suggests places while typing, like a maps search box (OpenStreetMap data through
 * /api/places/search). Typing freely still works: picking a suggestion only fills the text and gives coordinates.
 */
export function PlaceInput({
  value,
  onChange,
  onSelect,
  mode = "address",
  near,
  placeholder,
  id,
  className,
  autoFocus,
  clearOnSelect = false,
  onKeyDown,
  onBlur,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelect?: (place: PlaceHit) => void;
  mode?: PlaceSearchMode;
  /** Bias the suggestions around this point (the destination city, the workplace…). */
  near?: { lat: number; lng: number } | null;
  placeholder?: string;
  id?: string;
  className?: string;
  autoFocus?: boolean;
  /** Empty the field after a pick (to add places to a list). */
  clearOnSelect?: boolean;
  /** Called for keys the suggestion list does not use (e.g. Enter without a highlighted suggestion). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}) {
  const [items, setItems] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    const q = text.trim();
    if (q.length < (mode === "city" ? 2 : 3)) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      request.current = ctrl;
      setLoading(true);
      try {
        const p = new URLSearchParams({ q, mode });
        if (near) {
          p.set("lat", String(near.lat));
          p.set("lng", String(near.lng));
        }
        const res = await fetch(`/api/places/search?${p}`, { signal: ctrl.signal });
        const body = (await res.json()) as { data?: PlaceHit[] };
        setItems(body.data ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted or offline: keep the free text.
      } finally {
        if (request.current === ctrl) setLoading(false);
      }
    }, 250);
  };

  const pick = (place: PlaceHit) => {
    onChange(clearOnSelect ? "" : place.label);
    onSelect?.(place);
    setItems([]);
    setOpen(false);
  };

  const shown = open && items.length > 0;
  return (
    <Popover open={shown} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn("relative", className)}>
          <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-expanded={shown}
            aria-autocomplete="list"
            placeholder={placeholder}
            className="pr-8 pl-8"
            onChange={(e) => {
              onChange(e.target.value);
              search(e.target.value);
            }}
            onFocus={() => items.length > 0 && setOpen(true)}
            onBlur={() => {
              setTimeout(() => setOpen(false), 150);
              onBlur?.();
            }}
            onKeyDown={(e) => {
              if (shown && e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % items.length);
              } else if (shown && e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
              } else if (shown && e.key === "Enter" && active >= 0) {
                e.preventDefault();
                pick(items[active]);
              } else if (shown && e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              } else onKeyDown?.(e);
            }}
          />
          {loading && <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-(--radix-popover-trigger-width) min-w-64 gap-0 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <ul role="listbox" className="max-h-72 overflow-y-auto">
          {items.map((it, i) => (
            <li
              key={`${it.label}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(it)}
              className={cn("flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5", i === active && "bg-hover")}
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{it.title}</span>
                {it.subtitle && <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-1 pb-0.5 text-[10px] text-faint">Données © OpenStreetMap</p>
      </PopoverContent>
    </Popover>
  );
}
