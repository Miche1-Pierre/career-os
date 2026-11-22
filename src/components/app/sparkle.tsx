/**
 * Layout primitives mirroring Dust's Sparkle design system (Counter, ValueCard, List, section headers).
 * Adapted from https://github.com/dust-tt/dust/tree/main/sparkle (MIT License, © 2022 Stanislas Polu).
 */
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const PILL_SHADOW = "drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)] [text-shadow:0px_1px_1.5px_rgba(0,0,0,0.08)]";

const counterVariants = cva("inline-flex shrink-0 items-center justify-center rounded-full tabular-nums", {
  variants: {
    size: {
      xs: "h-5 min-w-5 px-1 heading-xs",
      sm: "h-6 min-w-6 px-1 heading-sm",
    },
    variant: {
      outline: cn("border border-border bg-linear-to-b from-background to-muted-background text-muted-foreground", PILL_SHADOW),
      primary: cn("bg-linear-to-b from-primary-700 to-primary-950 text-primary-50", PILL_SHADOW),
      highlight: cn("bg-linear-to-b from-highlight-400 to-highlight-500 text-white", PILL_SHADOW),
      warning: cn("bg-linear-to-b from-warning-400 to-warning-500 text-white", PILL_SHADOW),
      info: cn("bg-linear-to-b from-info-400 to-info-500 text-white", PILL_SHADOW),
      ghost: "text-muted-foreground",
    },
  },
  defaultVariants: { size: "xs", variant: "outline" },
});

/** Numeric badge (Sparkle Counter). */
export function Counter({ value, className, ...props }: { value: number | string; className?: string } & VariantProps<typeof counterVariants>) {
  return <span className={cn(counterVariants(props), className)}>{value}</span>;
}

/** Section title with optional description, counter and action (Sparkle Page.SectionHeader). */
export function SectionHeader({
  title,
  description,
  count,
  countVariant,
  icon: Icon,
  action,
  className,
  tone,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  count?: number;
  countVariant?: VariantProps<typeof counterVariants>["variant"];
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
  tone?: "warning";
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0 space-y-0.5">
        <h2 className={cn("flex items-center gap-2 heading-base", tone === "warning" ? "text-warning-600" : "text-foreground")}>
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
          {count !== undefined && count > 0 && <Counter value={count} variant={countVariant ?? (tone === "warning" ? "warning" : "outline")} />}
        </h2>
        {description && <p className="copy-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

const valueCardVariants = cva("group/value flex flex-col gap-1.5 rounded-2xl border p-4 text-left shadow-card transition-colors duration-100 dark:shadow-none", {
  variants: {
    variant: {
      default: "border-separator bg-muted-background",
      white: "border-separator bg-background",
      warning: "border-transparent bg-warning-50",
      highlight: "border-transparent bg-highlight-50",
      info: "border-transparent bg-info-50",
    },
    interactive: {
      true: "cursor-pointer hover:bg-primary-100 active:bg-primary-150",
      false: "",
    },
  },
  compoundVariants: [
    { variant: "warning", interactive: true, className: "hover:bg-warning-100 active:bg-warning-100" },
    { variant: "highlight", interactive: true, className: "hover:bg-highlight-100 active:bg-highlight-100" },
    { variant: "info", interactive: true, className: "hover:bg-info-100 active:bg-info-100" },
  ],
  defaultVariants: { variant: "default", interactive: false },
});

/** Single metric card (Sparkle ValueCard). */
export function ValueCard({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
  variant,
  className,
  footer,
}: {
  title: React.ReactNode;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  variant?: VariantProps<typeof valueCardVariants>["variant"];
  className?: string;
  footer?: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "heading-sm truncate",
            variant === "warning" ? "text-warning-700" : variant === "highlight" ? "text-highlight-700" : variant === "info" ? "text-info-800" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        {Icon && <Icon className={cn("size-4 shrink-0", variant === "warning" ? "text-warning-500" : "text-faint")} />}
      </div>
      <div className={cn("heading-3xl tabular-nums", variant === "warning" ? "text-warning-700" : "text-foreground")}>{value}</div>
      {subtitle && <div className="copy-xs truncate text-muted-foreground">{subtitle}</div>}
      {footer}
    </>
  );
  const classes = cn(valueCardVariants({ variant, interactive: !!href }), className);
  if (href) {
    return href.startsWith("#") ? (
      <a href={href} className={classes}>
        {content}
      </a>
    ) : (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return <div className={classes}>{content}</div>;
}

/** White list panel with hairline separators (Sparkle ListItem group). */
export function List({ children, className, tone }: { children: React.ReactNode; className?: string; tone?: "warning" }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-background [&>*]:border-b [&>*]:border-separator [&>*:last-child]:border-b-0",
        tone === "warning" ? "border-warning-200/70 dark:border-warning-200" : "border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Leading visual of a list row: icon in a soft rounded tile. */
export function ListIcon({ icon: Icon, tone, className }: { icon: React.ComponentType<{ className?: string }>; tone?: "warning" | "highlight" | "info" | "success"; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[10px] border",
        tone === "warning"
          ? "border-transparent bg-warning-50 text-warning-500"
          : tone === "highlight"
            ? "border-transparent bg-highlight-50 text-highlight-500"
            : tone === "info"
              ? "border-transparent bg-info-50 text-info-700"
              : tone === "success"
                ? "border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-separator bg-muted-background text-muted-foreground dark:border-border",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
