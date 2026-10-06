import { cn } from "cn";

/**
 * Career OS mark — same visual language as the portfolio logo (pierre-michel):
 * letterforms built from flat geometric primitives, one bright color per shape.
 * "CO" + a block cursor (the OS wink): C = notched disc (green/yellow),
 * O = split ring (red/pink), cursor = half-height blue bar.
 */
export function CareerOsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 62 24" aria-hidden="true" focusable="false" className={cn("block h-[22px] w-auto shrink-0", className)}>
      <path d="M0 12 A12 12 0 0 1 23.314 8 L12 8 L12 12 Z" fill="#418B5C" />
      <path d="M23.314 16 A12 12 0 0 1 0 12 L12 12 L12 16 Z" fill="#FFAA0D" />
      <path d="M39 0 A12 12 0 0 0 39 24 L39 16.75 A4.75 4.75 0 0 1 39 7.25 Z" fill="#E14322" />
      <path d="M39 0 A12 12 0 0 1 39 24 L39 16.75 A4.75 4.75 0 0 0 39 7.25 Z" fill="#F99BC3" />
      <rect x="54" y="12" width="8" height="12" rx="1" fill="#2F6BF6" />
    </svg>
  );
}

/** Compact square variant (collapsed sidebar, avatars): the C alone. */
export function CareerOsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("block size-7 shrink-0", className)}>
      <path d="M0 12 A12 12 0 0 1 23.314 8 L12 8 L12 12 Z" fill="#418B5C" />
      <path d="M23.314 16 A12 12 0 0 1 0 12 L12 12 L12 16 Z" fill="#FFAA0D" />
      <rect x="14.5" y="9.5" width="7" height="5" rx="0.8" fill="#2F6BF6" />
    </svg>
  );
}
