import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Sparkle Chip: soft tinted pill, semantic colors that flip in dark mode.
const badgeVariants = cva(
  "group/badge inline-flex w-fit max-w-full min-w-0 shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300 [a]:hover:bg-primary-150",
        secondary: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300 [a]:hover:bg-primary-150",
        highlight: "bg-highlight-50 text-highlight-700 [a]:hover:bg-highlight-100",
        success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        info: "bg-info-50 text-info-700",
        destructive: "bg-warning-50 text-warning-700 [a]:hover:bg-warning-100",
        outline: "border border-border text-muted-foreground [a]:hover:bg-hover",
        ghost: "text-muted-foreground hover:bg-hover",
        link: "text-highlight-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-6 rounded-[9px] px-[9px] heading-xs",
        sm: "h-5 rounded-lg px-1.5 text-xs font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  title,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  // Plain text is wrapped so long labels end with « … » instead of being cut; the full text stays in the tooltip.
  const isText = typeof children === "string" || typeof children === "number"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      title={title ?? (isText ? String(children) : undefined)}
      {...props}
    >
      {isText && !asChild ? <span className="min-w-0 truncate">{children}</span> : children}
    </Comp>
  )
}

export { Badge, badgeVariants }
