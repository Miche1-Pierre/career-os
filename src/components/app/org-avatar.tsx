import { cn } from "@/lib/utils";
import { initials } from "@/lib/text";

// Sparkle-style avatar tiles: soft tinted square with initials, color derived from the name.
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

function tintFor(name: string) {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

const SIZES = {
  sm: "size-6 rounded-lg text-[10px]",
  md: "size-8 rounded-[10px] text-xs",
  lg: "size-10 rounded-xl text-sm",
  xl: "size-12 rounded-2xl text-base",
};

export function OrgAvatar({ name, size = "md", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center font-semibold tracking-tight select-none", SIZES[size], tintFor(name || "?"), className)}
    >
      {initials(name)}
    </span>
  );
}
