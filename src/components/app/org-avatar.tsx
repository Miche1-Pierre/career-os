"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/text";

// Sparkle-style avatar tiles: soft tinted square with initials, color derived from the name.
// With an organization id + website, the logo (favicon fetched server-side by /api/logos/:id) covers the tile;
// any error (no website, no icon, LOGOS=off) keeps the letters.
const TINTS = [
  "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-golden-50 text-golden-800 dark:bg-golden-950 dark:text-golden-300",
  "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "bg-lime-50 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
];

function hash(value: string) {
  let h = 0;
  for (const ch of value.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function tintFor(name: string) {
  return TINTS[hash(name) % TINTS.length];
}

const SIZES = {
  sm: "size-6 rounded-lg text-[10px]",
  md: "size-8 rounded-[10px] text-xs",
  lg: "size-10 rounded-xl text-sm",
  xl: "size-12 rounded-2xl text-base",
};

const PADDING = { sm: "p-0.5", md: "p-1", lg: "p-1.5", xl: "p-2" };

const LOGO_REV = 2;

export function OrgAvatar({
  name,
  size = "md",
  className,
  orgId,
  website,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** Organization id: enables the logo. */
  orgId?: string | null;
  /** Organization website. `null`/empty = known to have none (no request); `undefined` = unknown (the server decides). */
  website?: string | null;
}) {
  const wantsLogo = !!orgId && website !== null && website !== "";
  // LOGO_REV busts the browser cache when the server finds better logos (bump it after such a change).
  const src = wantsLogo ? `/api/logos/${orgId}?v=${website ? hash(website).toString(36) : "0"}.${LOGO_REV}` : null;
  return (
    <span aria-hidden className={cn("relative flex shrink-0 items-center justify-center overflow-hidden font-semibold tracking-tight select-none", SIZES[size], tintFor(name || "?"), className)}>
      {initials(name.replace(/[^\p{L}\p{N}\s]+/gu, " "))}
      {src && <LogoImage key={src} src={src} padding={PADDING[size]} />}
    </span>
  );
}

function LogoImage({ src, padding }: { src: string; padding: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => {
    // The image may have settled before hydration (cached response): read its state directly.
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "error");
  }, []);
  if (state === "error") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin icon, already cached and sized server-side
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setState("loaded")}
      onError={() => setState("error")}
      className={cn(
        "absolute inset-0 size-full border border-separator bg-white object-contain transition-opacity duration-150 [border-radius:inherit] dark:border-transparent",
        padding,
        state === "loaded" ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
