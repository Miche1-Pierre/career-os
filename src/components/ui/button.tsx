import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Sparkle (Dust) button recipe: raised gradient surfaces, hover as a translucent ::after overlay,
// 24/28/32/40px heights with 9/10/12/15px radii, a subtle press scale.
const OVERLAY =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-colors disabled:after:hidden"
const TEXT_SHADOW = "[text-shadow:0_1px_1.5px_rgba(0,0,0,0.08)] [&_svg]:drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)]"

const buttonVariants = cva(
  "group/button relative isolate inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,transform] duration-100 ease-out motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:not-aria-[haspopup]:scale-[0.985] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: cn(
          OVERLAY,
          TEXT_SHADOW,
          "bg-linear-to-b from-primary-700 to-primary-800 text-primary-50 shadow-raised hover:after:bg-white/10",
          "dark:from-stone-50 dark:to-stone-150 dark:shadow-[inset_0_0_1px_0_rgba(255,255,255,0.5),0_0_0.5px_0_var(--border),0_1px_1.5px_0_rgba(0,0,0,0.1)] dark:hover:after:bg-black/[0.04]"
        ),
        highlight: cn(
          OVERLAY,
          TEXT_SHADOW,
          "bg-linear-to-b from-highlight-400 to-highlight-500 text-white shadow-raised hover:after:bg-white/10",
          "dark:from-blue-500 dark:to-blue-600"
        ),
        destructive: cn(
          OVERLAY,
          TEXT_SHADOW,
          "bg-linear-to-b from-warning-400 to-warning-500 text-white shadow-raised hover:after:bg-white/10",
          "dark:from-red-500 dark:to-red-600"
        ),
        outline: cn(
          OVERLAY,
          "overflow-hidden border border-border bg-linear-to-b from-primary-50 to-primary-100 text-muted-foreground after:rounded-none",
          "shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--border),0_0.5px_1px_0_rgba(0,0,0,0.06)]",
          "hover:text-foreground hover:after:bg-black/[0.02] aria-expanded:text-foreground aria-expanded:after:bg-black/[0.03]",
          "dark:border-stone-775 dark:from-stone-800 dark:to-stone-800 dark:text-primary-900 dark:hover:after:bg-white/[0.03]"
        ),
        secondary:
          "bg-primary-100 text-foreground hover:bg-primary-150 aria-expanded:bg-primary-150 dark:bg-stone-800 dark:hover:bg-stone-775",
        ghost:
          "text-foreground hover:bg-hover aria-expanded:bg-selected dark:hover:bg-white/[0.08]",
        "ghost-secondary":
          "text-muted-foreground hover:bg-hover hover:text-foreground aria-expanded:bg-selected aria-expanded:text-foreground dark:hover:bg-white/[0.08]",
        "highlight-ghost": "text-highlight-500 hover:bg-highlight-50",
        "destructive-ghost": "text-warning-500 hover:bg-warning-50",
        link: "h-auto! px-0! text-highlight-600 underline-offset-4 hover:text-highlight-700 hover:underline active:scale-100 dark:text-highlight-500",
      },
      size: {
        default:
          "h-8 gap-1.5 rounded-xl px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-[9px] px-2 text-sm leading-4 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-7 gap-1.5 rounded-[10px] px-2.5 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-10 gap-2 rounded-[15px] px-4 text-base has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5 [&_svg:not([class*='size-'])]:size-5",
        icon: "size-8 rounded-xl",
        "icon-xs": "size-6 rounded-[9px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 rounded-[10px]",
        "icon-lg": "size-10 rounded-[15px] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
